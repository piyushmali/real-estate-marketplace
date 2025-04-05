import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { PublicKey, Transaction, LAMPORTS_PER_SOL, Connection } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { Offer } from "@/types/offer";
import { respondToOffer } from "../services/offerService";
import { submitTransactionNoUpdate, getRecentBlockhash } from "../services/transactionService";

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
  const { toast } = useToast();

  // Get auth token from localStorage
  const getAuthToken = (): string => {
    const token = localStorage.getItem('token');
    if (token) {
      return token;
    }
    
    // Try to get from session storage as fallback
    const sessionToken = sessionStorage.getItem('token');
    if (sessionToken) {
      return sessionToken;
    }
    
    throw new Error("Authentication token not found. Please login again.");
  };

  // Function to get a recent blockhash
  const fetchRecentBlockhash = async (token: string) => {
    try {
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
  
  const handleResponse = async (accept: boolean) => {
    // Clear previous errors
    setErrors({});
    clearSimulationLogs();
    
    try {
      setIsSubmitting(true);
      
      // Get auth token
      const token = getAuthToken();
      if (!token) {
        setErrors({ auth: "You must be logged in to respond to offers" });
        toast({
          title: "Authentication Error",
          description: "You must be logged in to respond to offers",
          variant: "destructive"
        });
        return;
      }
      
      // Get Phantom provider
      // @ts-ignore - Phantom global type
      const phantomProvider = window.solana;
      
      if (!phantomProvider || !phantomProvider.isPhantom) {
        setErrors({ wallet: "Phantom wallet is not installed. Please install Phantom wallet extension." });
        toast({
          title: "Wallet Error",
          description: "Phantom wallet is not installed. Please install the Phantom wallet extension.",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      // Check if connected
      if (!phantomProvider.isConnected) {
        try {
          console.log("Connecting to Phantom wallet...");
          await phantomProvider.connect();
          console.log("Connected to Phantom wallet");
        } catch (connectError) {
          console.error("Error connecting to Phantom:", connectError);
          setErrors({ wallet: "Failed to connect to Phantom wallet. Please try again." });
          toast({
            title: "Wallet Error",
            description: "Failed to connect to Phantom wallet. Please try again.",
            variant: "destructive"
          });
          setIsSubmitting(false);
          return;
        }
      }
      
      // Get wallet public key and convert to PublicKey object
      const walletPublicKeyStr = phantomProvider.publicKey?.toString();
      if (!walletPublicKeyStr) {
        setErrors({ wallet: "Could not detect your wallet public key." });
        toast({
          title: "Wallet Error",
          description: "Could not detect your wallet public key.",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      const walletPublicKey = new PublicKey(walletPublicKeyStr);
      console.log("Using wallet public key:", walletPublicKey.toString());
      
      // Get a fresh blockhash for the transaction
      const blockhash = await fetchRecentBlockhash(token);
      
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
      console.log("Current wallet owner:", walletPublicKey.toString());
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
      if (buyerWallet.equals(walletPublicKey)) {
        const errorMsg = "Cannot respond to your own offer. The owner and buyer wallets are the same.";
        console.error(errorMsg);
        setErrors({ transaction: errorMsg });
        toast({
          title: "Error",
          description: errorMsg,
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      // Create a transaction with the respond_to_offer instruction
      const transaction = new Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = walletPublicKey;
      
      // Add the respond_to_offer instruction
      const respondInstruction = createRespondToOfferInstruction(
        programId,
        propertyPDA,
        offerPDA,
        walletPublicKey,
        accept
      );
      
      transaction.add(respondInstruction);
      
      // Simulate the transaction before signing
      console.log("Simulating transaction before signing...");
      try {
        const simulation = await connection.simulateTransaction(transaction);
        
        // Process logs and display them
        const extractedLogs: string[] = [];
        let anchorErrorDetected = false;
        
        if (simulation.value.logs) {
          console.log("=== SIMULATION LOGS ===");
          simulation.value.logs.forEach((log, i) => {
            console.log(`${i+1}: ${log}`);
            
            // Extract program logs
            if (log.includes("Program log:")) {
              const logMessage = log.split("Program log: ")[1];
              extractedLogs.push(logMessage);
            }
            
            // Check for specific Anchor errors
            if (log.includes("AnchorError") && log.includes("AccountNotInitialized")) {
              anchorErrorDetected = true;
              extractedLogs.push("ERROR: Account Not Initialized. The offer account doesn't exist or is invalid.");
            }
          });
          console.log("=== END SIMULATION LOGS ===");
          
          // Display logs in UI
          displaySimulationLogs(extractedLogs);
        }
        
        // Check if simulation was successful
        if (simulation.value.err || anchorErrorDetected) {
          console.error("Transaction simulation failed:", simulation.value.err);
          
          // Extract meaningful error message if possible
          let errorMessage = "Transaction simulation failed.";
          if (typeof simulation.value.err === 'object' && simulation.value.err !== null) {
            const errJson = JSON.stringify(simulation.value.err);
            console.error("Simulation error details:", errJson);
            
            if (errJson.includes("NotPropertyOwner")) {
              errorMessage = "You are not the property owner.";
            } else if (errJson.includes("OfferNotPending")) {
              errorMessage = "This offer is not in a pending state.";
            } else if (errJson.includes("OfferExpired")) {
              errorMessage = "This offer has expired.";
            } else if (errJson.includes("AccountNotInitialized")) {
              errorMessage = "Offer account not found. It may have been already processed or doesn't exist.";
            }
          } else if (anchorErrorDetected) {
            errorMessage = "Offer account not found. It may have been already processed or doesn't exist.";
          }
          
          setErrors({ transaction: errorMessage });
          toast({
            title: "Transaction Error",
            description: errorMessage,
            variant: "destructive"
          });
          
          setIsSubmitting(false);
          return;
        }
      } catch (simulationError) {
        console.error("Error during transaction simulation:", simulationError);
        const errorMessage = simulationError instanceof Error ? simulationError.message : 'Unknown simulation error';
        
        setErrors({ transaction: errorMessage });
        toast({
          title: "Simulation Error",
          description: "Transaction simulation failed: " + errorMessage,
          variant: "destructive"
        });
        
        setIsSubmitting(false);
        return;
      }
      
      // User confirmed to proceed, or simulation was successful
      console.log("Transaction built, requesting signing from Phantom...");
      
      // Use Phantom's signTransaction
      const signedTransaction = await phantomProvider.signTransaction(transaction);
      console.log("Transaction signed successfully by Phantom");
      
      const serializedTransaction = signedTransaction.serialize();
      console.log("Transaction serialized, size:", serializedTransaction.length, "bytes");
      
      // Submit the signed transaction to the backend
      console.log("Submitting signed transaction to backend...");
      
      // Create metadata object for database
      const metadataObj = {
        offer_id: offer.id,
        status: accept ? "accepted" : "rejected",
        property_id: offer.property_id
      };
      
      console.log("Transaction metadata:", JSON.stringify(metadataObj, null, 2));
      
      // Submit to the backend for processing
      const result = await submitTransactionNoUpdate(
        Buffer.from(serializedTransaction).toString('base64'),
        token,
        JSON.stringify(metadataObj)
      );

      console.log("Transaction submission result:", result);

      if (result && result.signature) {
        console.log("Transaction successful, updating offer status in database");
        
        // Update offer status in database
        await respondToOffer(
          offer.id,
          accept ? "accepted" : "rejected",
          result.signature,
          token
        );
        
        toast({
          title: "Success",
          description: `Offer ${accept ? 'accepted' : 'rejected'} with transaction signature: ${result.signature.substring(0, 12)}...`,
        });
        onSuccess();
        onClose();
      } else {
        toast({
          title: "Warning",
          description: "Transaction completed but no signature was returned. Please check status later.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error responding to offer:", error);
      
      // Check for authentication error
      if (error instanceof Error) {
        if (error.message.includes("401") || error.message.includes("Unauthorized")) {
          setErrors({ auth: "Authentication failed. Please login again." });
          toast({
            title: "Authentication Error",
            description: "Your session has expired. Please login again.",
            variant: "destructive"
          });
        } else if (error.message.includes("User rejected")) {
          setErrors({ wallet: "You declined to sign the transaction." });
          toast({
            title: "Transaction Rejected",
            description: "You declined to sign the transaction.",
            variant: "destructive"
          });
        } else {
          setErrors({ form: error.message });
          toast({
            title: "Error",
            description: `Failed to ${accept ? 'accept' : 'reject'} offer. Please try again.`,
            variant: "destructive"
          });
        }
      } else {
        setErrors({ form: "An unknown error occurred" });
        toast({
          title: "Error",
          description: `Failed to ${accept ? 'accept' : 'reject'} offer. Please try again.`,
          variant: "destructive"
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] bg-white">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="text-xl font-bold">Respond to Offer</DialogTitle>
          <DialogDescription>
            Decide whether to accept or reject this offer
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {errors.form && (
            <div className="bg-red-100 text-red-700 p-2 rounded-md text-sm">
              {errors.form}
            </div>
          )}
          
          {errors.auth && (
            <div className="bg-red-100 text-red-700 p-2 rounded-md text-sm">
              {errors.auth}
            </div>
          )}
          
          {errors.wallet && (
            <div className="bg-red-100 text-red-700 p-2 rounded-md text-sm">
              {errors.wallet}
            </div>
          )}
          
          {errors.transaction && (
            <div className="bg-red-100 text-red-700 p-2 rounded-md text-sm">
              {errors.transaction}
            </div>
          )}
          
          <div className="border rounded-md p-4 mb-4">
            <h3 className="font-medium mb-2">Offer Details</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-500">Amount:</div>
              <div className="font-medium">{(offer.amount / LAMPORTS_PER_SOL).toFixed(6)} SOL</div>
              
              <div className="text-gray-500">From (Buyer):</div>
              <div className="font-medium font-mono text-xs">{offer.buyer_wallet.substring(0, 6)}...{offer.buyer_wallet.substring(offer.buyer_wallet.length - 4)}</div>
              
              <div className="text-gray-500">Property ID:</div>
              <div className="font-medium">{offer.property_id}</div>
              
              <div className="text-gray-500">Created:</div>
              <div className="font-medium">{new Date(offer.created_at).toLocaleString()}</div>
              
              <div className="text-gray-500">Expires:</div>
              <div className="font-medium">{new Date(offer.expiration_time).toLocaleString()}</div>
            </div>
          </div>
          
          {/* Simulation logs display */}
          {showLogs && simulationLogs.length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 border rounded-md">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium text-sm">Transaction Simulation Logs</h4>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={clearSimulationLogs}
                  className="text-xs h-6 py-0 px-2"
                >
                  Clear
                </Button>
              </div>
              <div className="bg-black text-green-400 p-2 rounded-md font-mono text-xs overflow-auto max-h-32">
                {simulationLogs.map((log, index) => (
                  <div key={index} className={`text-xs mb-1 ${log.includes("ERROR:") ? 'text-red-400' : log.includes("WARNING:") ? 'text-yellow-400' : ''}`}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <DialogFooter className="pt-4 border-t mt-6 flex justify-between">
            <Button 
              type="button" 
              variant="destructive" 
              onClick={handleReject} 
              disabled={isSubmitting}
              className="w-[45%]"
            >
              {isSubmitting ? (
                <div className="flex items-center">
                  <span className="animate-spin mr-2">⟳</span> Processing...
                </div>
              ) : "Reject Offer"}
            </Button>
            <Button 
              type="button" 
              onClick={handleAccept} 
              disabled={isSubmitting}
              className="w-[45%]"
            >
              {isSubmitting ? (
                <div className="flex items-center">
                  <span className="animate-spin mr-2">⟳</span> Processing...
                </div>
              ) : "Accept Offer"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
} 