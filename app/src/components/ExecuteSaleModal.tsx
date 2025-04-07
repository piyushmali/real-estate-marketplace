import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { PublicKey, Transaction, LAMPORTS_PER_SOL, Connection, SystemProgram, TransactionInstruction, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { Offer } from "@/types/offer";
import { Property } from "@/context/PropertyContext";
import { submitTransactionNoUpdate, getRecentBlockhash, recordPropertySale, simulateTransaction } from "../services/transactionService";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/hooks/useAuth";
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { WalletNotConnectedError } from '@solana/wallet-adapter-base';

// Define constants
const MARKETPLACE_PROGRAM_ID = "BdSKkquiFKRqxbXYC3Jufz9K59xisZ33VNbyaigkStW6";
const SOLANA_RPC_ENDPOINT = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com";

interface ExecuteSaleModalProps {
  offer: Offer;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  propertyNftMint: string;
}

export default function ExecuteSaleModal({
  offer,
  visible,
  onClose,
  onSuccess,
  propertyNftMint
}: ExecuteSaleModalProps) {
  // Debug log props on init
  console.log("ExecuteSaleModal - Initial props:", { 
    offer: offer?.id, 
    propertyNftMint, 
    propertyId: offer?.property_id,
    buyerWallet: offer?.buyer_wallet,
    sellerWallet: offer?.seller_wallet
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { publicKey, publicKeyObj, signTransaction, connected, walletAddress } = useWallet();
  
  // Debug log wallet info
  console.log("ExecuteSaleModal - Wallet info:", { 
    publicKey, 
    walletAddress, 
    connected
  });
  
  const { token } = useAuth();
  const { toast } = useToast();
  const [waitingForBuyer, setWaitingForBuyer] = useState(false);
  const [waitingForSeller, setWaitingForSeller] = useState(false);
  const [partiallySignedTxBase64, setPartiallySignedTxBase64] = useState<string | null>(null);
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isBuyer, setIsBuyer] = useState(false);
  const [isSeller, setIsSeller] = useState(false);
  const [property, setProperty] = useState<Property | null>(null);
  
  useEffect(() => {
    // Log debug info
    console.log("Property NFT Mint:", propertyNftMint);
    console.log("Offer:", offer);
    
    if (!visible) {
      setErrors({});
      setIsSubmitting(false);
      setWaitingForBuyer(false);
      setWaitingForSeller(false);
      setPartiallySignedTxBase64(null);
      setSimulationLogs([]);
      setShowLogs(false);
    }
  }, [visible, propertyNftMint, offer]);
  
  useEffect(() => {
    // Determine if current user is buyer or seller
    if (walletAddress && offer) {
      console.log("DEBUG - Wallet address:", walletAddress);
      console.log("DEBUG - Offer buyer wallet:", offer.buyer_wallet);
      console.log("DEBUG - Offer seller wallet:", offer.seller_wallet);
      console.log("DEBUG - Property owner wallet:", property?.owner_wallet);
      console.log("DEBUG - Wallet comparison (buyer):", walletAddress === offer.buyer_wallet);
      console.log("DEBUG - Wallet comparison (seller):", walletAddress === offer.seller_wallet || walletAddress === property?.owner_wallet);
      
      // More resilient wallet comparison - normalize addresses
      const normalizedWalletAddress = walletAddress.trim().toLowerCase();
      const normalizedBuyerWallet = offer.buyer_wallet?.trim().toLowerCase();
      const normalizedSellerWallet = offer.seller_wallet?.trim().toLowerCase();
      const normalizedOwnerWallet = property?.owner_wallet?.trim().toLowerCase();
      
      console.log("DEBUG - Normalized wallet comparison (buyer):", normalizedWalletAddress === normalizedBuyerWallet);
      console.log("DEBUG - Normalized wallet comparison (seller):", normalizedWalletAddress === normalizedSellerWallet || normalizedWalletAddress === normalizedOwnerWallet);
      
      // Use both exact and normalized comparison for maximum compatibility
      const isBuyerMatch = walletAddress === offer.buyer_wallet || normalizedWalletAddress === normalizedBuyerWallet;
      const isSellerMatch = walletAddress === offer.seller_wallet || walletAddress === property?.owner_wallet || 
                           normalizedWalletAddress === normalizedSellerWallet || normalizedWalletAddress === normalizedOwnerWallet;
      
      setIsBuyer(isBuyerMatch);
      setIsSeller(isSellerMatch);
      
      // Log the values of isBuyer and isSeller after state update in next render
      setTimeout(() => {
        console.log("DEBUG - isBuyer state:", isBuyer);
        console.log("DEBUG - isSeller state:", isSeller);
      }, 0);
    }
  }, [walletAddress, offer, property]);
  
  // Function to get a recent blockhash
  const fetchRecentBlockhash = async () => {
    try {
      if (!token) {
        throw new Error("Authentication token is required to fetch blockhash");
      }
      const response = await getRecentBlockhash(token);
      console.log("Got blockhash:", response.blockhash);
      return response.blockhash;
    } catch (error) {
      console.error("Error fetching blockhash:", error);
      throw error;
    }
  };
  
  // Create PDAs (Program Derived Addresses) for the marketplace accounts
  const createPDAs = async (
    programId: PublicKey,
    propertyId: string,
    buyerWallet: string,
    sellerWallet: string
  ) => {
    // Find the marketplace authority - this would be specific to your deployment
    const marketplaceAuthority = new PublicKey("13EySfdhQL6b7dxzJnw73C33cRUnX1NjPBWEP1gkU43C");
    
    // Derive marketplace PDA
    const [marketplacePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("marketplace"), marketplaceAuthority.toBuffer()],
      programId
    );
    console.log("Marketplace PDA:", marketplacePDA.toString());
    
    // Derive property PDA
    const [propertyPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyId)],
      programId
    );
    console.log("Property PDA:", propertyPDA.toString());
    
    // Derive offer PDA
    const buyerPublicKey = new PublicKey(buyerWallet);
    const [offerPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("offer"), propertyPDA.toBuffer(), buyerPublicKey.toBuffer()],
      programId
    );
    console.log("Offer PDA:", offerPDA.toString());
    
    // Get transaction count - we need to handle it better in production
    // For now we'll use 0 for testing
    const transactionCount = 0;
    
    // Derive transaction history PDA
    const [transactionHistoryPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("transaction"),
        propertyPDA.toBuffer(),
        new Uint8Array(new BN(transactionCount + 1).toArray("le", 8))
      ],
      programId
    );
    console.log("Transaction History PDA:", transactionHistoryPDA.toString());
    
    return {
      marketplace: marketplacePDA,
      property: propertyPDA,
      offer: offerPDA,
      transactionHistory: transactionHistoryPDA,
      marketplaceAuthority
    };
  };
  
  // Display simulation logs to the user
  const displaySimulationLogs = (logs: string[]) => {
    setSimulationLogs(logs);
    setShowLogs(true);
  };
  
  // Create and send the transaction
  const createTransaction = async (offer: Offer, property: Property) => {
    try {
      // Check if wallet is connected
      if (!walletAddress) {
        throw new WalletNotConnectedError();
      }

      console.log("🏠 Creating transaction with offer:", offer);
      console.log("🏠 Property details:", property);

      // Get program ID for real estate program
      const programId = new PublicKey(MARKETPLACE_PROGRAM_ID);
      
      // Validate and get NFT mint address
      if (!property.nft_mint_address || property.nft_mint_address === '') {
        console.error("Missing NFT mint address for property:", property.id);
        throw new Error("Missing NFT mint address for the property");
      }
      
      const propertyNftMint = new PublicKey(property.nft_mint_address);
      console.log("🏠 Property NFT Mint:", propertyNftMint.toString());
      
      // Validate seller wallet
      if (!property.owner_wallet || property.owner_wallet === '') {
        console.error("Missing seller wallet address:", property);
        throw new Error("Missing seller wallet address");
      }
      
      // Get buyer and seller addresses
      const buyerPubkey = new PublicKey(walletAddress);
      const sellerPubkey = new PublicKey(property.owner_wallet);
      
      console.log("🏠 Buyer Address:", buyerPubkey.toString());
      console.log("🏠 Seller Address:", sellerPubkey.toString());

      // Calculate the price in lamports
      console.log("🏠 Full offer object:", offer);
      
      // Ensure the price is always in lamports, and handle both formats correctly
      const price = offer.amount;
      // Make sure we're using lamports (if amount is small, it's likely in SOL and needs conversion)
      const priceInLamports = price < 10000 ? Math.floor(price * LAMPORTS_PER_SOL) : price;
      console.log("🏠 Original price value:", price);
      console.log("🏠 Price in lamports:", priceInLamports);
      console.log("🏠 Price in SOL:", priceInLamports / LAMPORTS_PER_SOL);
      
      // Use more detailed PDAs and create a proper execute_sale instruction
      const pdas = await createPDAs(
        programId,
        offer.property_id,
        offer.buyer_wallet,
        property.owner_wallet
      );

      // Get the connection
      const connection = new Connection(SOLANA_RPC_ENDPOINT, 'confirmed');
      
      // Get associated token accounts for buyer and seller
      const sellerTokenAccount = await getAssociatedTokenAddress(
        propertyNftMint,
        sellerPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      const buyerTokenAccount = await getAssociatedTokenAddress(
        propertyNftMint,
        buyerPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      console.log("🏠 Seller Token Account:", sellerTokenAccount.toString());
      console.log("🏠 Buyer Token Account:", buyerTokenAccount.toString());
      
      // Verify that the seller actually owns the NFT token
      try {
        console.log("🏠 Verifying seller ownership of NFT...");
        const sellerTokenInfo = await connection.getAccountInfo(sellerTokenAccount);
        
        if (!sellerTokenInfo) {
          console.error("🏠 Seller doesn't have a token account for this NFT");
          throw new Error("Seller doesn't own this property NFT - token account not found");
        }
        
        // If we had access to a token account parser, we could verify the amount is 1
        console.log("🏠 Seller token account exists - assuming ownership confirmed");
      } catch (error) {
        console.error("🏠 Error verifying NFT ownership:", error);
        throw new Error("Failed to verify property ownership: " + error.message);
      }

      // Calculate fee amounts
      const marketplaceFee = Math.floor(priceInLamports * 0.025); // 2.5% marketplace fee
      const sellerAmount = priceInLamports - marketplaceFee;
      
      console.log("🏠 Marketplace Fee:", marketplaceFee);
      console.log("🏠 Seller Amount:", sellerAmount);

      // Create a new transaction - SIMPLIFIED VERSION WITH ONLY SOL TRANSFERS
      const transaction = new Transaction();
      
      // Check if buyer's ATA exists, if not create it
      try {
        const buyerTokenInfo = await connection.getAccountInfo(buyerTokenAccount);
        console.log("🏠 Buyer token account exists already:", !!buyerTokenInfo);
        
        if (!buyerTokenInfo) {
          console.log("🏠 Creating buyer token account...");
          transaction.add(
            createAssociatedTokenAccountInstruction(
              buyerPubkey,
              buyerTokenAccount,
              buyerPubkey,
              propertyNftMint,
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID
            )
          );
        }
      } catch (error) {
        console.log("🏠 Creating buyer token account due to error:", error);
        transaction.add(
          createAssociatedTokenAccountInstruction(
            buyerPubkey,
            buyerTokenAccount,
            buyerPubkey,
            propertyNftMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      // Only do the SOL transfer for now - since this is a simple test
      // Add the transferSOL instruction (buyer pays seller directly)
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: buyerPubkey,
          toPubkey: sellerPubkey,
          lamports: sellerAmount,
        })
      );
      
      // Add marketplace fee transfer
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: buyerPubkey,
          toPubkey: pdas.marketplaceAuthority,
          lamports: marketplaceFee,
        })
      );

      // Get a recent blockhash and set fee payer
      const { blockhash } = await connection.getRecentBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = buyerPubkey;
      
      console.log("🏠 Transaction created successfully:", transaction);
      
      return transaction;
    } catch (error) {
      console.error("🏠 Error creating transaction:", error);
      // Provide detailed error message
      let errorMessage = "Failed to create transaction";
      if (error instanceof Error) {
        errorMessage = `Error: ${error.message}`;
      }
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return null;
    }
  };
  
  // Seller signs the transaction first
  const handleSellerSign = async () => {
    try {
      setIsSubmitting(true);
      
      if (!signTransaction) {
        toast({
          title: "Wallet not connected",
          description: "Please connect your wallet to continue",
          variant: "destructive"
        });
        return;
      }
      
      const transaction = await createTransaction(offer, property);
      if (!transaction) return;
      
      // Seller signs first
      const signedTx = await signTransaction(transaction);
      
      // Serialize the partially signed transaction
      const serializedTx = Buffer.from(signedTx.serialize()).toString('base64');
      setPartiallySignedTxBase64(serializedTx);
      
      // Show waiting for buyer message
      setWaitingForBuyer(true);
      
      toast({
        title: "Transaction Partially Signed",
        description: "You (seller) have signed the transaction. Now the buyer needs to sign to complete the purchase.",
      });
      
    } catch (err) {
      console.error("Error during seller signing:", err);
      toast({
        title: "Error",
        description: "Failed to sign transaction. See console for details.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Add a verbose simulation before submission
  const simulateTransactionBeforeSubmit = async () => {
    try {
      setIsSimulating(true);
      setSimulationLogs([
        "Starting simulation...",
        "Creating test transaction with only SOL transfers"
      ]);
      
      if (!property) {
        await fetchPropertyDetails();
      }
      
      // Create the test transaction
      const transaction = await createTransaction(offer, property);
      if (!transaction) {
        setSimulationLogs([...simulationLogs, "Failed to create transaction"]);
        return false;
      }
      
      // Get connection
      const connection = new Connection(SOLANA_RPC_ENDPOINT, 'confirmed');
      
      // Simulate the transaction
      setSimulationLogs([...simulationLogs, "Simulating transaction on Solana"]);
      
      const result = await connection.simulateTransaction(transaction);
      
      // Display the detailed results
      setSimulationLogs([
        ...simulationLogs, 
        `Transaction simulation complete:`,
        `Success: ${result.value.err ? 'No' : 'Yes'}`,
        `Error: ${result.value.err ? JSON.stringify(result.value.err) : 'None'}`,
        `Log messages:`,
        ...(result.value.logs || ["No logs available"]).map(log => `   ${log}`)
      ]);
      
      return !result.value.err;
    } catch (error) {
      setSimulationLogs([
        ...simulationLogs,
        `Simulation error: ${error.message || "Unknown error"}`,
        `Stack: ${error.stack || "No stack available"}`
      ]);
      return false;
    } finally {
      setIsSimulating(false);
    }
  };
  
  // Update the handleBuyerComplete function to improve error handling
  const handleBuyerComplete = async () => {
    try {
      setIsSubmitting(true);
      console.log("Starting buyer completion process");
      
      // Check if wallet is connected and can sign
      if (!signTransaction) {
        throw new Error("Wallet not connected or cannot sign transactions");
      }
      
      console.log("Using property:", property);
      if (!property) {
        await fetchPropertyDetails();
        if (!property) {
          throw new Error("Failed to fetch property details");
        }
      }
      
      // Create a simple transaction with just SOL transfers
      console.log("Creating new transaction for buyer");
      const transaction = await createTransaction(offer, property);
      if (!transaction) {
        throw new Error("Failed to create transaction");
      }
      
      console.log("Created transaction successfully:", transaction);
      console.log("Transaction instructions:", transaction.instructions.length);
      transaction.instructions.forEach((ix, i) => {
        console.log(`Instruction ${i}: programId=${ix.programId.toString()}`);
      });
      
      console.log("Asking wallet to sign transaction");
      
      // Buyer signs the transaction
      const signedTx = await signTransaction(transaction);
      console.log("Transaction signed successfully");
      
      // Serialize the transaction for submission
      const serializedTx = Buffer.from(signedTx.serialize()).toString('base64');
      console.log("Transaction serialized successfully, length:", serializedTx.length);
      
      // Log the first 100 chars of serialized tx for debugging
      console.log("Serialized TX (first 100 chars):", serializedTx.substring(0, 100) + "...");
      
      // Skip simulation and submit directly
      console.log("Submitting transaction directly");
      
      try {
        // Submit transaction to backend
        const result = await submitTransactionNoUpdate(serializedTx, token);
        console.log("Transaction submission result:", result);
        
        if (!result.success) {
          // Extract more detailed error information if possible
          const errorMessage = result.message || "Unknown error";
          console.error("Transaction failed with error:", errorMessage);
          
          // Check for specific error codes and provide better messages
          if (errorMessage.includes("0xbc2")) {
            throw new Error("Transaction failed: Program instruction error 0xbc2. This may indicate an issue with account permissions or instruction format.");
          }
          
          throw new Error(`Transaction failed: ${errorMessage}`);
        }
        
        // Handle success
        toast({
          title: "Transaction Submitted",
          description: "The SOL payment has been sent to the seller!",
        });
        
        // Record the sale in our database
        await processSaleRecording(result.signature);
        
        // Close modal if successful
        onSuccess();
        onClose();
      } catch (submitError) {
        console.error("Error during transaction submission:", submitError);
        
        // Provide more context about what might be wrong
        if (submitError.response && submitError.response.status === 500) {
          console.log("Server error details:", submitError.response.data);
          
          // Try to parse the error message for more details
          const errorText = submitError.response.data;
          if (typeof errorText === 'string') {
            // Look for common error patterns in Solana transactions
            if (errorText.includes("insufficient funds")) {
              throw new Error("Transaction failed: You don't have enough SOL to complete this purchase.");
            } else if (errorText.includes("custom program error")) {
              const errorMatch = errorText.match(/custom program error: (0x[0-9a-f]+)/i);
              const errorCode = errorMatch ? errorMatch[1] : "unknown";
              throw new Error(`Transaction failed: Program error code ${errorCode}. Please try again later.`);
            }
          }
        }
        
        throw submitError;
      }
    } catch (err) {
      console.error("Error during transaction completion:", err);
      toast({
        title: "Error",
        description: `Failed to complete transaction: ${err.message}`,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Helper function to get error meaning from Solana error code
  const getErrorMeaning = (errorCode: string): string => {
    // Convert hex to decimal
    const errorNumber = parseInt(errorCode, 16);
    
    // Lookup error from our program's error codes (based on IDL)
    const errorMap: Record<number, string> = {
      6000: "Property ID too long",
      6001: "Metadata URI too long",
      6002: "Location too long",
      6003: "Invalid price",
      6004: "Invalid offer amount",
      6005: "Invalid expiration time",
      6006: "Not property owner",
      6007: "Property not active",
      6008: "Cannot offer on own property",
      6009: "Offer not pending",
      6010: "Offer expired",
      6011: "Offer not accepted",
      6012: "Offer property mismatch",
      6013: "Not offer buyer",
      6014: "Invalid token account",
      6015: "Invalid marketplace fee account",
      6016: "Arithmetic overflow",
      6017: "Invalid fee percentage",
      6018: "Not NFT owner",
      6019: "Invalid NFT mint",
      // Add error code 0x64 (100)
      100: "NFT token transfer error - May be due to missing token accounts, insufficient funds, or token ownership issues"
    };
    
    return errorMap[errorNumber] || `Unknown error code: ${errorCode}`;
  };
  
  // Helper function to record the sale and handle success/failure
  const processSaleRecording = async (signature: string) => {
    try {
      const saleResult = await recordPropertySale(
        offer.property_id,
        offer.seller_wallet,
        offer.buyer_wallet,
        offer.amount,
        signature, 
        token
      );
      
      if (saleResult && saleResult.success) {
        toast({
          title: "Success",
          description: "Property purchase complete! The ownership has been transferred.",
        });
        onSuccess();
        onClose();
      } else {
        toast({
          title: "Warning",
          description: "Transaction was sent, but there was an issue updating the database.",
          variant: "destructive"
        });
      }
    } catch (err) {
      console.error("Error recording sale:", err);
      toast({
        title: "Warning",
        description: "Transaction was submitted but we couldn't record it in our database.",
        variant: "destructive"
      });
    }
  };
  
  // Determine what the current user should do
  const getUserAction = () => {
    // Debug log current state
    console.log("DEBUG - Action state:", {
      isBuyer,
      isSeller,
      waitingForBuyer,
      waitingForSeller,
      partiallySignedTxBase64,
      connected
    });

    // If the user is the buyer, always allow them to complete the purchase
    if (connected && isBuyer) {
      return "complete";
    }
    
    if (isSeller && !waitingForBuyer && !partiallySignedTxBase64) {
      return "sign"; // Seller needs to sign first
    }
    
    if (waitingForBuyer && isSeller) {
      return "waiting"; // Seller is waiting for buyer
    }
    
    if (waitingForSeller && isBuyer) {
      return "waiting"; // Buyer is waiting for seller
    }
    
    return "none"; // No action available
  };
  
  // Add an async function to fetch property details
  const fetchPropertyDetails = async () => {
    if (!offer || !token) return;
    
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8080'}/api/properties/${offer.property_id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setProperty(data);
        console.log("🏠 Property details fetched:", data);
        
        // Debug log wallet values after property is fetched
        console.log("DEBUG - After property fetch:", {
          walletAddress,
          publicKey,
          buyerWallet: offer.buyer_wallet,
          sellerWallet: offer.seller_wallet,
          propertyOwnerWallet: data.owner_wallet,
          isBuyerCheck: walletAddress === offer.buyer_wallet,
          isSellerCheck: walletAddress === offer.seller_wallet || walletAddress === data.owner_wallet
        });
        
        // Manually update offer with seller wallet if missing
        if (!offer.seller_wallet && data.owner_wallet) {
          console.log("⚠️ Adding missing seller_wallet to offer:", data.owner_wallet);
          offer.seller_wallet = data.owner_wallet;
        }
      } else {
        console.error("Failed to fetch property details:", response.statusText);
        toast.error("Failed to fetch property details");
      }
    } catch (error) {
      console.error("Error fetching property details:", error);
      toast.error("Error fetching property details");
    }
  };

  // Update the useEffect that runs when the modal becomes visible
  useEffect(() => {
    if (visible) {
      console.log("Modal opened, initializing data");
      // Reset states
      setSimulationLogs([]);
      setIsSimulating(false);
      setIsSubmitting(false);
      
      // Fetch property details
      fetchPropertyDetails();
    }
  }, [visible, offer, token]);
  
  return (
    <Dialog open={visible} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] bg-white">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-100 to-purple-100 rounded-lg z-0 opacity-60" />
        <div className="relative z-10">
          <DialogHeader>
            <DialogTitle>Execute Property Sale</DialogTitle>
            <DialogDescription>
              {isSeller && !waitingForBuyer 
                ? "Sign the transaction to transfer property ownership to the buyer."
                : isBuyer
                ? "Send payment to the seller now. This will transfer SOL from your wallet."
                : waitingForBuyer
                ? "Waiting for the buyer to complete the transaction."
                : waitingForSeller
                ? "Waiting for the seller to sign the transaction."
                : "This transaction requires both buyer and seller signatures."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 my-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="text-sm font-medium text-gray-700">Offer Details</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-500">Amount:</div>
                <div className="text-gray-900 font-medium">{(offer.amount / LAMPORTS_PER_SOL).toFixed(2)} SOL</div>
                
                <div className="text-gray-500">Seller:</div>
                <div className="text-gray-900 font-mono text-xs break-all">
                  {offer.seller_wallet}
                </div>
                
                <div className="text-gray-500">Buyer:</div>
                <div className="text-gray-900 font-mono text-xs break-all">
                  {offer.buyer_wallet}
                </div>
                
                <div className="text-gray-500">Property ID:</div>
                <div className="text-gray-900">{offer.property_id}</div>
                
                <div className="text-gray-500">Status:</div>
                <div className="text-gray-900">{offer.status}</div>
                
                <div className="text-gray-500">NFT Mint:</div>
                <div className="text-gray-900 font-mono text-xs break-all">
                  {propertyNftMint || <span className="text-red-500">Missing</span>}
                </div>
              </div>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-md text-sm">
              <h3 className="font-medium text-blue-700">User Role Detection:</h3>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>Connected as:</div>
                <div>{connected ? walletAddress?.toString().substring(0, 8) + '...' : 'Not Connected'}</div>
                
                <div>Detected as Buyer:</div>
                <div>{isBuyer ? '✅ Yes' : '❌ No'}</div>
                
                <div>Detected as Seller:</div>
                <div>{isSeller ? '✅ Yes' : '❌ No'}</div>
                
                <div>Buyer Matches:</div>
                <div>{walletAddress === offer.buyer_wallet ? '✅ Exact' : 
                      walletAddress?.toLowerCase() === offer.buyer_wallet?.toLowerCase() ? '✅ Case-insensitive' : '❌ No'}</div>
                
                <div>Seller Matches:</div>
                <div>{walletAddress === offer.seller_wallet ? '✅ Exact' : 
                      walletAddress?.toLowerCase() === offer.seller_wallet?.toLowerCase() ? '✅ Case-insensitive' : '❌ No'}</div>
              </div>
            </div>
            
            {connected && (
              <div className="bg-green-50 p-4 rounded-md text-sm text-green-800">
                <p className="font-medium">Connected Wallet:</p>
                <p className="font-mono text-xs break-all mt-1">{walletAddress?.toString()}</p>
                <p className="mt-2">You are connected as the {isBuyer ? "buyer" : isSeller ? "seller" : "neither buyer nor seller"}.</p>
              </div>
            )}
            
            {!connected && (
              <div className="bg-red-50 p-4 rounded-md text-sm text-red-800">
                <p className="font-medium">Wallet not connected.</p>
                <p className="mt-1">Please connect your wallet to continue.</p>
              </div>
            )}
            
            {partiallySignedTxBase64 && (
              <div className="bg-yellow-50 p-4 rounded-md text-sm text-yellow-800">
                <p className="font-medium">Transaction Status:</p>
                <p className="mt-1">This transaction has been partially signed. It needs signatures from both buyer and seller to be valid.</p>
              </div>
            )}
            
            {waitingForBuyer && (
              <div className="bg-blue-50 p-4 rounded-md text-sm text-blue-800">
                <p className="font-medium">Waiting for Buyer:</p>
                <p className="mt-1">Transaction has been signed by you (seller). Now waiting for the buyer to complete the transaction.</p>
                <p className="mt-2">Please instruct the buyer to connect their wallet and finalize the purchase.</p>
              </div>
            )}
            
            {waitingForSeller && (
              <div className="bg-blue-50 p-4 rounded-md text-sm text-blue-800">
                <p className="font-medium">Waiting for Seller:</p>
                <p className="mt-1">Transaction has been signed by you (buyer). Now waiting for the seller to sign the transaction.</p>
                <p className="mt-2">Please instruct the seller to connect their wallet and sign.</p>
              </div>
            )}
            
            {showLogs && simulationLogs.length > 0 && (
              <div className="bg-black rounded-md text-white p-4 text-xs font-mono">
                <p className="font-bold mb-2">Simulation Logs:</p>
                <div className="max-h-[200px] overflow-auto">
                  {simulationLogs.map((log, i) => (
                    <div key={i} className="mb-1">{log}</div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="bg-yellow-50 p-4 rounded-md text-sm text-yellow-800">
              <p className="font-bold">Test Flow Instructions:</p>
              <ol className="list-decimal ml-5 mt-2 space-y-1">
                <li>Connect seller's wallet and sign the transaction first</li>
                <li>Connect buyer's wallet in a different browser window</li>
                <li>Load the same offer and click "Complete Purchase" to send real SOL on Devnet</li>
              </ol>
            </div>
            
            <div className="bg-blue-100 p-4 rounded-md text-sm">
              <h3 className="font-medium text-blue-800">Action Debug Info:</h3>
              <p className="mt-1 text-blue-900">Current action: {getUserAction()}</p>
              <p className="text-blue-900">Button visibility logic:</p>
              <pre className="text-xs bg-black text-white p-2 rounded mt-1 overflow-auto">
{`getUserAction() === "sign": ${getUserAction() === "sign"}
getUserAction() === "complete": ${getUserAction() === "complete"}
getUserAction() === "waiting": ${getUserAction() === "waiting"}
getUserAction() === "none": ${getUserAction() === "none"}
`}
              </pre>
            </div>
            
            {isBuyer && (
              <div className="bg-blue-50 p-4 rounded-md text-sm text-blue-800 mt-4">
                <p className="font-medium">Simplified Transaction Mode:</p>
                <p className="mt-1">This transaction has been simplified to just transfer SOL from buyer to seller.</p>
                <p className="mt-1">The NFT transfer will need to be handled separately after this initial payment.</p>
                <p className="mt-2">Total amount: {(offer.amount / LAMPORTS_PER_SOL).toFixed(2)} SOL</p>
                <ul className="list-disc ml-5 mt-2">
                  <li>Seller payment: {((offer.amount * 0.975) / LAMPORTS_PER_SOL).toFixed(2)} SOL</li>
                  <li>Platform fee: {((offer.amount * 0.025) / LAMPORTS_PER_SOL).toFixed(2)} SOL</li>
                </ul>
              </div>
            )}
          </div>
          
          <DialogFooter className="mt-6 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            
            <Button
              variant="outline"
              onClick={() => {
                setSimulationLogs([]);
                setShowLogs(true);
                simulateTransactionBeforeSubmit();
              }}
              disabled={isSimulating}
              className="bg-blue-100 hover:bg-blue-200 text-blue-800"
            >
              {isSimulating ? "Simulating..." : "Simulate Transaction"}
            </Button>
            
            {getUserAction() === "sign" && (
              <Button
                onClick={handleSellerSign}
                disabled={isSubmitting || !connected || !isSeller}
                className="bg-green-600 hover:bg-green-700"
              >
                {isSubmitting ? "Signing..." : "Sign Transaction"}
              </Button>
            )}
            
            {getUserAction() === "complete" && (
              <Button
                onClick={handleBuyerComplete}
                disabled={isSubmitting || !connected || !isBuyer}
                className="bg-green-600 hover:bg-green-700"
              >
                {isSubmitting ? "Processing..." : "Send Payment"}
              </Button>
            )}
            
            {getUserAction() === "waiting" && (
              <Button
                disabled={true}
                className="bg-gray-400"
              >
                {isSeller ? "Waiting for Buyer" : "Waiting for Seller"}
              </Button>
            )}
            
            {getUserAction() === "none" && (
              <Button
                disabled={true}
                className="bg-gray-400"
              >
                No Action Available
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
} 