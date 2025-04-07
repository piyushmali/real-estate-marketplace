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
      console.log("DEBUG - Property owner wallet:", property?.owner?.toString());
      console.log("DEBUG - Wallet comparison (buyer):", walletAddress === offer.buyer_wallet);
      console.log("DEBUG - Wallet comparison (seller):", walletAddress === offer.seller_wallet || walletAddress === property?.owner?.toString());
      
      // More resilient wallet comparison - normalize addresses
      const normalizedWalletAddress = walletAddress.trim().toLowerCase();
      const normalizedBuyerWallet = offer.buyer_wallet?.trim().toLowerCase();
      const normalizedSellerWallet = offer.seller_wallet?.trim().toLowerCase();
      const normalizedOwnerWallet = property?.owner?.toString()?.trim().toLowerCase();
      
      console.log("DEBUG - Normalized wallet comparison (buyer):", normalizedWalletAddress === normalizedBuyerWallet);
      console.log("DEBUG - Normalized wallet comparison (seller):", normalizedWalletAddress === normalizedSellerWallet || normalizedWalletAddress === normalizedOwnerWallet);
      
      // Use both exact and normalized comparison for maximum compatibility
      const isBuyerMatch = walletAddress === offer.buyer_wallet || normalizedWalletAddress === normalizedBuyerWallet;
      const isSellerMatch = walletAddress === offer.seller_wallet || walletAddress === property?.owner?.toString() || 
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
  
  // Create execute_sale instruction - UPDATED to match test file structure exactly
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
    isSellerSigning: boolean = true
  ) => {
    console.log("Creating execute_sale instruction with the following parameters:");
    console.log("- Program ID:", programId.toString());
    console.log("- Marketplace PDA:", marketplacePDA.toString());
    console.log("- Property PDA:", propertyPDA.toString());
    console.log("- Offer PDA:", offerPDA.toString());
    console.log("- Transaction History PDA:", transactionHistoryPDA.toString());
    console.log("- Buyer wallet:", buyerPublicKey.toString());
    console.log("- Seller wallet:", sellerPublicKey.toString());
    console.log("- Buyer token account:", buyerTokenAccount.toString());
    console.log("- Seller token account:", sellerTokenAccount.toString());
    console.log("- Marketplace fee account:", marketplaceFeeAccount.toString());
    console.log("- Seller NFT account:", sellerNftAccount.toString());
    console.log("- Buyer NFT account:", buyerNftAccount.toString());
    console.log("- NFT mint:", propertyNftMintPublicKey.toString());
    console.log("- Is seller signing:", isSellerSigning);
    
    // Instruction discriminator for execute_sale (first 8 bytes of the SHA256 hash of "execute_sale")
    const discriminator = Buffer.from([37, 74, 217, 157, 79, 49, 35, 6]);
    
    // Create instruction with accounts EXACTLY matching the test file
    return new TransactionInstruction({
      programId,
      keys: [
        // Put the accounts in EXACTLY the same order as in the test file
        { pubkey: marketplacePDA, isSigner: false, isWritable: true },
        { pubkey: propertyPDA, isSigner: false, isWritable: true },
        { pubkey: offerPDA, isSigner: false, isWritable: true },
        { pubkey: transactionHistoryPDA, isSigner: false, isWritable: true },
        { pubkey: buyerPublicKey, isSigner: true, isWritable: true },
        { pubkey: sellerPublicKey, isSigner: isSellerSigning, isWritable: true },
        { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: marketplaceFeeAccount, isSigner: false, isWritable: true },
        { pubkey: sellerNftAccount, isSigner: false, isWritable: true },
        { pubkey: buyerNftAccount, isSigner: false, isWritable: true },
        { pubkey: propertyNftMintPublicKey, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: discriminator
    });
  };
  
  // Function to create the on-chain transaction
  const createTransaction = async (offer: Offer, property: Property): Promise<Transaction | null> => {
    try {
      console.log("🏠 Creating transaction for property sale");
      console.log("🏠 Offer details:", offer);
      console.log("🏠 Property details:", property);
      
      // Ensure required fields are present
      if (!offer.amount) {
        throw new Error("Offer amount is missing");
      }
      
      // Get connection
      const connection = new Connection(SOLANA_RPC_ENDPOINT, 'confirmed');
      
      // Get buyer and seller public keys
      if (!walletAddress) {
        throw new Error("Wallet not connected");
      }
      
      // Validate NFT mint
      if (!propertyNftMint) {
        throw new Error("Property NFT mint address is missing");
      }
      
      // Convert propertyNftMint to a PublicKey
      const nftMint = new PublicKey(propertyNftMint);
      console.log("🏠 NFT Mint:", nftMint.toString());
      
      // Validate seller wallet
      const propertyOwner = property.owner?.toString();
      if (!propertyOwner) {
        console.error("Missing seller wallet address:", property);
        throw new Error("Missing seller wallet address");
      }
      
      // Get buyer and seller addresses
      const buyerPubkey = new PublicKey(walletAddress);
      const sellerPubkey = new PublicKey(propertyOwner);
      
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
        new PublicKey(MARKETPLACE_PROGRAM_ID),
        offer.property_id,
        offer.buyer_wallet,
        property.owner
      );

      // Get associated token accounts for buyer and seller tokens (SOL)
      const buyerTokenAccount = new PublicKey(buyerPubkey); // SOL wallet is the token account
      const sellerTokenAccount = new PublicKey(sellerPubkey); // SOL wallet is the token account
      
      // Get associated token accounts for buyer and seller NFTs
      const sellerNftAccount = await getAssociatedTokenAddress(
        nftMint,
        sellerPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      const buyerNftAccount = await getAssociatedTokenAddress(
        nftMint,
        buyerPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      // Use a proper marketplace fee account - derive the correct PDA for the fee account
      // This fixes the 0xbc2: invalid owner error in the transaction
      const [marketplaceFeeAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("marketplace_fee"), pdas.marketplace.toBuffer()],
        new PublicKey(MARKETPLACE_PROGRAM_ID)
      );
      
      console.log("🏠 Marketplace Fee Account:", marketplaceFeeAccount.toString());
      console.log("🏠 Seller NFT Account:", sellerNftAccount.toString());
      console.log("🏠 Buyer NFT Account:", buyerNftAccount.toString());
      
      // Verify that the seller actually owns the NFT token
      try {
        console.log("🏠 Verifying seller ownership of NFT...");
        const sellerTokenInfo = await connection.getAccountInfo(sellerNftAccount);
        
        if (!sellerTokenInfo) {
          console.error("🏠 Seller doesn't have a token account for this NFT");
          throw new Error("Seller doesn't own this property NFT - token account not found");
        }
        
        console.log("🏠 Seller token account exists - assuming ownership confirmed");
      } catch (error: any) {
        console.error("🏠 Error verifying NFT ownership:", error);
        throw new Error("Failed to verify property ownership: " + error.message);
      }

      // Calculate fee amounts (not directly used but helpful for logs)
      const marketplaceFee = Math.floor(priceInLamports * 0.025); // 2.5% marketplace fee
      const sellerAmount = priceInLamports - marketplaceFee;
      
      console.log("🏠 Marketplace Fee:", marketplaceFee);
      console.log("🏠 Seller Amount:", sellerAmount);

      // Create a new transaction
      const transaction = new Transaction();
      
      // Check if buyer's NFT ATA exists, if not create it
      try {
        console.log("🏠 Checking if buyer NFT account exists...");
        const buyerNftInfo = await connection.getAccountInfo(buyerNftAccount);
        console.log("🏠 Buyer NFT account exists already:", !!buyerNftInfo);
        
        if (!buyerNftInfo) {
          console.log("🏠 Creating buyer NFT account...");
          
          // Following the PropertyForm.tsx pattern for creating token accounts
          // Calculate rent-exempt minimum balance
          const rentExempt = await connection.getMinimumBalanceForRentExemption(165);
          
          // Create the associated token account with proper initialization
          // EXACTLY matching the order in PropertyForm.tsx (which works)
          const createATAIx = createAssociatedTokenAccountInstruction(
            buyerPubkey,              // Payer
            buyerNftAccount,          // ATA address
            buyerPubkey,              // Owner
            nftMint                   // Mint
          );
          
          // Add instruction to transaction
          transaction.add(createATAIx);
          
          console.log("🏠 Added createAssociatedTokenAccountInstruction for buyer NFT account");
        } else {
          // Verify that the token account belongs to the buyer
          try {
            const accountInfo = await connection.getTokenAccountBalance(buyerNftAccount);
            console.log("🏠 Buyer NFT token account info:", accountInfo);
          } catch (err) {
            console.log("🏠 Error checking buyer token account balance:", err);
          }
        }
      } catch (error) {
        console.error("🏠 Error checking/creating buyer NFT account:", error);
        
        // Be extremely defensive and simply try to create the account anyway
        try {
          console.log("🏠 Creating buyer NFT account via fallback path");
          
          const createATAIx = createAssociatedTokenAccountInstruction(
            buyerPubkey,              // Payer
            buyerNftAccount,          // ATA address
            buyerPubkey,              // Owner
            nftMint                   // Mint
          );
          
          transaction.add(createATAIx);
          console.log("🏠 Added createAssociatedTokenAccountInstruction via fallback path");
        } catch (createError) {
          console.error("🏠 Critical error creating buyer NFT account:", createError);
          // Continue anyway and let the transaction fail with better error information
        }
      }

      // Create the execute_sale instruction to call our Solana program
      console.log("🏠 Creating execute_sale instruction to call our Solana program");
      
      // Prepare all required accounts following the pattern in PropertyForm.tsx
      const executeOfferIx = createExecuteSaleInstruction(
        new PublicKey(MARKETPLACE_PROGRAM_ID),
        pdas.marketplace,
        pdas.property,
        pdas.offer,
        pdas.transactionHistory,
        buyerPubkey,
        sellerPubkey,
        buyerTokenAccount,
        sellerTokenAccount,
        marketplaceFeeAccount,
        sellerNftAccount,
        buyerNftAccount,
        nftMint,
        isSeller // Set correctly based on whether current signer is seller
      );
      
      // Add the execute_sale instruction to the transaction
      transaction.add(executeOfferIx);

      // Get a recent blockhash and set fee payer
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      
      // Set fee payer to the current wallet
      // This ensures the transaction will be signed correctly
      const feePayer = isBuyer ? buyerPubkey : sellerPubkey;
      transaction.feePayer = feePayer;
      
      console.log("🏠 Transaction fee payer set to:", feePayer.toString());
      
      // Run a simulation before returning the transaction
      try {
        console.log("🏠 Simulating transaction before returning it...");
        const simulationResult = await connection.simulateTransaction(transaction);
        
        if (simulationResult.value.err) {
          console.error("🏠 Simulation failed:", simulationResult.value.err);
          
          // Detailed logging for debugging
          if (simulationResult.value.logs) {
            console.log("🏠 Simulation logs:");
            simulationResult.value.logs.forEach(log => console.log(`   ${log}`));
          }
          
          // Don't prevent execution but log the warning
          console.warn("🏠 Transaction may fail when submitted - simulation failed");
        } else {
          console.log("🏠 Simulation successful!");
          if (simulationResult.value.logs) {
            console.log("🏠 First few simulation logs:");
            simulationResult.value.logs.slice(0, 5).forEach(log => console.log(`   ${log}`));
          }
        }
      } catch (simError) {
        console.error("🏠 Error during simulation:", simError);
        // Don't prevent execution but log the warning
        console.warn("🏠 Transaction may fail when submitted - simulation error");
      }
      
      // Log details of the transaction for debugging
      console.log("🏠 Transaction created successfully:", transaction);
      console.log("🏠 Transaction includes", transaction.instructions.length, "instructions");
      transaction.instructions.forEach((ix, i) => {
        console.log(`🏠 Instruction ${i}: programId=${ix.programId.toString()}`);
      });
      
      return transaction;
    } catch (error: any) {
      console.error("🏠 Error creating transaction:", error);
      // Provide detailed error message
      let errorMessage = "Failed to create transaction";
      if (error instanceof Error) {
        errorMessage = `Error: ${error.message}`;
      }
      toast({
        title: "Error",
        description: errorMessage,
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
      console.log("Starting buyer completion process - will call execute_sale on chain");
      
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
      
      // Create the complete transaction with the execute_sale instruction
      console.log("Creating execute_sale transaction for the Solana program");
      
      // Ensure property is not null before calling createTransaction
      if (!property) {
        throw new Error("Property data is not available");
      }
      
      const transaction = await createTransaction(offer, property);
      if (!transaction) {
        throw new Error("Failed to create transaction");
      }
      
      console.log("Transaction created successfully:", transaction);
      console.log(`Transaction has ${transaction.instructions.length} instructions`);
      transaction.instructions.forEach((ix, i) => {
        console.log(`Instruction ${i}: programId=${ix.programId.toString()}`);
        if (ix.programId.toString() === MARKETPLACE_PROGRAM_ID) {
          console.log("   This is the execute_sale instruction");
        }
      });
      
      console.log("Asking wallet to sign transaction");
      
      // Buyer signs the transaction
      const signedTx = await signTransaction(transaction);
      console.log("Transaction signed successfully by buyer");
      
      // Serialize the transaction for submission
      const serializedTx = Buffer.from(signedTx.serialize()).toString('base64');
      console.log("Transaction serialized successfully, length:", serializedTx.length);
      
      // Submit transaction to backend
      console.log("Sending transaction to backend for submission to blockchain");
      try {
        const result = await submitTransactionNoUpdate(serializedTx, token!);
        console.log("Transaction submission result:", result);
        
        if (!result.success) {
          // Extract more detailed error information if possible
          const errorMessage = result.message || "Unknown error";
          console.error("Transaction failed with error:", errorMessage);
          
          // Check for specific error codes and provide better messages
          if (errorMessage.includes("0xbc2")) {
            throw new Error("Transaction failed: Error creating token accounts. Check that all accounts are properly initialized before executing the sale.");
          } else if (errorMessage.includes("custom program error")) {
            // Try to extract the error code and provide context
            const errorMatch = errorMessage.match(/custom program error: (0x[0-9a-f]+)/i);
            const errorCode = errorMatch ? errorMatch[1] : "unknown";
            const errorMeaning = getErrorMeaning(errorCode);
            throw new Error(`Transaction failed: Program error code ${errorCode} - ${errorMeaning}`);
          }
          
          throw new Error(`Transaction failed: ${errorMessage}`);
        }
        
        // Handle success
        toast({
          title: "Transaction Submitted",
          description: "The property sale has been executed on-chain!",
        });
        
        // Record the sale in our database
        await processSaleRecording(result.signature);
        
        // Close modal if successful
        onSuccess();
        onClose();
      } catch (submitError: any) {
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
              throw new Error(`Transaction failed: Program error code ${errorCode}. Please check your Solana program for this error code.`);
            }
          }
        }
        
        throw submitError;
      }
    } catch (err: any) {
      console.error("Error during transaction completion:", err);
      toast({
        title: "Error",
        description: `Failed to complete transaction: ${err.message}`,
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
        });
      }
    } catch (err) {
      console.error("Error recording sale:", err);
      toast({
        title: "Warning",
        description: "Transaction was submitted but we couldn't record it in our database.",
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
  
  // Function to fetch property details if not available
  const fetchPropertyDetails = async () => {
    try {
      console.log(`Fetching property details for ID: ${offer.property_id}`);
      
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8080'}/api/properties/${offer.property_id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch property: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`Property details retrieved:`, data);
      
      // Update the property data with what we fetched
      setProperty({
        property_id: data.property_id,
        location: data.location,
        price: Number(data.price),
        square_feet: Number(data.square_feet),
        bedrooms: Number(data.bedrooms),
        bathrooms: Number(data.bathrooms),
        metadata_uri: data.metadata_uri,
        owner: data.owner_wallet, // Use owner_wallet from API response for owner field
        nft_mint_address: data.nft_mint_address,
        is_active: data.is_active,
        description: data.description
      });
      
      // If seller wallet is undefined in the offer, use property owner
      if (!offer.seller_wallet && data.owner_wallet) {
        console.log(`Using property owner as seller: ${data.owner_wallet}`);
        offer.seller_wallet = data.owner_wallet;
      }
      
      // Debug log current wallet values after update
      console.log(`Current wallet values - Connected: ${wallet?.publicKey?.toString()}, Seller: ${offer.seller_wallet}, Buyer: ${offer.buyer_wallet}`);
      
      return data;
    } catch (error) {
      console.error('Error fetching property details:', error);
      toast({
        title: "Error",
        description: `Failed to fetch property details: ${error.message}`,
      });
      return null;
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
    <Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md md:max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 rounded-md opacity-70 -z-10" />
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Execute Property Sale</DialogTitle>
          <DialogDescription>
            {isBuyer && (
              <div className="text-sm mb-4 bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="font-medium mb-1">About this transaction</div>
                <p className="mb-2">This will execute the sale of the property NFT for {(offer.amount / LAMPORTS_PER_SOL).toFixed(2)} SOL.</p>
                <p>The transaction will:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Transfer {(offer.amount / LAMPORTS_PER_SOL).toFixed(2)} SOL from your wallet to the seller</li>
                  <li>Transfer the property NFT from the seller to you</li>
                  <li>Update the property ownership records</li>
                  <li>Create a transaction history record</li>
                </ul>
                <p className="mt-2 text-xs text-blue-700 dark:text-blue-400">All of this happens in a single atomic transaction - either all operations succeed or none do.</p>
              </div>
            )}
            
            {isSeller && !waitingForBuyer && (
              <div className="text-sm mb-4 bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="font-medium mb-1">About this transaction</div>
                <p>You're the seller of this property. Review the offer and sign the transaction to proceed with the sale.</p>
              </div>
            )}
            
            {waitingForBuyer && (
              <div className="text-sm mb-4 bg-amber-50 dark:bg-amber-950 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="font-medium">Waiting for buyer signature</div>
                <p>You've signed this transaction. Now the buyer needs to sign it to complete the purchase.</p>
              </div>
            )}
            
            {waitingForSeller && (
              <div className="text-sm mb-4 bg-amber-50 dark:bg-amber-950 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="font-medium">Waiting for seller signature</div>
                <p>The seller needs to sign this transaction before you can complete the purchase.</p>
              </div>
            )}
            
            {!connected && (
              <div className="text-sm mb-4 bg-red-50 dark:bg-red-950 p-4 rounded-lg border border-red-200 dark:border-red-800">
                <div className="font-medium">Wallet not connected</div>
                <p>Please connect your wallet to proceed with this transaction.</p>
              </div>
            )}
            
            <div className="space-y-2 mt-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Property ID:</span>
                <span className="font-medium">{offer.property_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Price:</span>
                <span className="font-medium">{(offer.amount / LAMPORTS_PER_SOL).toFixed(2)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Buyer:</span>
                <span className="font-mono text-xs truncate max-w-[200px]">{offer.buyer_wallet}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Seller:</span>
                <span className="font-mono text-xs truncate max-w-[200px]">{offer.seller_wallet}</span>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
        
        {/* Debugging UI sections - only shown in development mode */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 space-y-2">
            {/* User role detection */}
            <div className="text-xs bg-slate-100 dark:bg-slate-800 p-3 rounded">
              <h4 className="font-bold mb-1">User Role Detection:</h4>
              <div className="grid grid-cols-2 gap-1">
                <div>Wallet connected:</div>
                <div>{connected ? '✅' : '❌'}</div>
                <div>Detected as buyer:</div>
                <div>{isBuyer ? '✅' : '❌'}</div>
                <div>Detected as seller:</div>
                <div>{isSeller ? '✅' : '❌'}</div>
                <div>Buyer wallet match:</div>
                <div>{walletAddress === offer.buyer_wallet ? '✅' : '❌'}</div>
                <div>Seller wallet match:</div>
                <div>{walletAddress === offer.seller_wallet ? '✅' : '❌'}</div>
              </div>
            </div>
              
            {/* Status messages */}
            <div className="text-xs bg-slate-100 dark:bg-slate-800 p-3 rounded">
              <h4 className="font-bold mb-1">Status:</h4>
              <div className="grid grid-cols-2 gap-1">
                <div>Waiting for buyer:</div>
                <div>{waitingForBuyer ? '✅' : '❌'}</div>
                <div>Waiting for seller:</div>
                <div>{waitingForSeller ? '✅' : '❌'}</div>
                <div>Partially signed:</div>
                <div>{partiallySignedTxBase64 ? '✅' : '❌'}</div>
              </div>
            </div>
              
            {/* Test flow instructions */}
            <div className="text-xs bg-slate-100 dark:bg-slate-800 p-3 rounded">
              <h4 className="font-bold mb-1">Test flow instructions:</h4>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Connect first as seller, click "Start Sale"</li>
                <li>Then connect as buyer, click "Execute Sale"</li>
                <li>Watch console logs for debugging info</li>
              </ol>
            </div>
              
            {/* Action debug */}
            <div className="text-xs bg-slate-100 dark:bg-slate-800 p-3 rounded">
              <h4 className="font-bold mb-1">Action Debug:</h4>
              <div className="grid grid-cols-2 gap-1">
                <div>Current action:</div>
                <div>{getUserAction()}</div>
                <div>Button visible:</div>
                <div>{getUserAction() !== 'none' ? '✅' : '❌'}</div>
              </div>
            </div>
          </div>
        )}
          
        {showLogs && (
          <div className="mt-4 max-h-60 overflow-y-auto p-3 text-xs font-mono bg-black text-green-400 rounded">
            {simulationLogs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        )}
          
        <DialogFooter className="mt-6 flex items-center">
          <div className="flex-1">
            <Button 
              variant="outline" 
              onClick={simulateTransactionBeforeSubmit}
              disabled={isSimulating || isSubmitting}
              className={getUserAction() !== "none" ? "block" : "hidden"}
            >
              {isSimulating ? 'Simulating...' : 'Simulate Transaction'}
            </Button>
          </div>
          
          <div className="flex space-x-2">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
          
            {getUserAction() === "sign" && (
              <Button 
                onClick={handleSellerSign}
                disabled={isSubmitting}
                className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white"
              >
                {isSubmitting ? 'Processing...' : 'Start Sale'}
              </Button>
            )}
            
            {getUserAction() === "complete" && (
              <Button 
                onClick={handleBuyerComplete}
                disabled={isSubmitting}
                className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white"
              >
                {isSubmitting ? 'Processing...' : 'Execute Sale'}
              </Button>
            )}
            
            {getUserAction() === "waiting" && (
              <Button 
                disabled
                className="bg-amber-500 text-white"
              >
                {isBuyer ? 'Waiting for Seller' : 'Waiting for Buyer'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 