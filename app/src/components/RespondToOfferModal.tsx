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

// Define constants
const MARKETPLACE_PROGRAM_ID = "BdSKkquiFKRqxbXYC3Jufz9K59xisZ33VNbyaigkStW6";
const SOLANA_RPC_ENDPOINT = "https://api.devnet.solana.com";

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
    ownerWallet: PublicKey,
    accept: boolean
  ) => {
    console.log("Creating respond_to_offer instruction with the following parameters:");
    console.log(`- Program ID: ${programId.toString()}`);
    console.log(`- Property PDA: ${propertyPda.toString()}`);
    console.log(`- Offer PDA: ${offerPda.toString()}`);
    console.log(`- Owner wallet: ${ownerWallet.toString()}`);
    console.log(`- Accept: ${accept}`);
    
    // Construct the instruction data for respond_to_offer
    // 8 bytes instruction discriminator + 1 byte for boolean
    const dataLayout = new Uint8Array(8 + 1);
    
    // Set the instruction discriminator for respond_to_offer from the IDL
    const instructionDiscriminator = new Uint8Array([143, 248, 12, 134, 212, 199, 41, 123]);
    dataLayout.set(instructionDiscriminator, 0);
    
    // Set the boolean value (1 for true, 0 for false)
    dataLayout.set([accept ? 1 : 0], 8);
    
    // Create the instruction with accounts in the right order
    return {
      programId,
      keys: [
        { pubkey: propertyPda, isSigner: false, isWritable: true },  // property
        { pubkey: offerPda, isSigner: false, isWritable: true },     // offer
        { pubkey: ownerWallet, isSigner: true, isWritable: true },   // owner
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
    // Clear previous errors
    setErrors({});
    clearSimulationLogs();
    
    try {
      setIsSubmitting(true);
      
      if (!connected || !publicKeyObj) {
        setErrors({ wallet: "Wallet not connected. Please connect your wallet to continue." });
        toast({
          title: "Wallet Error",
          description: "Wallet not connected. Please connect your wallet to continue."
        });
        return;
      }
      
      if (!signTransaction) {
        setErrors({ wallet: "Wallet doesn't support signing. Please use a compatible wallet." });
        toast({
          title: "Wallet Error",
          description: "Wallet doesn't support signing. Please use a compatible wallet."
        });
        return;
      }
      
      if (!token) {
        setErrors({ auth: "You must be logged in to respond to offers" });
        toast({
          title: "Authentication Error",
          description: "You must be logged in to respond to offers"
        });
        return;
      }
      
      // Make sure the connected wallet is the seller
      if (!isSeller) {
        setErrors({ wallet: "You must be the property seller to respond to this offer." });
        toast({
          title: "Wallet Error",
          description: "You must be the property seller to respond to this offer."
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
      
      // Find the marketplace PDA (this needs to be the same logic as in the backend and smart contract)
      const marketplaceAuthority = new PublicKey("13EySfdhQL6b7dxzJnw73C33cRUnX1NjPBWEP1gkU43C");
      const [marketplacePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("marketplace"), marketplaceAuthority.toBuffer()],
        programId
      );
      console.log("Marketplace PDA:", marketplacePDA.toString());
      console.log("Current wallet owner:", walletPublicKeyStr);
      console.log("Offer buyer wallet:", offer.buyer_wallet);
      
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
      
      // Find the offer PDA - ensure we're using the buyer's wallet from the offer
      // and NOT the current wallet (which is the property owner)
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
      
      // Add the respond_to_offer instruction
      const respondToOfferInstruction = createRespondToOfferInstruction(
        programId,
        propertyPDA,
        offerPDA,
        publicKeyObj,
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
          
          setErrors({ simulation: `Transaction simulation failed: ${JSON.stringify(simulationResult.value.err)}` });
          toast({
            title: "Simulation Error",
            description: "Transaction would fail if submitted. See details in console."
          });
          setIsSubmitting(false);
          return;
        }
        
        console.log("Transaction simulation successful!");
        if (simulationResult.value.logs) {
          console.log("Simulation logs:", simulationResult.value.logs);
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
        // This will submit the transaction to the Solana network but not update our database yet
        const submitResult = await submitTransactionNoUpdate(encodedTransaction, token);
        
        if (!submitResult.success) {
          throw new Error(submitResult.message || "Transaction submission failed");
        }
        
        console.log("Transaction submitted to Solana:", submitResult);
        
        // Now call the backend API to update the offer status
        const offerResponse = await respondToOffer(
          offer.id,
          accept ? 'accepted' : 'rejected',
          submitResult.signature || "transaction-signature-placeholder",
          token
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
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Execute property sale as buyer - real on-chain SOL transfer
  const handleCompletePurchase = async () => {
    try {
      setIsSubmitting(true);
      
      if (!publicKeyObj || !signTransaction || !token) {
        toast({
          title: "Error",
          description: "Wallet not connected or not authenticated"
        });
        return;
      }
      
      // Make sure the connected wallet is the buyer
      if (!isBuyer) {
        setErrors({ wallet: "You must be the buyer to complete this purchase." });
        toast({
          title: "Wallet Error",
          description: "You must be the buyer to complete this purchase."
        });
        return;
      }
      
      // Make sure we have a seller wallet
      if (!offer.seller_wallet) {
        setErrors({ offer: "Missing seller wallet address. Cannot complete transaction." });
        toast({
          title: "Error", 
          description: "Missing seller wallet address. Cannot complete transaction."
        });
        return;
      }
      
      // Prepare for SOL transfer
      const sellerWallet = new PublicKey(offer.seller_wallet);
      const buyerWallet = publicKeyObj;
      
      // Get a fresh blockhash
      const connection = new Connection(SOLANA_RPC_ENDPOINT);
      const { blockhash } = await connection.getLatestBlockhash();
      
      // Create transaction
      const transaction = new Transaction({
        feePayer: buyerWallet,
        blockhash,
        lastValidBlockHeight: 1000000000, // Large value to avoid expiration during testing
      });
      
      // Add SOL transfer instruction
      const transferInstruction = createSolTransferInstruction(
        buyerWallet,
        sellerWallet,
        offer.amount
      );
      transaction.add(transferInstruction);
      
      // Simulate the transaction
      try {
        const simulation = await connection.simulateTransaction(transaction);
        if (simulation.value.err) {
          console.error("Transfer simulation failed:", simulation.value.err);
          setErrors({ simulation: `Transfer simulation failed: ${JSON.stringify(simulation.value.err)}` });
          toast({
            title: "Simulation Error",
            description: "Transaction simulation failed. You may not have enough SOL."
          });
          return;
        }
        
        // Display logs if available
        if (simulation.value.logs) {
          displaySimulationLogs(simulation.value.logs);
        }
      } catch (simulationError) {
        console.error("Error simulating transfer:", simulationError);
        setErrors({ simulation: `Transfer simulation error: ${(simulationError as Error).message}` });
        toast({
          title: "Error",
          description: "Error simulating transfer. Please try again."
        });
        return;
      }
      
      // Sign and send the transaction
      const signedTx = await signTransaction(transaction);
      
      // Submit the signed transaction to Solana
      const encodedTransaction = Buffer.from(signedTx.serialize()).toString('base64');
      const submitResult = await submitTransactionNoUpdate(encodedTransaction, token);
      
      if (!submitResult.success) {
        throw new Error(submitResult.message || "Transaction submission failed");
      }
      
      const txSignature = submitResult.signature;
      console.log("SOL transfer successful with signature:", txSignature);
      
      // Now record the sale in our database
      const result = await recordPropertySale(
        offer.property_id,
        offer.seller_wallet,
        publicKey,
        offer.amount,
        txSignature || "buyer-payment-signature",
        token
      );
      
      if (result.success) {
        toast({
          title: "Purchase Complete",
          description: "You have successfully purchased this property!",
        });
        onSuccess();
        onClose();
      } else {
        toast({
          title: "Warning",
          description: "Payment completed, but there was an issue recording the sale. Please contact support.",
        });
      }
      
    } catch (err) {
      console.error("Error during purchase completion:", err);
      setErrors({ unknown: `An error occurred: ${(err as Error).message}` });
      toast({
        title: "Error",
        description: "An error occurred during payment"
      });
    } finally {
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

  return (
    <Dialog open={visible} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] bg-white">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-100 to-purple-100 rounded-lg z-0 opacity-60" />
        <div className="relative z-10">
          <DialogHeader>
            <DialogTitle>
              {getModalTitle()}
            </DialogTitle>
            <DialogDescription>
              {getModalDescription()}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="text-sm font-medium text-gray-700">Offer Details</h3>
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
          
          <DialogFooter className="mt-6 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            
            {!offerAccepted && isSeller && connected && publicKeyObj && (
              <>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Rejecting..." : "Reject"}
                </Button>
                
                <Button
                  onClick={handleAccept}
                  disabled={isSubmitting}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isSubmitting ? "Accepting..." : "Accept"}
                </Button>
              </>
            )}
            
            {offerAccepted && isBuyer && connected && publicKeyObj && (
              <Button
                onClick={handleCompletePurchase}
                disabled={isSubmitting}
                className="bg-green-600 hover:bg-green-700"
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