import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { PublicKey, Transaction, LAMPORTS_PER_SOL, Connection, SystemProgram, TransactionInstruction, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { Offer } from "@/types/offer";
import { Property } from "@/context/PropertyContext";
import { getTransactionHistory, recordPropertySale, updatePropertyOwnership } from "../services/transactionService";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/hooks/useAuth";
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { WalletNotConnectedError } from '@solana/wallet-adapter-base';
import { useTransactionRefresh } from "@/pages/Transactions";

// Define constants
const MARKETPLACE_PROGRAM_ID = "E7v7RResymJU5XvvPA9uwxGSEEsdSE6XvaP7BTV2GGoQ";
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
  const transactionContext = useTransactionRefresh();
  const [transactionCompleted, setTransactionCompleted] = useState(false);
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null);
  
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
      console.log("Getting blockhash directly from Solana...");
      const connection = new Connection(SOLANA_RPC_ENDPOINT, "confirmed");
      const { blockhash } = await connection.getLatestBlockhash();
      console.log("Got blockhash from Solana:", blockhash);
      return blockhash;
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
    const marketplaceAuthority = new PublicKey("A9xYe8XDnCRyPdy7B75B5PT7JP9ktLtxi6xMBVa7C4Xd");
    
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
    escrowPDA: PublicKey,
    escrowNFTAccount: PublicKey,
    buyerNFTAccount: PublicKey,
    marketplaceAuthority: PublicKey,
    propertyNftMintPublicKey: PublicKey
  ) => {
    console.log("Creating execute_sale instruction with the following parameters:");
    console.log("- Program ID:", programId.toString());
    console.log("- Marketplace PDA:", marketplacePDA.toString());
    console.log("- Property PDA:", propertyPDA.toString());
    console.log("- Offer PDA:", offerPDA.toString());
    console.log("- Transaction History PDA:", transactionHistoryPDA.toString());
    console.log("- Buyer wallet:", buyerPublicKey.toString());
    console.log("- Seller wallet:", sellerPublicKey.toString());
    console.log("- Escrow PDA:", escrowPDA.toString());
    console.log("- Escrow NFT account:", escrowNFTAccount.toString());
    console.log("- Buyer NFT account:", buyerNFTAccount.toString());
    console.log("- Marketplace authority:", marketplaceAuthority.toString());
    console.log("- NFT mint:", propertyNftMintPublicKey.toString());
    
    // Instruction discriminator for execute_sale (first 8 bytes of the SHA256 hash of "execute_sale")
    const discriminator = Buffer.from([37, 74, 217, 157, 79, 49, 35, 6]);
    
    // Create instruction with accounts EXACTLY matching the lib.rs file
    return new TransactionInstruction({
      programId,
      keys: [
        // Following the exact order from lib.rs ExecuteSale struct
        { pubkey: marketplacePDA, isSigner: false, isWritable: true },
        { pubkey: propertyPDA, isSigner: false, isWritable: true },
        { pubkey: offerPDA, isSigner: false, isWritable: true },
        { pubkey: escrowPDA, isSigner: false, isWritable: true },
        { pubkey: transactionHistoryPDA, isSigner: false, isWritable: true },
        { pubkey: buyerPublicKey, isSigner: true, isWritable: true },
        { pubkey: sellerPublicKey, isSigner: false, isWritable: true },
        { pubkey: marketplaceAuthority, isSigner: false, isWritable: true },
        { pubkey: escrowNFTAccount, isSigner: false, isWritable: true },
        { pubkey: buyerNFTAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
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
      const buyerPubkey = new PublicKey(offer.buyer_wallet);
      const sellerPubkey = new PublicKey(propertyOwner);
      
      console.log("🏠 Buyer Address:", buyerPubkey.toString());
      console.log("🏠 Seller Address:", sellerPubkey.toString());
      
      // Ensure the price is always in lamports, and handle both formats correctly
      const price = offer.amount;
      // Make sure we're using lamports (if amount is small, it's likely in SOL and needs conversion)
      const priceInLamports = price < 10000 ? Math.floor(price * LAMPORTS_PER_SOL) : price;
      console.log("🏠 Original price value:", price);
      console.log("🏠 Price in lamports:", priceInLamports);
      console.log("🏠 Price in SOL:", priceInLamports / LAMPORTS_PER_SOL);
      
      // Use more detailed PDAs and create a proper execute_sale instruction
      const programId = new PublicKey(MARKETPLACE_PROGRAM_ID);
      const marketplaceAuthority = new PublicKey("A9xYe8XDnCRyPdy7B75B5PT7JP9ktLtxi6xMBVa7C4Xd");
      
      // Derive all necessary PDAs
      const [marketplacePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("marketplace"), marketplaceAuthority.toBuffer()],
        programId
      );
      
      const [propertyPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(offer.property_id)],
        programId
      );
      
      const [offerPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("offer"), propertyPDA.toBuffer(), buyerPubkey.toBuffer()],
        programId
      );
      
      // Get escrow PDA - critical for executing the sale
      const [escrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), offerPDA.toBuffer()],
        programId
      );
      
      // Derive transaction history PDA using property transaction count
      let transactionCount;
      try {
        // If we know the property transaction count, use it
        transactionCount = property.transaction_count || 0;
      } catch (e) {
        // If not available, default to 0 (better would be to fetch from chain)
        transactionCount = 0;
      }
      
      const [transactionHistoryPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("transaction"),
          propertyPDA.toBuffer(),
          new Uint8Array(new BN(transactionCount + 1).toArray("le", 8))
        ],
        programId
      );
      
      console.log("🏠 Derived PDAs:");
      console.log("- Marketplace PDA:", marketplacePDA.toString());
      console.log("- Property PDA:", propertyPDA.toString());
      console.log("- Offer PDA:", offerPDA.toString());
      console.log("- Escrow PDA:", escrowPDA.toString());
      console.log("- Transaction History PDA:", transactionHistoryPDA.toString());

      // Get buyer's NFT account (Associated Token Account)
      const buyerNFTAccount = await getAssociatedTokenAddress(
        nftMint,
        buyerPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      // Get escrow NFT account (Associated Token Account)
      // This is the account where the NFT is held in escrow
      const escrowNFTAccount = await getAssociatedTokenAddress(
        nftMint,
        escrowPDA,
        true,  // Allow owner off curve for PDA
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      console.log("🏠 Token accounts:");
      console.log("- Buyer NFT Account:", buyerNFTAccount.toString());
      console.log("- Escrow NFT Account:", escrowNFTAccount.toString());

      // Create a new transaction
      const transaction = new Transaction();
      
      // Check if buyer's NFT ATA exists, if not create it
      try {
        console.log("🏠 Checking if buyer NFT account exists...");
        const buyerNftInfo = await connection.getAccountInfo(buyerNFTAccount);
        
        if (!buyerNftInfo) {
          console.log("🏠 Creating buyer NFT account...");
          const createATAIx = createAssociatedTokenAccountInstruction(
            buyerPubkey,        // Payer
            buyerNFTAccount,    // ATA address
            buyerPubkey,        // Owner
            nftMint             // Mint
          );
          transaction.add(createATAIx);
        }
      } catch (error) {
        console.error("🏠 Error checking buyer NFT account:", error);
        // Defensive approach: try to create account anyway
        try {
          console.log("🏠 Creating buyer NFT account via fallback path");
          const createATAIx = createAssociatedTokenAccountInstruction(
            buyerPubkey,        // Payer
            buyerNFTAccount,    // ATA address
            buyerPubkey,        // Owner
            nftMint             // Mint
          );
          transaction.add(createATAIx);
        } catch (createError) {
          console.error("🏠 Critical error creating buyer NFT account:", createError);
        }
      }

      // Create the execute_sale instruction to call our Solana program
      console.log("🏠 Creating execute_sale instruction");
      
      const executeOfferIx = createExecuteSaleInstruction(
        programId,
        marketplacePDA,
        propertyPDA,
        offerPDA,
        transactionHistoryPDA,
        buyerPubkey,
        sellerPubkey,
        escrowPDA,
        escrowNFTAccount,
        buyerNFTAccount,
        marketplaceAuthority,
        nftMint
      );
      
      // Add the execute_sale instruction to the transaction
      transaction.add(executeOfferIx);

      // Get a recent blockhash - directly from Solana
      const blockhash = await fetchRecentBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = buyerPubkey;
      
      // Run a simulation before returning the transaction
      try {
        console.log("🏠 Simulating transaction before returning it...");
        const simulationResult = await connection.simulateTransaction(transaction);
        
        if (simulationResult.value.err) {
          console.error("🏠 Simulation failed:", simulationResult.value.err);
          
          if (simulationResult.value.logs) {
            console.log("🏠 Simulation logs:");
            simulationResult.value.logs.forEach(log => console.log(`   ${log}`));
          }
          
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
        console.warn("🏠 Transaction may fail when submitted - simulation error");
      }
      
      // Log details of the transaction for debugging
      console.log("🏠 Transaction created successfully:", transaction);
      console.log("🏠 Transaction includes", transaction.instructions.length, "instructions");
      
      return transaction;
    } catch (error: any) {
      console.error("🏠 Error creating transaction:", error);
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
  
  // Update the handleBuyerComplete function to properly handle transaction updates
  const handleBuyerComplete = async () => {
    try {
      setIsSubmitting(true);
      console.log("Starting buyer completion process - will call execute_sale on chain");
      
      // Check if wallet is connected and can sign
      if (!signTransaction) {
        throw new Error("Wallet not connected or cannot sign transactions");
      }
      
      // Ensure we have property details
      if (!property) {
        await fetchPropertyDetails();
        if (!property) {
          throw new Error("Failed to fetch property details");
        }
      }
      
      // Create the transaction
      const transaction = await createTransaction(offer, property);
      if (!transaction) {
        throw new Error("Failed to create transaction");
      }
      
      // Buyer signs the transaction
      console.log("Asking wallet to sign transaction");
      const signedTx = await signTransaction(transaction);
      console.log("Transaction signed successfully by buyer");
      
      // Show processing toast
      toast({
        title: "Processing",
        description: "Executing sale transaction on the Solana blockchain..."
      });
      
      // Submit directly to Solana
      try {
        console.log("Submitting transaction directly to Solana...");
        const connection = new Connection(SOLANA_RPC_ENDPOINT, "confirmed");
        const signature = await connection.sendRawTransaction(signedTx.serialize());
        console.log("Transaction sent to Solana:", signature);
        
        // Wait for confirmation
        toast({
          title: "Transaction Submitted",
          description: "Waiting for confirmation...",
          duration: 10000, // longer duration for this notification
        });
        
        // Wait for confirmation with timeout
        const confirmationPromise = connection.confirmTransaction(signature);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Confirmation timeout")), 60000)
        );
        
        // Use Promise.race to implement timeout
        const confirmation = await Promise.race([confirmationPromise, timeoutPromise]);
        console.log("Transaction confirmed:", confirmation);
        
        // After transaction confirmation:
        setTransactionSignature(signature);
        
        // If we get here, the transaction was successful
        // Step 1: Record the sale in our backend
        if (token) {
          console.log("Recording sale in backend database");
          try {
            const saleResult = await recordPropertySale(
              offer.property_id,
              offer.seller_wallet,
              offer.buyer_wallet,
              offer.amount,
              signature,
              token
            );
            console.log("Sale recording API result:", saleResult);
            
            // Step 2: Update property ownership in the database
            try {
              console.log("Updating property ownership in backend");
              const ownershipResult = await updatePropertyOwnership(
                offer.property_id,
                offer.buyer_wallet,
                offer.id,  // Using the offer ID directly
                signature,
                token
              );
              console.log("Property ownership update result:", ownershipResult);
            } catch (ownershipError) {
              console.warn("Failed to update property ownership in backend:", ownershipError);
              // Non-blocking error
            }
            
            // Step 3: Explicitly refresh the transaction history
            if (transactionContext) {
              console.log("Refreshing transaction history");
              try {
                await transactionContext.refreshTransactions();
                console.log("Transaction history refreshed successfully");
              } catch (refreshError) {
                console.warn("Failed to refresh transaction history:", refreshError);
              }
            } else {
              console.warn("Transaction context not available, cannot refresh transaction history");
            }
          } catch (recordError) {
            console.warn("Transaction successful but failed to record in backend:", recordError);
            // Non-blocking error, transaction already succeeded on chain
          }
        } else {
          console.warn("Not authenticated, skipping backend updates");
        }
        
        // Mark transaction as completed to trigger the useEffect
        setTransactionCompleted(true);
        
        // Show success toast
        toast({
          title: "Success",
          description: "Property purchase complete! Ownership has been transferred.",
          duration: 5000,
        });
        
        // Give a moment for the UI to update before closing the modal
        setTimeout(() => {
          // Close the modal and notify parent component
          onSuccess();
          onClose();
        }, 1500);
        
      } catch (sendError) {
        console.error("Error sending or confirming transaction:", sendError);
        let errorMessage = "Failed to send or confirm transaction";
        
        if (sendError instanceof Error) {
          errorMessage = sendError.message;
        }
        
        toast({
          title: "Transaction Error",
          description: errorMessage,
          variant: "destructive"
        });
        
        throw sendError;
      }
    } catch (err: any) {
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
        
        // Also update property ownership in the database
        try {
          await updatePropertyOwnership(
            offer.property_id,
            offer.buyer_wallet,
            offer.id.toString(),
            signature,
            token
          );
          console.log("Property ownership updated in database");
        } catch (ownershipError) {
          console.error("Error updating property ownership:", ownershipError);
          // Non-blocking error
        }
        
        // Refresh transaction history if context is available
        if (transactionContext) {
          await transactionContext.refreshTransactions();
        }
        
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
  
  // Add an effect to refresh transactions when transaction is completed
  useEffect(() => {
    if (transactionCompleted && transactionSignature && transactionContext) {
      console.log("Transaction completed, refreshing transaction history");
      const refreshHistory = async () => {
        try {
          await transactionContext.refreshTransactions();
          console.log("Transaction history refreshed after completion");
        } catch (error) {
          console.warn("Failed to refresh transaction history:", error);
        }
      };
      
      refreshHistory();
    }
  }, [transactionCompleted, transactionSignature, transactionContext]);
  
  // Reset state when modal is closed
  useEffect(() => {
    if (!visible) {
      setTransactionCompleted(false);
      setTransactionSignature(null);
    }
  }, [visible]);
  
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