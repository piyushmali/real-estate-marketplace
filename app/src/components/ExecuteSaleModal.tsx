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
  const [sellerInitiated, setSellerInitiated] = useState(false);
  const [partiallySignedTx, setPartiallySignedTx] = useState<string | null>(null);
  
  // Check if current user is the buyer or the seller
  const isBuyer = publicKey?.toString() === offer.buyer_wallet;
  const isSeller = publicKey?.toString() !== offer.buyer_wallet;
  
  useEffect(() => {
    if (!visible) {
      setErrors({});
      setIsSubmitting(false);
      setWaitingForBuyer(false);
      setSellerInitiated(false);
      setPartiallySignedTx(null);
    }
  }, [visible]);
  
  // For demo purposes only - simulates getting a recent blockhash
  const getBlockhash = async () => {
    try {
      // In production, this would be a call to the actual Solana network
      const blockhash = await getRecentBlockhash();
      console.log("Got blockhash:", blockhash);
      return blockhash;
    } catch (err) {
      console.error("Error getting recent blockhash:", err);
      throw err;
    }
  };
  
  // Create PDAs (Program Derived Addresses) for the marketplace accounts
  const createPDAs = async (
    programId: PublicKey,
    propertyId: string,
    buyerWallet: string,
    sellerWallet: string,
    propertyPubkey: PublicKey,
    transactionCount: number
  ) => {
    // Helper function to find PDA
    const findProgramAddress = async (seeds: Buffer[], programId: PublicKey) => {
      const [publicKey, bump] = await PublicKey.findProgramAddress(seeds, programId);
      return { publicKey, bump };
    };
    
    // Convert string inputs to PublicKeys
    const buyerPublicKey = new PublicKey(buyerWallet);
    const sellerPublicKey = new PublicKey(sellerWallet);
    
    // Derive marketplace PDA
    const marketplacePDA = await findProgramAddress(
      [Buffer.from("marketplace"), sellerPublicKey.toBuffer()],
      programId
    );
    console.log("Marketplace PDA:", marketplacePDA.publicKey.toString());
    
    // Derive property PDA
    const propertyPDA = await findProgramAddress(
      [Buffer.from("property"), marketplacePDA.publicKey.toBuffer(), Buffer.from(propertyId)],
      programId
    );
    console.log("Property PDA:", propertyPDA.publicKey.toString());
    
    // Derive offer PDA
    const offerPDA = await findProgramAddress(
      [Buffer.from("offer"), propertyPubkey.toBuffer(), buyerPublicKey.toBuffer()],
      programId
    );
    console.log("Offer PDA:", offerPDA.publicKey.toString());
    
    // Derive transaction history PDA
    const transactionHistoryPDA = await findProgramAddress(
      [
        Buffer.from("transaction"),
        propertyPubkey.toBuffer(),
        new Uint8Array(new BN(transactionCount + 1).toArray("le", 8)),
      ],
      programId
    );
    console.log("Transaction History PDA:", transactionHistoryPDA.publicKey.toString());
    
    return {
      marketplace: marketplacePDA.publicKey,
      property: propertyPDA.publicKey,
      offer: offerPDA.publicKey,
      transactionHistory: transactionHistoryPDA.publicKey
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
    
    // In a real implementation, this would create the actual Solana instruction
    // with the correct data layout matching the Solana program's expectation
    const data = Buffer.from([37, 74, 217, 157, 79, 49, 35, 6]); // execute_sale discriminator
    
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
    const truncatedLogs = logs.length > 5
      ? [...logs.slice(0, 3), `... and ${logs.length - 3} more logs ...`]
      : logs;
    
    toast({
      title: "Transaction Simulation Result",
      description: (
        <div className="max-h-[200px] overflow-auto text-xs">
          {truncatedLogs.map((log, i) => (
            <div key={i} className="mb-1 font-mono break-all">{log}</div>
          ))}
        </div>
      ),
    });
  };
  
  const handleCreateTransaction = async () => {
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
      const { blockhash } = await connection.getLatestBlockhash();
      
      // Create a new transaction
      const transaction = new Transaction({
        feePayer: isBuyer ? publicKey : new PublicKey(offer.buyer_wallet),
        blockhash,
        lastValidBlockHeight: 1000000000, // Large value to avoid expiration during demo
      });
      
      // Convert strings to PublicKeys
      const programId = new PublicKey(MARKETPLACE_PROGRAM_ID);
      const propertyNftMintPublicKey = new PublicKey(propertyNftMint);
      const buyerPublicKey = new PublicKey(offer.buyer_wallet);
      const sellerPublicKey = new PublicKey(offer.seller_wallet || walletPublicKeyStr);
      
      // Create PDAs
      const pdas = await createPDAs(
        programId,
        offer.property_id,
        offer.buyer_wallet,
        offer.seller_wallet || walletPublicKeyStr,
        new PublicKey("propertyPubkey"), // placeholder - would be real in production
        0 // Transaction count - would be fetched from contract in production
      );
      
      // For demo purposes, we'll use placeholder accounts for the token accounts
      // In a real implementation, these would be queried from the Solana network or created if they don't exist
      const marketplacePDA = pdas.marketplace;
      const propertyPDA = pdas.property;
      const offerPDA = pdas.offer;
      const transactionHistoryPDA = pdas.transactionHistory;
      
      // Create placeholder token accounts (in a real app, these would be actual token accounts)
      const buyerTokenAccount = new PublicKey("BuyerTokenAccountPlaceholder".padEnd(32, '0'));
      const sellerTokenAccount = new PublicKey("SellerTokenAccountPlaceholder".padEnd(32, '0'));
      const marketplaceFeeAccount = new PublicKey("MarketplaceFeeAccountPlaceholder".padEnd(32, '0'));
      const sellerNftAccount = new PublicKey("SellerNftAccountPlaceholder".padEnd(32, '0'));
      const buyerNftAccount = new PublicKey("BuyerNftAccountPlaceholder".padEnd(32, '0'));
      
      // Add the execute_sale instruction
      const executeSaleInstruction = createExecuteSaleInstruction(
        programId,
        marketplacePDA,
        propertyPDA,
        offerPDA,
        transactionHistoryPDA,
        buyerPublicKey,
        sellerPublicKey,
        buyerTokenAccount,
        sellerTokenAccount,
        marketplaceFeeAccount,
        sellerNftAccount,
        buyerNftAccount,
        propertyNftMintPublicKey
      );
      
      // Add the instruction to the transaction
      transaction.add(executeSaleInstruction);
      
      // Show warning to user about demo limitations
      toast({
        title: "Demo Mode",
        description: "This is a demo of the transaction flow. In a real app, this would interact with the Solana blockchain.",
      });
      
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
  
  // For seller: Initiate the sale process
  const handleSellerInitiateSale = async () => {
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
      
      // Mark the transaction as initiated by seller
      setSellerInitiated(true);
      setWaitingForBuyer(true);
      
      toast({
        title: "Sale Initiated",
        description: "You've initiated the sale. Now disconnect your wallet and connect the buyer's wallet to complete the transaction.",
      });
      
    } catch (err) {
      console.error("Error during seller sale initiation:", err);
      toast({
        title: "Error",
        description: "Failed to initiate sale. See console for details.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // For buyer: Complete the transaction by signing
  const handleBuyerCompleteSale = async () => {
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
      
      const transaction = await handleCreateTransaction();
      if (!transaction) return;
      
      // Buyer signs the transaction
      const signedTx = await signTransaction(transaction);
      
      // In a real app, this would be broadcast to the Solana network
      toast({
        title: "Transaction Signed",
        description: "Transaction has been signed by you (buyer). In a real app, it would now be sent to the Solana network.",
      });
      
      // For demo purposes, we'll simulate the database update
      const result = await recordPropertySale(
        offer.property_id,
        offer.seller_wallet || "",   // Seller wallet
        offer.buyer_wallet,          // Buyer wallet (current user)
        offer.amount,                // Sale price in lamports
        "demo-transaction-signature-buyer", 
        token
      );
      
      if (result && result.success) {
        toast({
          title: "Success",
          description: "Property sale has been recorded successfully in the database.",
        });
        onSuccess();
        onClose();
      } else {
        toast({
          title: "Warning",
          description: "Transaction recording encountered an issue. Please check the logs for details.",
          variant: "destructive"
        });
      }
    } catch (err) {
      console.error("Error during buyer sale completion:", err);
      toast({
        title: "Error",
        description: "Failed to complete transaction. See console for details.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={visible} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Execute Property Sale</DialogTitle>
          <DialogDescription>
            {sellerInitiated 
              ? "Now connect with the buyer wallet to complete the transaction."
              : isSeller
                ? "Initiate the sale process for this property."
                : "Complete the purchase of this property. This will deduct SOL from your wallet."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-md">
            <h3 className="text-sm font-medium text-gray-700">Offer Details</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-500">Amount:</div>
              <div className="text-gray-900 font-medium">{(offer.amount / LAMPORTS_PER_SOL).toFixed(2)} SOL</div>
              
              <div className="text-gray-500">Seller:</div>
              <div className="text-gray-900 font-mono text-xs break-all">
                {offer.seller_wallet || "<Unknown Seller>"}
              </div>
              
              <div className="text-gray-500">Buyer:</div>
              <div className="text-gray-900 font-mono text-xs break-all">
                {offer.buyer_wallet}
              </div>
              
              <div className="text-gray-500">Property ID:</div>
              <div className="text-gray-900">{offer.property_id}</div>
            </div>
          </div>
          
          {connected && (
            <div className="bg-green-50 p-4 rounded-md text-sm text-green-800">
              <p className="font-medium">Connected Wallet:</p>
              <p className="font-mono text-xs break-all mt-1">{publicKey?.toString()}</p>
            </div>
          )}
          
          {Object.keys(errors).length > 0 && (
            <div className="bg-red-50 text-red-800 p-4 rounded-md text-sm">
              {Object.values(errors).map((error, i) => (
                <p key={i}>{error}</p>
              ))}
            </div>
          )}
          
          {waitingForBuyer && (
            <div className="bg-yellow-50 text-yellow-800 p-4 rounded-md text-sm">
              <p className="font-medium">Action Required:</p>
              <ol className="list-decimal pl-5 mt-2 space-y-1">
                <li>Disconnect the current wallet (seller)</li>
                <li>Connect the buyer's wallet</li>
                <li>Complete the transaction by clicking "Sign & Complete Purchase"</li>
              </ol>
            </div>
          )}
          
          <div className="bg-blue-50 text-blue-800 p-4 rounded-md text-sm">
            <p><strong>Test Flow Instructions:</strong></p>
            <ol className="list-decimal pl-5 mt-2 space-y-1">
              <li>Start with seller wallet connected and click "Initiate Sale"</li>
              <li>Disconnect seller's wallet (click on the wallet button)</li>
              <li>Connect buyer's wallet</li>
              <li>Click "Sign & Complete Purchase" to finalize the transaction</li>
            </ol>
          </div>
        </div>
        
        <DialogFooter className="flex justify-between items-center">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          
          {sellerInitiated && isBuyer ? (
            <Button 
              onClick={handleBuyerCompleteSale}
              disabled={isSubmitting}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {isSubmitting ? "Processing..." : "Sign & Complete Purchase"}
            </Button>
          ) : isSeller && !sellerInitiated ? (
            <Button 
              onClick={handleSellerInitiateSale}
              disabled={isSubmitting}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {isSubmitting ? "Processing..." : "Initiate Sale"}
            </Button>
          ) : sellerInitiated && !isBuyer ? (
            <Button 
              disabled={true}
              className="bg-gray-400 text-white"
            >
              Please Connect Buyer Wallet
            </Button>
          ) : (
            <Button 
              disabled={true}
              className="bg-gray-400 text-white"
            >
              {isBuyer ? "Waiting for Seller to Initiate" : "Invalid Wallet"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 