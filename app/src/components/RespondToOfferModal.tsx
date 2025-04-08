import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { PublicKey, Transaction, LAMPORTS_PER_SOL, Connection, SystemProgram } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { Offer } from "@/types/offer";
import { respondToOffer } from "../services/offerService";
import { submitTransactionNoUpdate, getRecentBlockhash, recordPropertySale, simulateTransaction } from "../services/transactionService";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/hooks/useAuth";
import { getToken } from "@/lib/auth";

// Define constants
const MARKETPLACE_PROGRAM_ID = "E7v7RResymJU5XvvPA9uwxGSEEsdSE6XvaP7BTV2GGoQ";
const SOLANA_RPC_ENDPOINT = "https://api.devnet.solana.com";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

interface RespondToOfferModalProps {
  offer: Offer;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  propertyNftMint?: string;
}

export default function RespondToOfferModal({
  offer,
  visible,
  onClose,
  onSuccess,
  propertyNftMint
}: RespondToOfferModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [offerAccepted, setOfferAccepted] = useState(false);
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null);
  const { toast } = useToast();
  const { publicKey, publicKeyObj, signTransaction, connected } = useWallet();
  const { token } = useAuth();

  // If seller_wallet is missing, use the current wallet as the seller
  const effectiveSeller = offer.seller_wallet || (publicKey || "");

  // Determine if connected wallet is buyer or seller
  const isBuyer = publicKey === offer.buyer_wallet;
  const isSeller = publicKey === effectiveSeller;

  // Reset state when modal is closed
  useEffect(() => {
    if (!visible) {
      setErrors({});
      setSimulationLogs([]);
      setShowLogs(false);
      setOfferAccepted(false);
      setTransactionSignature(null);
    }
  }, [visible]);

  // Check if offer is accepted when component mounts or offer changes
  useEffect(() => {
    if (offer.status === "accepted") {
      setOfferAccepted(true);
    }
  }, [offer]);

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
  
  // Create respond_to_offer instruction 
  const createRespondToOfferInstruction = (
    programId: PublicKey,
    propertyPda: PublicKey,
    offerPda: PublicKey,
    escrowPda: PublicKey,
    ownerWallet: PublicKey,
    buyerWallet: PublicKey,
    sellerNftAccount: PublicKey,
    escrowNftAccount: PublicKey,
    accept: boolean
  ) => {
    console.log("Creating respond_to_offer instruction with the following parameters:");
    console.log(`- Program ID: ${programId.toString()}`);
    console.log(`- Property PDA: ${propertyPda.toString()}`);
    console.log(`- Offer PDA: ${offerPda.toString()}`);
    console.log(`- Escrow PDA: ${escrowPda.toString()}`);
    console.log(`- Owner wallet: ${ownerWallet.toString()}`);
    console.log(`- Buyer wallet: ${buyerWallet.toString()}`);
    console.log(`- Seller NFT account: ${sellerNftAccount.toString()}`);
    console.log(`- Escrow NFT account: ${escrowNftAccount.toString()}`);
    console.log(`- Accept: ${accept}`);
    
    // Construct the instruction data for respond_to_offer
    // 8 bytes instruction discriminator + 1 byte for boolean
    const dataLayout = new Uint8Array(8 + 1);
    
    // Set the instruction discriminator for respond_to_offer from the IDL
    const instructionDiscriminator = new Uint8Array([143, 248, 12, 134, 212, 199, 41, 123]);
    dataLayout.set(instructionDiscriminator, 0);
    
    // Set the boolean value (1 for true, 0 for false)
    dataLayout.set([accept ? 1 : 0], 8);
    
    // Create the instruction with accounts in the right order according to RespondToOffer struct
    return {
      programId,
      keys: [
        { pubkey: propertyPda, isSigner: false, isWritable: true },     // property
        { pubkey: offerPda, isSigner: false, isWritable: true },       // offer
        { pubkey: escrowPda, isSigner: false, isWritable: true },      // escrow
        { pubkey: ownerWallet, isSigner: true, isWritable: true },     // owner
        { pubkey: buyerWallet, isSigner: false, isWritable: true },    // buyer
        { pubkey: sellerNftAccount, isSigner: false, isWritable: true }, // seller_nft_account
        { pubkey: escrowNftAccount, isSigner: false, isWritable: true }, // escrow_nft_account
      ],
      data: Buffer.from(dataLayout)
    };
  };

  // Create a SOL transfer instruction (simple payment from buyer to seller)
  const createSolTransferInstruction = (
    fromPubkey: PublicKey,
    toPubkey: PublicKey,
    lamports: number
  ) => {
    console.log(`Creating SOL transfer instruction of ${lamports / LAMPORTS_PER_SOL} SOL`);
    console.log(`- From: ${fromPubkey.toString()}`);
    console.log(`- To: ${toPubkey.toString()}`);
    
    return SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports
    });
  };

  // Display simulation logs in the UI
  const displaySimulationLogs = (logs: string[]) => {
    setSimulationLogs(logs);
    setShowLogs(true);
  };

  // Clear simulation logs
  const clearSimulationLogs = () => {
    setSimulationLogs([]);
    setShowLogs(false);
  };

  // Handler for accepting offer
  const handleAccept = async () => {
    await handleResponse(true);
  };

  // Handler for rejecting offer
  const handleReject = async () => {
    await handleResponse(false);
  };
  
  // Handle seller responding to an offer
  const handleResponse = async (accept: boolean) => {
    try {
      setIsSubmitting(true);
      setErrors({});
      
      // Check if wallet is connected
      if (!publicKey) {
        setErrors({ wallet: "Please connect your wallet first" });
        toast({
          title: "Wallet Error",
          description: "Please connect your wallet first"
        });
        return;
      }
      
      // Check if user is authenticated
      const authToken = getToken();
      if (!authToken) {
        setErrors({ auth: "You must be logged in to respond to offers" });
        toast({
          title: "Authentication Error",
          description: "You must be logged in to respond to offers"
        });
        return;
      }
      
      // Verify that the connected wallet is the seller
      const publicKeyObj = new PublicKey(publicKey);
      console.log("Comparing Wallets for Offer Response:");
      console.log("Connected PublicKey:", publicKeyObj.toString());
      console.log("Offer Seller Wallet:", offer.seller_wallet);
      if (publicKeyObj.toString() !== offer.seller_wallet) {
        setErrors({ wallet: "You must be the property seller to respond to this offer" });
        toast({
          title: "Wallet Error",
          description: "You must be the property seller to respond to this offer"
        });
        return;
      }
      
      const walletPublicKeyStr = publicKey;
      console.log("Using wallet public key:", walletPublicKeyStr);
      
      // Update offer's seller wallet if it's currently unknown
      if (!offer.seller_wallet) {
        console.log("Setting seller wallet to current wallet:", walletPublicKeyStr);
        offer.seller_wallet = walletPublicKeyStr;
      }
      
      // Get a fresh blockhash for the transaction
      const blockhash = await fetchRecentBlockhash();
      
      // Create Solana connection for transaction simulation
      const connection = new Connection(SOLANA_RPC_ENDPOINT, "confirmed");
      const programId = new PublicKey(MARKETPLACE_PROGRAM_ID);
      
      // Find the marketplace PDA
      const marketplaceAuthority = new PublicKey("A9xYe8XDnCRyPdy7B75B5PT7JP9ktLtxi6xMBVa7C4Xd");
      const [marketplacePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("marketplace"), marketplaceAuthority.toBuffer()],
        programId
      );
      console.log("Marketplace PDA:", marketplacePDA.toString());
      
      // Find the property PDA
      const [propertyPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("property"),
          marketplacePDA.toBuffer(),
          Buffer.from(offer.property_id)
        ],
        programId
      );
      console.log("Property PDA:", propertyPDA.toString());
      
      // Find the offer PDA using the buyer's wallet
      const buyerWallet = new PublicKey(offer.buyer_wallet);
      console.log("Using buyer wallet for offer PDA:", buyerWallet.toString());
      
      const [offerPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("offer"),
          propertyPDA.toBuffer(),
          buyerWallet.toBuffer()
        ],
        programId
      );
      console.log("Offer PDA:", offerPDA.toString());
      
      // Find the escrow PDA
      const [escrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), offerPDA.toBuffer()],
        programId
      );
      console.log("Escrow PDA:", escrowPDA.toString());
      
      // Get the seller's NFT account
      const sellerNftAccount = await getNftAccount(publicKeyObj, offer.property_id);
      if (!sellerNftAccount) {
        setErrors({ nft: "Could not find seller's NFT account" });
        toast({
          title: "NFT Error",
          description: "Could not find seller's NFT account"
        });
        return;
      }
      console.log("Seller NFT account:", sellerNftAccount.toString());
      
      // Get or create the escrow NFT account
      const escrowNftAccount = await getOrCreateEscrowNftAccount(escrowPDA, offer.property_id);
      if (!escrowNftAccount) {
        setErrors({ nft: "Could not create escrow NFT account" });
        toast({
          title: "NFT Error",
          description: "Could not create escrow NFT account"
        });
        return;
      }
      console.log("Escrow NFT account:", escrowNftAccount.toString());
      
      // Make sure we're not trying to accept our own offer
      if (buyerWallet.equals(publicKeyObj)) {
        const errorMsg = "Cannot respond to your own offer. The owner and buyer wallets are the same.";
        console.error(errorMsg);
        setErrors({ transaction: errorMsg });
        toast({
          title: "Error",
          description: errorMsg
        });
        setIsSubmitting(false);
        return;
      }
      
      // Create a new transaction
      const transaction = new Transaction({
        recentBlockhash: blockhash,
        feePayer: publicKeyObj
      });
      
      // Add the respond_to_offer instruction with all required accounts
      const respondToOfferInstruction = createRespondToOfferInstruction(
        programId,
        propertyPDA,
        offerPDA,
        escrowPDA,
        publicKeyObj,
        buyerWallet,
        sellerNftAccount,
        escrowNftAccount,
        accept
      );
      transaction.add(respondToOfferInstruction);
      
      // Simulate the transaction first to check for errors
      try {
        console.log("Simulating transaction before signing...");
        const simulationResult = await connection.simulateTransaction(transaction);
        
        if (simulationResult.value.err) {
          console.error("Transaction simulation failed:", simulationResult.value.err);
          
          // Display logs from simulation for debugging
          if (simulationResult.value.logs) {
            console.log("Simulation logs:", simulationResult.value.logs);
            displaySimulationLogs(simulationResult.value.logs);
          }
          
          // Extract meaningful error message if possible
          let errorMessage = "Transaction simulation failed.";
          if (typeof simulationResult.value.err === 'object' && simulationResult.value.err !== null) {
            const errJson = JSON.stringify(simulationResult.value.err);
            console.error("Simulation error details:", errJson);
            
            if (errJson.includes("OfferNotActive")) {
              errorMessage = "This offer is no longer active.";
            } else if (errJson.includes("InvalidEscrowAccount")) {
              errorMessage = "Invalid escrow account.";
            } else if (errJson.includes("InvalidNftAccount")) {
              errorMessage = "Invalid NFT account.";
            } else if (errJson.includes("AccountNotSigner")) {
              errorMessage = "Transaction signing failed. Please try again.";
            }
          }
          
          setErrors({ simulation: errorMessage });
          toast({
            title: "Simulation Error",
            description: errorMessage
          });
          setIsSubmitting(false);
          return;
        }
        
        console.log("Transaction simulation successful!");
        if (simulationResult.value.logs) {
          console.log("Simulation logs:", simulationResult.value.logs);
          displaySimulationLogs(simulationResult.value.logs);
        }
      } catch (simulationError) {
        console.error("Error during transaction simulation:", simulationError);
        setErrors({ simulation: `Simulation error: ${(simulationError as Error).message}` });
        toast({
          title: "Simulation Error",
          description: `Failed to simulate transaction: ${(simulationError as Error).message}`
        });
        setIsSubmitting(false);
        return;
      }
      
      // Sign and submit the transaction
      try {
        // Sign the transaction
        console.log("Signing transaction...");
        const signedTransaction = await signTransaction(transaction);
        
        // Show message while we process
        toast({
          title: "Signing Transaction",
          description: "Please wait while we process your response..."
        });
        
        // Encode the signed transaction
        const encodedTransaction = Buffer.from(signedTransaction.serialize()).toString('base64');
        
        // Submit transaction to our backend without updating the backend state
        const submitResult = await submitTransactionNoUpdate(encodedTransaction, authToken);
        
        if (!submitResult.success) {
          throw new Error(submitResult.message || "Transaction submission failed");
        }
        
        console.log("Transaction submitted to Solana:", submitResult);
        
        // Now call the backend API to update the offer status
        const offerResponse = await respondToOffer(
          offer.id,
          accept ? 'accepted' : 'rejected',
          submitResult.signature || "transaction-signature-placeholder",
          authToken
        );
        
        console.log("Offer response API result:", offerResponse);
        
        if (!offerResponse.success) {
          throw new Error(offerResponse.message || "Failed to update offer status");
        }
        
        // Store signature for use in the next step
        setTransactionSignature(submitResult.signature || null);
        
        toast({
          title: accept ? "Offer Accepted" : "Offer Rejected",
          description: accept 
            ? "You have successfully accepted the offer! The buyer can now complete the purchase."
            : "You have rejected the offer."
        });
        
        // Set offer as accepted if we accepted it
        if (accept) {
          setOfferAccepted(true);
        }
        
        // If we're rejecting, we're done
        if (!accept) {
          onSuccess();
          onClose();
        }
        
      } catch (signError) {
        console.error("Error signing or submitting transaction:", signError);
        setErrors({ transaction: `Transaction signing error: ${(signError as Error).message}` });
        toast({
          title: "Transaction Error",
          description: "Failed to sign or submit the transaction. Please try again."
        });
        setIsSubmitting(false);
        return;
      }
      
    } catch (err) {
      console.error("Error during offer response:", err);
      setErrors({ unknown: `An unknown error occurred: ${(err as Error).message}` });
      toast({
        title: "Error",
        description: "An error occurred while processing your request"
      });
      setIsSubmitting(false);
    }
  };
  
  // Execute property sale as buyer - real on-chain SOL transfer
  const handleCompletePurchase = async () => {
    try {
      setIsSubmitting(true);
      setErrors({});

      if (!publicKeyObj || !signTransaction || !token) {
        setErrors({ wallet: "Wallet not connected or not authenticated" });
        toast({
          title: "Wallet Error",
          description: "Please connect your wallet and authenticate"
        });
        setIsSubmitting(false);
        return;
      }

      // Verify that the connected wallet is the buyer
      if (publicKeyObj.toString() !== offer.buyer_wallet) {
        setErrors({ wallet: "Only the buyer can complete the purchase" });
        toast({
          title: "Wallet Error",
          description: "Only the buyer can complete the purchase"
        });
        setIsSubmitting(false);
        return;
      }

      // Verify that we have the seller's wallet address
      if (!offer.seller_wallet) {
        setErrors({ wallet: "Seller wallet address not found" });
        toast({
          title: "Wallet Error",
          description: "Seller wallet address not found"
        });
        setIsSubmitting(false);
        return;
      }

      // Get a fresh blockhash for the transaction
      const blockhash = await fetchRecentBlockhash();

      // Create Solana connection for transaction simulation
      const connection = new Connection(SOLANA_RPC_ENDPOINT, "confirmed");

      // Create a new transaction
      const transaction = new Transaction({
        recentBlockhash: blockhash,
        feePayer: publicKeyObj
      });

      // Add the SOL transfer instruction
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: publicKeyObj,
        toPubkey: new PublicKey(offer.seller_wallet),
        lamports: offer.amount
      });

      transaction.add(transferInstruction);

      // Simulate the transaction first to check for errors
      try {
        console.log("Simulating transaction before signing...");
        const simulationResult = await connection.simulateTransaction(transaction);

        if (simulationResult.value.err) {
          console.error("Transaction simulation failed:", simulationResult.value.err);

          // Display logs from simulation for debugging
          if (simulationResult.value.logs) {
            console.log("Simulation logs:", simulationResult.value.logs);
            displaySimulationLogs(simulationResult.value.logs);
          }

          // Extract meaningful error message if possible
          let errorMessage = "Transaction simulation failed.";
          if (typeof simulationResult.value.err === 'object' && simulationResult.value.err !== null) {
            const errJson = JSON.stringify(simulationResult.value.err);
            console.error("Simulation error details:", errJson);

            if (errJson.includes("insufficient funds")) {
              errorMessage = "Insufficient funds to complete the purchase.";
            } else if (errJson.includes("AccountNotSigner")) {
              errorMessage = "Transaction signing failed. Please try again.";
            }
          }

          setErrors({ simulation: errorMessage });
          toast({
            title: "Simulation Error",
            description: errorMessage
          });
          setIsSubmitting(false);
          return;
        }

        console.log("Transaction simulation successful!");
        if (simulationResult.value.logs) {
          console.log("Simulation logs:", simulationResult.value.logs);
          displaySimulationLogs(simulationResult.value.logs);
        }
      } catch (simulationError) {
        console.error("Error during transaction simulation:", simulationError);
        setErrors({ simulation: `Simulation error: ${(simulationError as Error).message}` });
        toast({
          title: "Simulation Error",
          description: `Failed to simulate transaction: ${(simulationError as Error).message}`
        });
        setIsSubmitting(false);
        return;
      }

      // Sign and submit the transaction
      try {
        // Sign the transaction
        console.log("Signing transaction...");
        const signedTransaction = await signTransaction(transaction);

        // Show message while we process
        toast({
          title: "Signing Transaction",
          description: "Please wait while we process your payment..."
        });

        // Encode the signed transaction
        const encodedTransaction = Buffer.from(signedTransaction.serialize()).toString('base64');

        // Submit transaction to our backend without updating the backend state
        const submitResult = await submitTransactionNoUpdate(encodedTransaction, token);

        if (!submitResult.success) {
          throw new Error(submitResult.message || "Transaction submission failed");
        }

        console.log("Transaction submitted to Solana:", submitResult);

        // Now call the backend API to record the sale
        const saleResponse = await recordPropertySale(
          offer.property_id,
          offer.buyer_wallet,
          offer.seller_wallet,
          offer.amount,
          submitResult.signature || "transaction-signature-placeholder",
          token
        );

        console.log("Sale recording API result:", saleResponse);

        if (!saleResponse.success) {
          throw new Error(saleResponse.message || "Failed to record the sale");
        }

        toast({
          title: "Purchase Completed",
          description: "You have successfully completed the purchase!"
        });

        onSuccess();
        onClose();

      } catch (signError) {
        console.error("Error signing or submitting transaction:", signError);
        setErrors({ transaction: `Transaction signing error: ${(signError as Error).message}` });
        toast({
          title: "Transaction Error",
          description: "Failed to sign or submit the transaction. Please try again."
        });
        setIsSubmitting(false);
        return;
      }

    } catch (err) {
      console.error("Error during purchase completion:", err);
      setErrors({ unknown: `An unknown error occurred: ${(err as Error).message}` });
      toast({
        title: "Error",
        description: "An error occurred while processing your request"
      });
      setIsSubmitting(false);
    }
  };
  
  // Get modal title based on status
  const getModalTitle = () => {
    if (offerAccepted) {
      return isBuyer 
        ? "Complete Purchase" 
        : "Offer Accepted";
    }
    return "Respond to Offer";
  };
  
  // Get modal description based on status
  const getModalDescription = () => {
    if (offerAccepted) {
      return isBuyer
        ? "Make the payment to complete your purchase" 
        : "You have accepted this offer. Waiting for buyer to complete the purchase.";
    }
    return "Review and respond to the offer for your property";
  };

  // Helper function to get the NFT account for a property
  const getNftAccount = async (owner: PublicKey, propertyId: string): Promise<PublicKey | null> => {
    try {
      // Get all token accounts owned by the owner
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_PROGRAM_ID
      });
      
      // Find the token account that contains the property NFT
      for (const { account } of tokenAccounts.value) {
        const tokenData = account.data.parsed.info;
        if (tokenData.mint === propertyId) {
          return new PublicKey(tokenData.pubkey);
        }
      }
      
      return null;
    } catch (error) {
      console.error("Error getting NFT account:", error);
      return null;
    }
  };
  
  // Helper function to get or create the escrow NFT account
  const getOrCreateEscrowNftAccount = async (escrowPda: PublicKey, propertyId: string): Promise<PublicKey | null> => {
    try {
      // First try to find an existing escrow NFT account
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(escrowPda, {
        programId: TOKEN_PROGRAM_ID
      });
      
      // Find the token account that contains the property NFT
      for (const { account } of tokenAccounts.value) {
        const tokenData = account.data.parsed.info;
        if (tokenData.mint === propertyId) {
          return new PublicKey(tokenData.pubkey);
        }
      }
      
      // If no existing account found, create a new one
      // This will be handled by the program when accepting the offer
      return null;
    } catch (error) {
      console.error("Error getting or creating escrow NFT account:", error);
      return null;
    }
  };

  return (
    <Dialog open={visible} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] md:max-w-[700px] max-h-[90vh] overflow-y-auto bg-white p-4 sm:p-6">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-100 to-purple-100 rounded-lg z-0 opacity-60" />
        <div className="relative z-10">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl">
              {getModalTitle()}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              {getModalDescription()}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="text-sm font-medium text-gray-700 mb-2">About this transaction</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-500">Amount:</div>
                <div className="text-gray-900 font-medium">{(offer.amount / LAMPORTS_PER_SOL).toFixed(2)} SOL</div>
                
                <div className="text-gray-500">Buyer:</div>
                <div className="text-gray-900 font-mono text-xs break-all">{offer.buyer_wallet}</div>
                
                <div className="text-gray-500">Seller:</div>
                <div className="text-gray-900 font-mono text-xs break-all">{offer.seller_wallet || (connected ? publicKey : "<Unknown Seller>")}</div>
                
                <div className="text-gray-500">Property ID:</div>
                <div className="text-gray-900">{offer.property_id}</div>
                
                <div className="text-gray-500">Status:</div>
                <div className="text-gray-900">{offerAccepted ? "Accepted" : offer.status}</div>
              </div>
            </div>
            
            {/* Additional transaction description for accepted offers */}
            {offerAccepted && (
              <div className="bg-gray-50 p-4 rounded-md">
                <h3 className="text-sm font-medium text-gray-700 mb-2">The transaction will:</h3>
                <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                  <li>Transfer the payment from your wallet to the seller</li>
                  <li>Transfer the property NFT from the seller to you</li>
                  <li>Update the property ownership records</li>
                  <li>Create a transaction history record</li>
                </ul>
              </div>
            )}
            
            {connected && publicKeyObj && (
              <div className="bg-green-50 p-4 rounded-md text-sm text-green-800">
                <p className="font-medium">Connected Wallet:</p>
                <p className="font-mono text-xs break-all mt-1">{publicKey}</p>
                <p className="mt-2">
                  You are connected as the {isBuyer ? "buyer" : isSeller ? "seller" : "observer"}.
                  {!isSeller && !isBuyer && " You cannot respond to this offer."}
                </p>
              </div>
            )}
            
            {(!connected || !publicKeyObj) && (
              <div className="bg-red-50 p-4 rounded-md text-sm text-red-800">
                <p className="font-medium">Wallet not connected.</p>
                <p className="mt-1">Please connect your wallet to continue.</p>
              </div>
            )}
            
            {errors.wallet && (
              <div className="bg-red-50 p-4 rounded-md text-sm text-red-800">
                <p className="font-medium">Error:</p>
                <p className="mt-1">{errors.wallet}</p>
              </div>
            )}
            
            {errors.transaction && (
              <div className="bg-red-50 p-4 rounded-md text-sm text-red-800">
                <p className="font-medium">Transaction Error:</p>
                <p className="mt-1">{errors.transaction}</p>
              </div>
            )}
            
            {errors.simulation && (
              <div className="bg-red-50 p-4 rounded-md text-sm text-red-800">
                <p className="font-medium">Simulation Error:</p>
                <p className="mt-1">{errors.simulation}</p>
              </div>
            )}
            
            {errors.auth && (
              <div className="bg-red-50 p-4 rounded-md text-sm text-red-800">
                <p className="font-medium">Authentication Error:</p>
                <p className="mt-1">{errors.auth}</p>
              </div>
            )}
            
            {showLogs && simulationLogs.length > 0 && (
              <div className="bg-gray-800 p-4 rounded-md text-xs text-gray-200 font-mono overflow-x-auto max-h-40 overflow-y-auto">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-gray-400">Simulation Logs</h4>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-6 text-xs text-gray-400 hover:text-white"
                    onClick={clearSimulationLogs}
                  >
                    Clear
                  </Button>
                </div>
                {simulationLogs.map((log, i) => (
                  <div key={i} className="py-0.5">
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <DialogFooter className="mt-6 flex flex-col sm:flex-row justify-end gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            
            {!offerAccepted && isSeller && connected && publicKeyObj && (
              <>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto mt-2 sm:mt-0"
                >
                  {isSubmitting ? "Rejecting..." : "Reject"}
                </Button>
                
                <Button
                  onClick={handleAccept}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto bg-green-600 hover:bg-green-700 mt-2 sm:mt-0"
                >
                  {isSubmitting ? "Accepting..." : "Accept"}
                </Button>
              </>
            )}
            
            {offerAccepted && isBuyer && connected && publicKeyObj && (
              <Button
                onClick={handleCompletePurchase}
                disabled={isSubmitting}
                className="w-full sm:w-auto bg-green-600 hover:bg-green-700 mt-2 sm:mt-0"
              >
                {isSubmitting ? "Processing..." : "Pay Now"}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
} 