import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { PublicKey, Transaction, LAMPORTS_PER_SOL, Connection, SystemProgram, TransactionInstruction } from '@solana/web3.js';
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { publicKey, publicKeyObj, signTransaction, connected, walletAddress } = useWallet();
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
      setIsBuyer(walletAddress === offer.buyer_wallet);
      setIsSeller(walletAddress === offer.seller_wallet || walletAddress === property?.owner_wallet);
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
    
    // Get transaction count from property - would be fetched from the blockchain in production
    // Assuming first transaction for this example
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
      transactionHistory: transactionHistoryPDA
    };
  };
  
  // Create an execute_sale instruction
  const createExecuteSaleInstruction = (
    programId: PublicKey,
    marketplacePDA: PublicKey,
    propertyPDA: PublicKey,
    offerPDA: PublicKey,
    transactionHistoryPDA: PublicKey,
    buyerPublicKey: PublicKey,
    sellerPublicKey: PublicKey,
    buyerTokenAccount: PublicKey,
    sellerTokenAccount: PublicKey,
    marketplaceFeeAccount: PublicKey,
    sellerNftAccount: PublicKey,
    buyerNftAccount: PublicKey,
    propertyNftMintPublicKey: PublicKey,
    isSellerSigning: boolean = true // New parameter to control if seller needs to sign
  ) => {
    console.log("Creating execute_sale instruction with the following parameters:");
    console.log("- Program ID:", programId.toString());
    console.log("- Marketplace PDA:", marketplacePDA.toString());
    console.log("- Property PDA:", propertyPDA.toString());
    console.log("- Offer PDA:", offerPDA.toString());
    console.log("- Transaction History PDA:", transactionHistoryPDA.toString());
    console.log("- Buyer wallet:", buyerPublicKey.toString());
    console.log("- Seller wallet:", sellerPublicKey.toString());
    console.log("- Is seller signing:", isSellerSigning);
    
    // Instruction discriminator for execute_sale from IDL
    const data = Buffer.from([37, 74, 217, 157, 79, 49, 35, 6]);
    
    return {
      programId,
      keys: [
        { pubkey: marketplacePDA, isSigner: false, isWritable: true },
        { pubkey: propertyPDA, isSigner: false, isWritable: true },
        { pubkey: offerPDA, isSigner: false, isWritable: true },
        { pubkey: transactionHistoryPDA, isSigner: false, isWritable: true },
        { pubkey: buyerPublicKey, isSigner: true, isWritable: true },
        { pubkey: sellerPublicKey, isSigner: isSellerSigning, isWritable: false },
        { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: marketplaceFeeAccount, isSigner: false, isWritable: true },
        { pubkey: sellerNftAccount, isSigner: false, isWritable: true },
        { pubkey: buyerNftAccount, isSigner: false, isWritable: true },
        { pubkey: propertyNftMintPublicKey, isSigner: false, isWritable: false },
        { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
        { pubkey: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), isSigner: false, isWritable: false },
        { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
        { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
      ],
      data
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
      const price = parseFloat(offer.offer_amount) * LAMPORTS_PER_SOL;
      console.log("🏠 Price in lamports:", price);
      
      // Marketplace constants
      const marketplaceAuthority = new PublicKey("13EySfdhQL6b7dxzJnw73C33cRUnX1NjPBWEP1gkU43C"); // Example marketplace authority
      const marketplaceFee = price * 0.025; // 2.5% marketplace fee
      const sellerAmount = price - marketplaceFee;
      
      console.log("🏠 Marketplace Fee:", marketplaceFee);
      console.log("🏠 Seller Amount:", sellerAmount);

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

      // Create a new transaction
      const transaction = new Transaction();
      
      // Check if buyer's ATA exists, if not create it
      try {
        await connection.getAccountInfo(buyerTokenAccount);
        console.log("🏠 Buyer token account exists already.");
      } catch (error) {
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

      // Add the transferSOL instruction (from buyer to seller)
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
          toPubkey: marketplaceAuthority,
          lamports: marketplaceFee,
        })
      );

      // Create the execute_sale instruction
      const executeOfferIx = new TransactionInstruction({
        keys: [
          { pubkey: buyerPubkey, isSigner: true, isWritable: true },
          { pubkey: sellerPubkey, isSigner: false, isWritable: true },
          { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
          { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
          { pubkey: propertyNftMint, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId,
        data: Buffer.from([2]), // 2 = execute_sale instruction
      });
      
      transaction.add(executeOfferIx);
      
      // Get a recent blockhash
      const { blockhash } = await connection.getRecentBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = buyerPubkey;
      
      console.log("🏠 Transaction created successfully:", transaction);
      
      return transaction;
    } catch (error) {
      console.error("🏠 Error creating transaction:", error);
      // Improve error details for better debugging
      let errorMessage = "Failed to create transaction";
      if (error instanceof Error) {
        errorMessage = `Error: ${error.message}`;
      }
      toast.error(errorMessage);
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
  
  // Buyer signs the transaction and submits it
  const handleBuyerComplete = async () => {
    try {
      setIsSubmitting(true);
      
      // If we don't have a partially signed transaction, create a new one
      if (!partiallySignedTxBase64) {
        // This branch is for when buyer initiates without seller having signed yet
        const transaction = await createTransaction(offer, property);
        if (!transaction) return;
        
        // Buyer signs
        const signedTx = await signTransaction!(transaction);
        
        // Serialize the partially signed transaction
        const serializedTx = Buffer.from(signedTx.serialize()).toString('base64');
        setPartiallySignedTxBase64(serializedTx);
        
        // Now we need the seller to sign
        setWaitingForSeller(true);
        
        toast({
          title: "Transaction Partially Signed",
          description: "You (buyer) have signed the transaction. Now the seller needs to sign to complete the sale.",
        });
        
        return;
      }
      
      // If this is a direct call from the buyer without going through two-party signing flow,
      // we'll create a special transaction where the seller is NOT required to sign
      if (isBuyer && !isSeller && !waitingForSeller) {
        console.log("Buyer is submitting directly without seller signature");
        
        // Create a new transaction where the seller is not required to sign
        const transaction = await createTransaction(offer, property);
        if (!transaction) return;
        
        // Buyer signs the transaction
        const signedTx = await signTransaction!(transaction);
        
        // Simulate transaction first to check for issues
        setSimulationLogs([]);
        console.log("Simulating transaction before submission");
        
        try {
          const simulationResult = await simulateTransaction(
            Buffer.from(signedTx.serialize()).toString('base64'), 
            token
          );
          
          if (!simulationResult.success) {
            console.error("Transaction simulation failed:", simulationResult);
            const errorLogs = simulationResult.logs || ["Simulation failed without detailed logs"];
            setSimulationLogs(errorLogs);
            setShowLogs(true);
            throw new Error(`Simulation failed: ${simulationResult.error || "Unknown error"}`);
          }
          
          console.log("Transaction simulation successful!");
          setSimulationLogs(simulationResult.logs || ["Simulation successful"]);
        } catch (simError) {
          console.error("Error during transaction simulation:", simError);
          setSimulationLogs([`Error: ${simError.message || "Unknown simulation error"}`]);
          setShowLogs(true);
          throw simError;
        }
        
        // Submit transaction to our backend
        console.log("Submitting transaction to backend");
        const result = await submitTransactionNoUpdate(
          Buffer.from(signedTx.serialize()).toString('base64'), 
          token
        );
        
        if (!result.success) {
          // Format error message for the user - extract error code from Solana response
          const errorMatch = result.message?.match(/custom program error: (0x[0-9a-f]+)/i);
          let errorCode = errorMatch ? errorMatch[1] : null;
          
          // Look up error code meaning if available
          const errorMeaning = errorCode ? getErrorMeaning(errorCode) : "Unknown error";
          
          // Show logs and throw a more descriptive error
          setSimulationLogs([
            `Transaction failed: ${result.message || "Unknown error"}`,
            `Error code: ${errorCode || "none"}`,
            `Meaning: ${errorMeaning}`
          ]);
          setShowLogs(true);
          throw new Error(`Transaction failed: ${errorMeaning}`);
        }
        
        // Process success case
        toast({
          title: "Transaction Submitted",
          description: "The purchase transaction has been submitted to the Solana network!",
        });
        
        // Record the sale
        await processSaleRecording(result.signature);
        return;
      }
      
      // We have a partially signed transaction from seller, so complete it
      const serializedTx = partiallySignedTxBase64;
      
      // Submit transaction to our backend
      const result = await submitTransactionNoUpdate(serializedTx, token);
      
      if (!result.success) {
        // Format error message
        const errorMatch = result.message?.match(/custom program error: (0x[0-9a-f]+)/i);
        let errorCode = errorMatch ? errorMatch[1] : null;
        const errorMeaning = errorCode ? getErrorMeaning(errorCode) : "Unknown error";
        
        setSimulationLogs([
          `Transaction failed: ${result.message || "Unknown error"}`,
          `Error code: ${errorCode || "none"}`,
          `Meaning: ${errorMeaning}`
        ]);
        setShowLogs(true);
        
        throw new Error(`Transaction failed: ${errorMeaning}`);
      }
      
      toast({
        title: "Transaction Submitted",
        description: "The purchase transaction has been submitted to the Solana network!",
      });
      
      // Record the sale in our database
      await processSaleRecording(result.signature);
      
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
      6019: "Invalid NFT mint"
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
    if (isSeller && !waitingForBuyer && !partiallySignedTxBase64) {
      return "sign"; // Seller needs to sign first
    }
    
    if (isBuyer && (!waitingForBuyer || partiallySignedTxBase64)) {
      return "complete"; // Buyer completes already signed transaction
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
                : isBuyer && partiallySignedTxBase64
                ? "Complete the purchase by signing and submitting this transaction."
                : isBuyer && !partiallySignedTxBase64
                ? "Initiate the purchase process. Both you and the seller must sign."
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
                setIsSimulating(true);
                setShowLogs(true);
                setSimulationLogs([
                  "Valid NFT mint: " + propertyNftMint,
                  "Simulating transaction creation...",
                ]);
                
                // Just show some basic information without actually submitting
                setTimeout(() => {
                  setIsSimulating(false);
                }, 1000);
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
                {isSubmitting ? "Processing..." : partiallySignedTxBase64 ? "Complete Purchase" : "Start Purchase"}
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