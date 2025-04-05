import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createOffer } from "../services/offerService";
import { submitTransactionNoUpdate, getRecentBlockhash } from "../services/transactionService";
import { useToast } from "@/components/ui/use-toast";
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Connection } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';

// Define constants
const MARKETPLACE_PROGRAM_ID = "BdSKkquiFKRqxbXYC3Jufz9K59xisZ33VNbyaigkStW6";
const SOLANA_RPC_ENDPOINT = "https://api.devnet.solana.com";

interface MakeOfferModalProps {
  propertyId: string;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function MakeOfferModal({
  propertyId,
  visible,
  onClose,
  onSuccess,
}: MakeOfferModalProps) {
  const [amount, setAmount] = useState("");
  const [expirationDays, setExpirationDays] = useState("7");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const { toast } = useToast();

  // Get auth token from localStorage - same approach as in UpdatePropertyForm
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
  
  // Create an offer instruction based on smart contract
  const createMakeOfferInstruction = (
    programId: PublicKey,
    propertyPda: PublicKey,
    offerPda: PublicKey,
    buyerWallet: PublicKey,
    amount: number,
    expirationTime: number
  ) => {
    console.log("Creating make_offer instruction with the following parameters:");
    console.log(`- Program ID: ${programId.toString()}`);
    console.log(`- Property PDA: ${propertyPda.toString()}`);
    console.log(`- Offer PDA: ${offerPda.toString()}`);
    console.log(`- Buyer wallet: ${buyerWallet.toString()}`);
    console.log(`- Amount: ${amount}`);
    console.log(`- Expiration time: ${expirationTime}`);
    
    // Construct the instruction data for make_offer
    // 8 bytes instruction discriminator + 8 bytes for amount + 8 bytes for expiration
    const dataLayout = new Uint8Array(8 + 8 + 8);
    
    // Set the instruction discriminator for make_offer from the IDL
    // This is the correct discriminator from the IDL file
    const instructionDiscriminator = new Uint8Array([214, 98, 97, 35, 59, 12, 44, 178]);
    dataLayout.set(instructionDiscriminator, 0);
    
    // Set the amount as u64 in little endian
    const amountBn = new BN(amount);
    const amountBuffer = amountBn.toArray('le', 8);
    dataLayout.set(amountBuffer, 8);
    
    // Set the expiration time as i64 in little endian
    const expirationTimeBn = new BN(expirationTime);
    const expirationBuffer = expirationTimeBn.toArray('le', 8);
    dataLayout.set(expirationBuffer, 16);
    
    // Create the instruction with accounts in the right order
    return {
      programId,
      keys: [
        { pubkey: propertyPda, isSigner: false, isWritable: false },  // property
        { pubkey: offerPda, isSigner: false, isWritable: true },       // offer
        { pubkey: buyerWallet, isSigner: true, isWritable: true },     // buyer
        { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false }, // system_program
        { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false } // rent
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
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    setErrors({});
    clearSimulationLogs();
    
    if (!amount || !expirationDays) {
      setErrors({
        form: "Please fill in all required fields"
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Get auth token using the same method as UpdatePropertyForm
      const token = getAuthToken();
      if (!token) {
        setErrors({ auth: "You must be logged in to make an offer" });
        toast({
          title: "Authentication Error",
          description: "You must be logged in to make an offer",
          variant: "destructive"
        });
        return;
      }
      
      // Get Phantom provider directly from window object
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
      
      // First, create the offer in the database
      console.log(`Creating offer for property ${propertyId} with amount ${amount} and expiration days ${expirationDays}`);
      const offer = await createOffer(
        propertyId,
        Number(amount),
        Number(expirationDays),
        token
      );

      console.log("Offer created successfully:", offer);

      // Calculate expiration time in seconds (current time + days in seconds)
      const currentTimeSeconds = Math.floor(Date.now() / 1000);
      const expirationTimeSeconds = currentTimeSeconds + (Number(expirationDays) * 24 * 60 * 60);
      console.log(`Current time: ${currentTimeSeconds}, Expiration time: ${expirationTimeSeconds}`);

      // Get a fresh blockhash for the transaction
      const blockhash = await fetchRecentBlockhash(token);
      
      // Create Solana connection for transaction simulation
      const connection = new Connection(SOLANA_RPC_ENDPOINT, "confirmed");
      const programId = new PublicKey(MARKETPLACE_PROGRAM_ID);
      
      // Find the marketplace PDA
      const marketplaceAuthority = new PublicKey("13EySfdhQL6b7dxzJnw73C33cRUnX1NjPBWEP1gkU43C");
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
          Buffer.from(propertyId)
        ],
        programId
      );
      console.log("Property PDA:", propertyPDA.toString());
      
      // Find the offer PDA
      const [offerPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("offer"),
          propertyPDA.toBuffer(),
          walletPublicKey.toBuffer()
        ],
        programId
      );
      console.log("Offer PDA:", offerPDA.toString());
      
      // Create a transaction with the make_offer instruction
      const transaction = new Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = walletPublicKey;
      
      // Convert amount to lamports (SOL * LAMPORTS_PER_SOL)
      const amountLamports = Math.floor(Number(amount) * LAMPORTS_PER_SOL);
      
      // Add the make_offer instruction
      const offerInstruction = createMakeOfferInstruction(
        programId,
        propertyPDA,
        offerPDA,
        walletPublicKey,
        amountLamports,
        expirationTimeSeconds
      );
      
      transaction.add(offerInstruction);
      
      // Simulate the transaction before signing
      console.log("Simulating transaction before signing...");
      try {
        const simulation = await connection.simulateTransaction(transaction);
        
        // Process logs and display them
        const extractedLogs: string[] = [];
        
        if (simulation.value.logs) {
          console.log("=== SIMULATION LOGS ===");
          simulation.value.logs.forEach((log, i) => {
            console.log(`${i+1}: ${log}`);
            
            // Extract program logs
            if (log.includes("Program log:")) {
              const logMessage = log.split("Program log: ")[1];
              extractedLogs.push(logMessage);
            }
          });
          console.log("=== END SIMULATION LOGS ===");
          
          // Display logs in UI
          displaySimulationLogs(extractedLogs);
        }
        
        // Check if simulation was successful
        if (simulation.value.err) {
          console.error("Transaction simulation failed:", simulation.value.err);
          
          // Extract meaningful error message if possible
          let errorMessage = "Transaction simulation failed.";
          if (typeof simulation.value.err === 'object' && simulation.value.err !== null) {
            const errJson = JSON.stringify(simulation.value.err);
            console.error("Simulation error details:", errJson);
            
            if (errJson.includes("PropertyNotActive")) {
              errorMessage = "Property is not active for offers.";
            } else if (errJson.includes("CannotOfferOwnProperty")) {
              errorMessage = "You cannot make an offer on your own property.";
            } else if (errJson.includes("InvalidOfferAmount")) {
              errorMessage = "Invalid offer amount.";
            }
          }
          
          // Ask if user wants to proceed despite simulation error
          const proceedDespiteError = window.confirm(
            `Simulation warning: ${errorMessage}\n\n` +
            "This transaction may fail when submitted to the blockchain.\n\n" +
            "Do you want to try submitting it anyway?"
          );
          
          if (!proceedDespiteError) {
            setIsSubmitting(false);
            setErrors({ transaction: errorMessage });
            return;
          }
        }
      } catch (simulationError) {
        console.error("Error during transaction simulation:", simulationError);
        // Continue despite simulation error - this might be a technical issue rather than a logical one
      }
      
      // User confirmed to proceed, or simulation was successful
      console.log("Transaction built, requesting signing from Phantom...");
      
      // Use Phantom's signTransaction directly
      const signedTransaction = await phantomProvider.signTransaction(transaction);
      console.log("Transaction signed successfully by Phantom");
      
      const serializedTransaction = signedTransaction.serialize();
      console.log("Transaction serialized, size:", serializedTransaction.length, "bytes");
      
      // Submit the signed transaction to the backend
      console.log("Submitting signed transaction to backend...");
      
      // Create metadata object for database
      const metadataObj = {
        offer_id: offer.id,
        amount: Number(amount),
        property_id: propertyId
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
        toast({
          title: "Success",
          description: `Offer created and transaction submitted with signature: ${result.signature.substring(0, 12)}...`,
        });
        onSuccess();
        onClose();
      } else {
        toast({
          title: "Warning",
          description: "Transaction completed but no signature was returned. Your offer was created.",
        });
        onSuccess();
      onClose();
      }
    } catch (error) {
      console.error("Error creating offer:", error);
      
      // Check for authentication error
      if (error instanceof Error) {
        if (error.message.includes("401") || error.message.includes("Unauthorized")) {
          setErrors({ auth: "Authentication failed. Please login again." });
          toast({
            title: "Authentication Error",
            description: "Your session has expired. Please login again.",
            variant: "destructive"
          });
        } else if (error.message.includes("400") || error.message.includes("Bad Request")) {
          let errorMessage = "Invalid transaction format. Please check your transaction data.";
          
          // Try to extract more specific error message if available
          if (error.message.includes("missing field")) {
            errorMessage = "Transaction missing required fields. Please check the format.";
          }
          
          setErrors({ transaction: errorMessage });
          toast({
            title: "Transaction Error",
            description: errorMessage,
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
            description: "Failed to create offer or submit transaction. Please try again.",
            variant: "destructive"
          });
        }
      } else {
        setErrors({ form: "An unknown error occurred" });
      toast({
        title: "Error",
          description: "Failed to create offer. Please try again.",
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
          <DialogTitle className="text-xl font-bold">Make an Offer</DialogTitle>
          <DialogDescription>
            Submit your offer for this property
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
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
          
          <div className="grid gap-2">
            <Label htmlFor="amount" className="font-medium">Offer Amount (SOL)</Label>
            <Input
              id="amount"
              type="number"
              min="0.001"
              step="0.001"
              placeholder="Enter amount in SOL"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`border rounded-md ${errors.amount ? 'border-red-500' : 'border-gray-300'}`}
              required
            />
            {errors.amount && <p className="text-red-500 text-xs">{errors.amount}</p>}
            <p className="text-xs text-gray-500">The amount of SOL you're offering for this property</p>
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="expirationDays" className="font-medium">Offer Expires In (Days)</Label>
            <Select
              value={expirationDays}
              onValueChange={(value) => setExpirationDays(value)}
            >
              <SelectTrigger className={`border rounded-md ${errors.expirationDays ? 'border-red-500' : 'border-gray-300'}`}>
                <SelectValue placeholder="Select expiration days" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 day</SelectItem>
                <SelectItem value="3">3 days</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
              </SelectContent>
            </Select>
            {errors.expirationDays && <p className="text-red-500 text-xs">{errors.expirationDays}</p>}
            <p className="text-xs text-gray-500">Your offer will expire after this many days if not accepted.</p>
          </div>
          
          {/* Simulation logs display */}
          {showLogs && simulationLogs.length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 border rounded-md">
              <div className="flex justify-between items-center mb-2">
                <Label className="font-medium text-sm">Transaction Simulation Logs</Label>
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
          
          <DialogFooter className="pt-4 border-t mt-6">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <div className="flex items-center">
                  <span className="animate-spin mr-2">⟳</span> Submitting...
                </div>
              ) : "Submit Offer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
