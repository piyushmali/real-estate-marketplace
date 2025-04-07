import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { PublicKey, Transaction, LAMPORTS_PER_SOL, Connection } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { Offer } from "@/types/offer";
import { submitTransactionNoUpdate, getRecentBlockhash, recordPropertySale } from "../services/transactionService";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/hooks/useAuth";

// Define constants
const MARKETPLACE_PROGRAM_ID = "BdSKkquiFKRqxbXYC3Jufz9K59xisZ33VNbyaigkStW6";
const SOLANA_RPC_ENDPOINT = "https://api.devnet.solana.com";

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
  const { publicKey, signTransaction, connected } = useWallet();
  const { token } = useAuth();
  const { toast } = useToast();
  const [waitingForBuyer, setWaitingForBuyer] = useState(false);
  const [waitingForSeller, setWaitingForSeller] = useState(false);
  const [partiallySignedTxBase64, setPartiallySignedTxBase64] = useState<string | null>(null);
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  
  // Check if current user is the buyer or the seller
  const isBuyer = publicKey?.toString() === offer.buyer_wallet;
  const isSeller = publicKey?.toString() === offer.seller_wallet;
  
  useEffect(() => {
    if (!visible) {
      setErrors({});
      setIsSubmitting(false);
      setWaitingForBuyer(false);
      setWaitingForSeller(false);
      setPartiallySignedTxBase64(null);
      setSimulationLogs([]);
      setShowLogs(false);
    }
  }, [visible]);
  
  // Function to get a recent blockhash
  const fetchRecentBlockhash = async () => {
    try {
      const response = await getRecentBlockhash();
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
        { pubkey: sellerPublicKey, isSigner: true, isWritable: false },
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
  
  // Create transaction for either buyer or seller to sign
  const createTransaction = async () => {
    if (!publicKey || !signTransaction) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to continue",
        variant: "destructive"
      });
      return null;
    }
    
    try {
      setIsSubmitting(true);
      setErrors({});
      
      const walletPublicKeyStr = publicKey.toString();
      console.log("Using wallet public key:", walletPublicKeyStr);
      
      // Create a connection to the Solana network
      const connection = new Connection(SOLANA_RPC_ENDPOINT);
      
      // Get a recent blockhash
      const blockhash = await fetchRecentBlockhash();
      
      // Create a new transaction
      const transaction = new Transaction({
        feePayer: new PublicKey(offer.buyer_wallet), // buyer pays the fees
        blockhash,
        lastValidBlockHeight: 1000000000, // Set a reasonable value in production
      });
      
      const programId = new PublicKey(MARKETPLACE_PROGRAM_ID);
      const propertyNftMintPublicKey = new PublicKey(propertyNftMint);
      const buyerPublicKey = new PublicKey(offer.buyer_wallet);
      const sellerPublicKey = new PublicKey(offer.seller_wallet);
      
      // Create PDAs
      const pdas = await createPDAs(
        programId,
        offer.property_id,
        offer.buyer_wallet,
        offer.seller_wallet
      );
      
      // In a real implementation, these would be queried or created token accounts
      // For now we'll use placeholder accounts
      const buyerTokenAccount = new PublicKey("5YNmX8xXSPFYGPPZmKaw59g9Nq6RXEEbQXS2M9zFsrXH");
      const sellerTokenAccount = new PublicKey("4rA3EXJzibbnrCvejkdAFFTkxCGuoJU4uRVVZGPwMN3y");
      const marketplaceFeeAccount = new PublicKey("4t6eAD6WpRFcPKbBwqzs4dcHVMKRgYLVA2xuNcJxXs7h");
      const sellerNftAccount = new PublicKey("8PbodeaosQP19SjYFx855UMqWxH2HynZLTTehGnXYb3s");
      const buyerNftAccount = new PublicKey("Eb3yDyYygcAzRjYN8QKQhEHYQkknFAVWAyyuMSzBNfLN");
      
      // Add execute_sale instruction
      const executeSaleInstruction = createExecuteSaleInstruction(
        programId,
        pdas.marketplace,
        pdas.property,
        pdas.offer,
        pdas.transactionHistory,
        buyerPublicKey,
        sellerPublicKey,
        buyerTokenAccount,
        sellerTokenAccount,
        marketplaceFeeAccount,
        sellerNftAccount,
        buyerNftAccount,
        propertyNftMintPublicKey
      );
      
      transaction.add(executeSaleInstruction);
      
      return transaction;
    } catch (err) {
      console.error("Error creating transaction:", err);
      toast({
        title: "Error",
        description: "Failed to create transaction. See console for details.",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsSubmitting(false);
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
      
      const transaction = await createTransaction();
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
        const transaction = await createTransaction();
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
      
      // We have a partially signed transaction, so complete it
      const serializedTx = partiallySignedTxBase64;
      
      // Submit transaction to our backend
      const result = await submitTransactionNoUpdate(serializedTx, token);
      
      if (!result.success) {
        throw new Error(result.message || "Transaction submission failed");
      }
      
      toast({
        title: "Transaction Submitted",
        description: "The purchase transaction has been submitted to the Solana network!",
      });
      
      // Record the sale in our database
      const saleResult = await recordPropertySale(
        offer.property_id,
        offer.seller_wallet,
        offer.buyer_wallet,
        offer.amount,
        result.signature, 
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
      console.error("Error during transaction completion:", err);
      toast({
        title: "Error",
        description: "Failed to complete transaction. See console for details.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
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
    
    if (isSeller && waitingForBuyer) {
      return "waiting"; // Seller waiting for buyer
    }
    
    if (isBuyer && waitingForSeller) {
      return "waiting"; // Buyer waiting for seller
    }
    
    return "none"; // No action available
  };
  
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
              </div>
            </div>
            
            {connected && (
              <div className="bg-green-50 p-4 rounded-md text-sm text-green-800">
                <p className="font-medium">Connected Wallet:</p>
                <p className="font-mono text-xs break-all mt-1">{publicKey?.toString()}</p>
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
                <p className="font-bold mb-2">Transaction Simulation Logs:</p>
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