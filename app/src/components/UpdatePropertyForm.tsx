import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useToast } from "@/hooks/use-toast";
import { useRouter } from 'wouter';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { BN } from "@project-serum/anchor";
import { Connection, PublicKey, Transaction, TransactionInstruction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { useAuth } from "@/hooks/useAuth";

// Define the Property interface
interface Property {
  property_id: string;
  owner: string;
  price: number;
  description?: string;
  is_active: boolean;
  nft_mint_address?: string;
  nft_mint?: string;
  nft_token_account?: string;
  metadata_uri?: string;
}

// Constants for blockchain interaction
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const SOLANA_RPC_ENDPOINT = "https://api.devnet.solana.com";
const MARKETPLACE_PROGRAM_ID = "E7v7RResymJU5XvvPA9uwxGSEEsdSE6XvaP7BTV2GGoQ";

// Import the IDL for reference
import idlJsonRaw from "@/idl/real_estate_marketplace.json";

interface UpdatePropertyFormProps {
  property: Property;
  onClose: () => void;
  onSuccess?: (updatedProperty: Property) => void;
}

export function UpdatePropertyForm({ property, onClose, onSuccess }: UpdatePropertyFormProps) {
  const auth = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [price, setPrice] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Initialize form with current property data
  useEffect(() => {
    // Format price from lamports to SOL if it's stored in lamports
    const priceValue = property.price;
    // Check if price is likely in lamports already (large number)
    if (priceValue > 10000) {
      // Convert from lamports to SOL for display
      setPrice((priceValue / LAMPORTS_PER_SOL).toString());
    } else {
      // If already in SOL, just use as is
      setPrice(priceValue > 0 ? priceValue.toString() : '');
    }
    setImageUrl(property.metadata_uri || '');
    // Handle undefined is_active with default value (true)
    setIsActive(property.is_active === undefined ? true : property.is_active);
  }, [property]);

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPrice(e.target.value);
    // Clear error for this field when user types
    if (errors.price) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.price;
        return newErrors;
      });
    }
  };

  const handleImageUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageUrl(e.target.value);
    // Clear error for this field when user types
    if (errors.imageUrl) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.imageUrl;
        return newErrors;
      });
    }
  };

  const toggleActiveStatus = () => {
    setIsActive(!isActive);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (price && (isNaN(Number(price)) || Number(price) <= 0)) {
      newErrors.price = "Price must be a positive number";
    }
    
    if (imageUrl) {
      try {
        const url = new URL(imageUrl);
        if (!url.protocol.startsWith('http')) {
          newErrors.imageUrl = "Image URL must use HTTP or HTTPS protocol";
        }
      } catch (e) {
        newErrors.imageUrl = "Please enter a valid URL";
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Get auth token from localStorage
  const getAuthToken = (): string => {
    const token = localStorage.getItem('jwt_token');
    if (token) {
      return token;
    }
    
    // Try to get from session storage as fallback
    const sessionToken = sessionStorage.getItem('jwt_token');
    if (sessionToken) {
      return sessionToken;
    }
    
    throw new Error("Authentication token not found. Please login again.");
  };

  // Build update property instruction with fixed discriminator and proper encoding
  const buildUpdatePropertyInstruction = (
    programId: PublicKey,
    price: BN | null, 
    metadataUri: string,
    isActive: boolean,
    accounts: {
      property: PublicKey;
      owner: PublicKey;
      owner_nft_account: PublicKey;
      property_nft_mint: PublicKey;
    }
  ): TransactionInstruction => {
    // Manually create instruction data buffer
    const buffers: Buffer[] = [];
    
    // Instruction discriminator (8 bytes) - This is the correct discriminator from your IDL
    const instructionDiscriminator = Buffer.from([232, 71, 59, 188, 98, 74, 94, 54]);
    buffers.push(instructionDiscriminator);
    
    // Price (option<u64>)
    if (price !== null) {
      // Option is Some(1)
      const priceSomeBuffer = Buffer.alloc(1);
      priceSomeBuffer.writeUInt8(1, 0);
      buffers.push(priceSomeBuffer);
      
      // BN value (8 bytes, little endian)
      const priceBuffer = Buffer.alloc(8);
      const priceArray = price.toArray('le', 8);
      for (let i = 0; i < 8; i++) {
        priceBuffer.writeUInt8(priceArray[i], i);
      }
      buffers.push(priceBuffer);
    } else {
      // Option is None(0)
      const priceNoneBuffer = Buffer.alloc(1);
      priceNoneBuffer.writeUInt8(0, 0);
      buffers.push(priceNoneBuffer);
    }
    
    // MetadataUri (option<string>)
    if (metadataUri) {
      // Option is Some(1)
      const metadataUriSomeBuffer = Buffer.alloc(1);
      metadataUriSomeBuffer.writeUInt8(1, 0);
      buffers.push(metadataUriSomeBuffer);
      
      // String length as u32 little endian
      const strBytes = Buffer.from(metadataUri);
      const strLenBuffer = Buffer.alloc(4);
      strLenBuffer.writeUInt32LE(strBytes.length, 0);
      buffers.push(strLenBuffer);
      
      // String bytes
      buffers.push(strBytes);
    } else {
      // Option is None(0)
      const metadataUriNoneBuffer = Buffer.alloc(1);
      metadataUriNoneBuffer.writeUInt8(0, 0);
      buffers.push(metadataUriNoneBuffer);
    }
    
    // IsActive (option<bool>)
    const isActiveBuffer = Buffer.alloc(1);
    isActiveBuffer.writeUInt8(1, 0); // Some(1)
    buffers.push(isActiveBuffer);
    
    const isActiveFlagBuffer = Buffer.alloc(1);
    isActiveFlagBuffer.writeUInt8(isActive ? 1 : 0, 0);
    buffers.push(isActiveFlagBuffer);
    
    // Combine all buffers into instruction data
    const instructionData = Buffer.concat(buffers);
    
    console.log(`Instruction data encoded (${instructionData.length} bytes)`);
    console.log(`Instruction parameters: price=${price?.toString() || 'null'}, metadata_uri=${metadataUri}, is_active=${isActive}`);

    // Create instruction with accounts matching the UpdateProperty struct in the Rust program
    const keys = [
      { pubkey: accounts.property, isSigner: false, isWritable: true },
      { pubkey: accounts.owner, isSigner: true, isWritable: true },
      { pubkey: accounts.owner_nft_account, isSigner: false, isWritable: true },
      { pubkey: accounts.property_nft_mint, isSigner: false, isWritable: false }
    ];
    
    // Log the final instruction accounts for debugging
    console.log("Update property instruction accounts:");
    keys.forEach((key, index) => {
      console.log(`${index}: ${key.pubkey.toString()} (signer: ${key.isSigner}, writable: ${key.isWritable})`);
    });

    return new TransactionInstruction({
      keys,
      programId,
      data: instructionData,
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Collect the updates
      const updates: Record<string, any> = {};
      
      // Only include fields that have changed
      if (price && parseFloat(price) !== property.price) {
        const parsedPrice = parseFloat(price);
        console.log(`Updating price from ${property.price} to ${parsedPrice}`);
        updates.price = parsedPrice;
      }
      
      if (imageUrl && imageUrl !== property.metadata_uri) {
        updates.metadata_uri = imageUrl;
      }
      
      if (isActive !== property.is_active) {
        updates.is_active = isActive;
      }
      
      // If nothing has changed, inform user and exit
      if (Object.keys(updates).length === 0) {
        toast({
          title: "No changes detected",
          description: "Please modify at least one field before submitting.",
          variant: "default",
        });
        setIsSubmitting(false);
        return;
      }
      
      console.log("Starting property update process...");
      
      // Debug property information with correct field names
      console.log("Property data:", {
        id: property.property_id,
        nft_mint_address: property.nft_mint_address,
        nft_token_account: property.nft_token_account,
        owner: property.owner,
        price: property.price
      });
      
      // Check authentication
      const token = getAuthToken();
      if (!token) {
        setErrors({ auth: "You must be logged in to update a property" });
        setIsSubmitting(false);
        return;
      }

      // Get Phantom provider directly from window object
      // @ts-ignore - Phantom global type
      const phantomProvider = window.solana;
      
      if (!phantomProvider || !phantomProvider.isPhantom) {
        setErrors({ wallet: "Phantom wallet is not installed. Please install Phantom wallet extension." });
        setIsSubmitting(false);
        return;
      }
      
      // Check if connected directly
      if (!phantomProvider.isConnected) {
        try {
          console.log("Connecting to Phantom wallet...");
          await phantomProvider.connect();
          console.log("Connected to Phantom wallet");
        } catch (connectError) {
          console.error("Error connecting to Phantom:", connectError);
          setErrors({ wallet: "Failed to connect to Phantom wallet. Please try again." });
          setIsSubmitting(false);
          return;
        }
      }
      
      // Get wallet public key and convert to PublicKey object
      const walletPublicKeyStr = phantomProvider.publicKey?.toString();
      if (!walletPublicKeyStr) {
        setErrors({ wallet: "Could not detect your wallet public key." });
        setIsSubmitting(false);
        return;
      }
      
      const walletPublicKey = new PublicKey(walletPublicKeyStr);
      console.log("Using wallet public key:", walletPublicKey.toString());

      // Check if we have the necessary NFT info to use blockchain
      // Check for both nft_mint (from old format) and nft_mint_address (from new format)
      const hasNftInfo = property.nft_mint_address !== undefined && property.nft_mint_address !== '' ||
                        property.nft_mint !== undefined && property.nft_mint !== '';
      
      console.log("NFT info check:", { 
        hasNftInfo, 
        nft_mint_address: property.nft_mint_address, 
        nft_mint: property.nft_mint 
      });
      
      // In handleSubmit function, replace API-only approach with blockchain for NFT properties
      if (hasNftInfo) {
        // Use blockchain approach if NFT info exists
        console.log("Using blockchain update for property with NFT");
        await updatePropertyViaBlockchain(token, walletPublicKey, phantomProvider);
      } else {
        // For properties without NFT info, just update via backend API
        console.log("Property has no NFT info, using API update only");
        await updatePropertyViaApi(token);
      }
      
    } catch (error: unknown) {
      console.error("Error updating property:", error);
      let errorMessage = "Failed to update property";
      
      if (error instanceof Error) {
        errorMessage = error.message;
        
        if (errorMessage.includes("Wallet not connected")) {
          setErrors({ wallet: "Wallet not connected. Please connect your wallet and try again." });
        } else if (errorMessage.includes("User rejected")) {
          setErrors({ wallet: "You declined to sign the transaction." });
        } else {
          setErrors({ form: errorMessage });
        }
      } else {
        setErrors({ form: errorMessage });
      }
      
      toast({
        title: "Error",
        description: errorMessage
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update property via blockchain transaction with fixes
  const updatePropertyViaBlockchain = async (token: string, walletPublicKey: PublicKey, phantomProvider: any) => {
    try {
      // Prepare parameters for blockchain transaction
      const connection = new Connection(SOLANA_RPC_ENDPOINT, "confirmed");
      const programId = new PublicKey(MARKETPLACE_PROGRAM_ID);
      const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
      
      console.log("Using RPC endpoint:", SOLANA_RPC_ENDPOINT);
      console.log("Using program ID:", MARKETPLACE_PROGRAM_ID);
      console.log("Using TOKEN_PROGRAM_ID:", TOKEN_PROGRAM_ID.toString());
      
      // Get NFT mint address - check both property.nft_mint and property.nft_mint_address
      let nftMintAddress = '';
      if (property.nft_mint_address) {
        nftMintAddress = property.nft_mint_address;
        console.log("Using nft_mint_address:", nftMintAddress);
      } else if (property.nft_mint) {
        nftMintAddress = property.nft_mint;
        console.log("Using nft_mint:", nftMintAddress);
      } else {
        throw new Error("Property doesn't have a valid NFT mint address");
      }
      
      // Convert price to lamports if provided
      let priceBN = null;
      if (price && price.trim() !== '') {
        const priceValue = parseFloat(price);
        if (!isNaN(priceValue) && priceValue > 0) {
          console.log(`Converting price ${priceValue} SOL to lamports`);
          // Use Math.floor to ensure we get a whole number of lamports
          const priceInLamports = Math.floor(priceValue * LAMPORTS_PER_SOL);
          priceBN = new BN(priceInLamports);
          console.log(`Price in lamports: ${priceBN.toString()}`);
        }
      }
      
      // Find marketplace PDA using fixed marketplace authority
      const marketplaceAuthority = new PublicKey("A9xYe8XDnCRyPdy7B75B5PT7JP9ktLtxi6xMBVa7C4Xd");
      console.log("Using marketplace authority:", marketplaceAuthority.toString());
      
      // Try multiple authorities if needed
      const possibleAuthorities = [
        "A9xYe8XDnCRyPdy7B75B5PT7JP9ktLtxi6xMBVa7C4Xd", // Default value
        "97FYGBwDi8vGwJv9NLREgSNNqmDM6kBkGfWEZsJ27H7K", 
        "BWRHBY5p1PLYDp2TxuTf5MvyQ2osJGa3NvPyNQTuPbUK",
        "5hAKEi9mYmnXxKZ8D5r4qQcT3ZyEqCej9SBwfSm1CZiY",
        "AeLeSdwrv9F24eT4JFtcWEKqXTsVGYhHHGNAg4nHWjm5"
      ];
      
      console.log("Trying to find the correct marketplace authority...");
      
      let correctMarketplacePDA = null;
      let correctPropertyPDA = null;
      
      for (const authStr of possibleAuthorities) {
        const auth = new PublicKey(authStr);
        console.log(`Trying authority: ${auth.toString()}`);
        
        const [mpPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("marketplace"), auth.toBuffer()],
          programId
        );
        
        const [propPDA] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("property"),
            mpPDA.toBuffer(),
            Buffer.from(property.property_id)
          ],
          programId
        );
        
        console.log(`Generated property PDA: ${propPDA.toString()}`);
        
        // Check if this property PDA exists
        const accountInfo = await connection.getAccountInfo(propPDA);
        if (accountInfo && accountInfo.owner.equals(programId)) {
          console.log(`✅ Found matching property PDA with authority ${authStr}`);
          correctMarketplacePDA = mpPDA;
          correctPropertyPDA = propPDA;
          break;
        }
      }
      
      if (!correctMarketplacePDA || !correctPropertyPDA) {
        console.log("Using default PDAs since no match was found");
        const [marketplacePDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("marketplace"), marketplaceAuthority.toBuffer()],
          programId
        );
        
        const [propertyPDA] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("property"),
            marketplacePDA.toBuffer(),
            Buffer.from(property.property_id)
          ],
          programId
        );
        
        correctMarketplacePDA = marketplacePDA;
        correctPropertyPDA = propertyPDA;
      }
      
      console.log("Using marketplace PDA:", correctMarketplacePDA.toString());
      console.log("Using property PDA:", correctPropertyPDA.toString());
      
      // Find property PDA using the property_id
      console.log("Finding property PDA with property_id:", property.property_id);
      
      // Create NFT mint public key from address string
      const nftMintPublicKey = new PublicKey(nftMintAddress);
      console.log("Using NFT mint public key:", nftMintPublicKey.toString());
      
      // Get NFT Token Account - IMPORTANT: This is a critical part for ownership verification
      let ownerNftAccount;
      
      // First, always determine the correct associated token account
      const expectedTokenAccount = await getAssociatedTokenAddress(
        nftMintPublicKey,
        walletPublicKey
      );
      console.log("Expected associated token account:", expectedTokenAccount.toString());
      
      // Ensure we're using the correct NFT token account that the owner actually owns
      if (property.nft_token_account) {
        // Use stored token account if available
        ownerNftAccount = new PublicKey(property.nft_token_account);
        console.log("Stored NFT token account:", ownerNftAccount.toString());
        
        // Check if stored token account matches the correct associated token account
        if (!ownerNftAccount.equals(expectedTokenAccount)) {
          console.warn("WARNING: Stored token account doesn't match expected associated token account!");
          console.warn(`Stored: ${ownerNftAccount.toString()} vs Expected: ${expectedTokenAccount.toString()}`);
          
          // Check if the expected token account exists and contains the NFT
          const expectedAccountInfo = await connection.getParsedAccountInfo(expectedTokenAccount);
          if (expectedAccountInfo.value) {
            // Use the correct associated token account instead
            console.log("Switching to the correct associated token account...");
            ownerNftAccount = expectedTokenAccount;
          } else {
            console.log("Expected associated token account doesn't exist, trying stored account...");
          }
        }
        
        // Verify this account actually belongs to the wallet and contains the NFT
        try {
          const tokenAccountInfo = await connection.getParsedAccountInfo(ownerNftAccount);
          if (tokenAccountInfo.value) {
            const accountData = tokenAccountInfo.value.data as any;
            // Check if the token account is owned by the wallet trying to make the update
            const tokenOwner = new PublicKey(accountData.parsed.info.owner);
            if (!tokenOwner.equals(walletPublicKey)) {
              console.warn("WARNING: Token account owner doesn't match wallet!", {
                tokenOwner: tokenOwner.toString(),
                walletPublicKey: walletPublicKey.toString()
              });
              throw new Error("You don't appear to be the owner of this property's NFT");
            }
            
            // Check if the token account actually has the NFT (amount should be 1)
            const tokenAmount = accountData.parsed.info.tokenAmount;
            if (!tokenAmount.uiAmount || tokenAmount.uiAmount < 1) {
              console.warn("WARNING: Token account doesn't contain the NFT!", {
                tokenAmount: tokenAmount.uiAmount
              });
              throw new Error("Your wallet doesn't own this property's NFT");
            }
            
            // Check if the token account is for the correct mint
            const mintAddress = new PublicKey(accountData.parsed.info.mint);
            if (!mintAddress.equals(nftMintPublicKey)) {
              console.warn("WARNING: Token account mint doesn't match property NFT mint!", {
                tokenMint: mintAddress.toString(),
                propertyNftMint: nftMintPublicKey.toString()
              });
              throw new Error("Token account doesn't match the property's NFT mint");
            }
            
            console.log("✅ Verified token account belongs to wallet owner, contains the NFT, and matches the correct mint");
          } else {
            throw new Error("Could not verify token account ownership");
          }
        } catch (tokenError) {
          console.error("Error verifying token account ownership:", tokenError);
          
          // Always use the expected associated token account as a fallback
          ownerNftAccount = expectedTokenAccount;
          console.log("Switched to expected associated token account:", ownerNftAccount.toString());
          
          // Verify the expected account exists and contains the NFT
          const expectedAccountInfo = await connection.getParsedAccountInfo(ownerNftAccount);
          if (!expectedAccountInfo.value) {
            throw new Error("You don't own the NFT associated with this property");
          }
          
          const expectedAccountData = expectedAccountInfo.value.data as any;
          
          // Check token amount
          const tokenAmount = expectedAccountData.parsed.info.tokenAmount;
          if (!tokenAmount.uiAmount || tokenAmount.uiAmount < 1) {
            throw new Error("Your wallet doesn't own this property's NFT");
          }
          
          // Check mint
          const mintAddress = new PublicKey(expectedAccountData.parsed.info.mint);
          if (!mintAddress.equals(nftMintPublicKey)) {
            throw new Error("Token account doesn't match the property's NFT mint");
          }
          
          console.log("✅ Verified associated token account contains the NFT and matches the correct mint");
        }
      } else {
        // Otherwise use the expected associated token account
        ownerNftAccount = expectedTokenAccount;
        console.log("Using expected associated token account:", ownerNftAccount.toString());
        
        // Check if this account exists and has the NFT
        const accountInfo = await connection.getParsedAccountInfo(ownerNftAccount);
        if (!accountInfo.value) {
          throw new Error("You don't own the NFT associated with this property");
        }
        
        // Check token amount
        const accountData = accountInfo.value.data as any;
        const tokenAmount = accountData.parsed.info.tokenAmount;
        if (!tokenAmount.uiAmount || tokenAmount.uiAmount < 1) {
          throw new Error("Your wallet doesn't own this property's NFT");
        }
        
        // Check mint
        const mintAddress = new PublicKey(accountData.parsed.info.mint);
        if (!mintAddress.equals(nftMintPublicKey)) {
          throw new Error("Token account doesn't match the property's NFT mint");
        }
        
        console.log("✅ Verified associated token account contains the NFT and matches the correct mint");
      }
      
      // Get a fresh blockhash from the backend
      console.log("Getting fresh blockhash from backend...");
      const blockhashResponse = await axios.get(
        `${BACKEND_URL}/api/blockhash`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (blockhashResponse.status !== 200) {
        throw new Error(`Failed to get blockhash: ${blockhashResponse.statusText}`);
      }
      
      const { blockhash } = blockhashResponse.data;
      console.log("Got fresh blockhash from backend:", blockhash);
      
      // Create a transaction with the fresh blockhash
      const transaction = new Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = walletPublicKey;
      
      // Get the actual property account data to verify ownership
      console.log("Fetching property account data to verify ownership...");
      const propertyAccountInfo = await connection.getAccountInfo(correctPropertyPDA);
      
      if (!propertyAccountInfo) {
        throw new Error("Property account not found on-chain");
      }
      
      // Build update instruction with proper account configuration
      const updateInstruction = buildUpdatePropertyInstruction(
        programId,
        priceBN,
        imageUrl,
        isActive,
        {
          property: correctPropertyPDA,
          owner: walletPublicKey,
          owner_nft_account: ownerNftAccount,
          property_nft_mint: nftMintPublicKey
        }
      );
      
      transaction.add(updateInstruction);
      
      // Simulate the transaction first to check for potential errors
      console.log("Simulating transaction before signing...");
      try {
        // Log details of accounts involved in the transaction
        console.log("Logging details of accounts in the transaction...");
        const accountsToCheck = [
          walletPublicKey,
          correctPropertyPDA,
          ownerNftAccount,
          nftMintPublicKey
        ];
        await logAccountDetails(connection, accountsToCheck);
        
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
          displayProgramLogs(extractedLogs);
        }
        
        // Check if simulation was successful
        if (simulation.value.err) {
          console.error("Transaction simulation failed:", simulation.value.err);
          
          const errJson = JSON.stringify(simulation.value.err);
          console.error("Simulation error details:", errJson);
          
          // Extract logs from error if available
          if (typeof simulation.value.err === 'object' && simulation.value.err !== null) {
            const err = simulation.value.err as any;
            if (err.logs) {
              console.error("=== SIMULATION ERROR LOGS ===");
              err.logs.forEach((log: string, i: number) => {
                console.error(`${i+1}: ${log}`);
                
                // Extract program logs
                if (log.includes("Program log:")) {
                  const logMessage = log.split("Program log: ")[1];
                  extractedLogs.push(logMessage);
                }
              });
              console.error("=== END SIMULATION ERROR LOGS ===");
              
              // Update UI logs
              displayProgramLogs(extractedLogs);
            }
          }
          
          // Confirm if user wants to proceed despite simulation error
          const proceedDespiteError = window.confirm(
            "Transaction simulation failed. This transaction will likely fail when submitted to the blockchain.\n\n" +
            "Do you want to try submitting it anyway?\n\n" +
            "Details: " + (typeof simulation.value.err === 'string' ? simulation.value.err : JSON.stringify(simulation.value.err))
          );
          
          if (!proceedDespiteError) {
            throw new Error("Transaction canceled after simulation failure.");
          }
          
          console.log("User chose to proceed despite simulation error");
        } else {
          console.log("Transaction simulation successful, proceeding to sign");
        }
      } catch (simulationError) {
        console.error("Error during transaction simulation:", simulationError);
        // Still allow the transaction to proceed if simulation fails for technical reasons
        console.log("Proceeding with transaction despite simulation error");
      }
      
      console.log("Transaction built, requesting signing from Phantom...");
      
      // Use Phantom's signTransaction directly
      const signedTransaction = await phantomProvider.signTransaction(transaction);
      console.log("Transaction signed successfully by Phantom");
      
      const serializedTransaction = signedTransaction.serialize();
      console.log("Transaction serialized, size:", serializedTransaction.length, "bytes");
      
      // Submit the signed transaction to the backend
      console.log("Submitting signed transaction to backend...");
      
      // Create metadata object for database update
      const metadataObj = {
        property_id: property.property_id,
        price: priceBN ? priceBN.toNumber() / LAMPORTS_PER_SOL : null,
        is_active: isActive,
        metadata_uri: imageUrl
      };
      
      console.log("Transaction metadata:", JSON.stringify(metadataObj, null, 2));
      
      // Submit to the backend for processing
      // Using original endpoint path - adjust as needed if your API uses a different path
      const response = await axios.post(
        `${BACKEND_URL}/api/transactions/submit-no-update`,
        {
          serialized_transaction: Buffer.from(serializedTransaction).toString('base64'),
          metadata: JSON.stringify(metadataObj)
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      console.log("Transaction API response status:", response.status);
      
      if (response.status !== 200) {
        throw new Error(`Failed to submit transaction: ${response.data.message || response.statusText}`);
      }
      
      // Log the transaction signature
      const signature = response.data.signature;
      console.log("Transaction confirmed with signature:", signature);
      
      // Now update the database
      console.log("Blockchain update successful, now updating database...");
      
      // Create a simplified update payload with only what we need to change
      const updateData: Record<string, any> = {};
      
      if (price !== property.price.toString()) {
        // Convert price from SOL to lamports (1 SOL = 1,000,000,000 lamports)
        const priceFloat = parseFloat(price);
        if (!isNaN(priceFloat)) {
          const priceInLamports = Math.floor(priceFloat * LAMPORTS_PER_SOL);
          updateData['price'] = priceInLamports;
          console.log(`Converting price from ${priceFloat} SOL to ${priceInLamports} lamports for database`);
        } else {
          console.log(`Invalid price value: ${price}, using original value`);
          updateData['price'] = property.price;
        }
      }
      
      if (imageUrl !== property.metadata_uri) {
        updateData['metadata_uri'] = imageUrl;
      }
      
      if (isActive !== property.is_active) {
        updateData['is_active'] = isActive;
      }
      
      console.log("Sending database update with data:", updateData);
      
      // Only make the database update API call if we have fields to update
      if (Object.keys(updateData).length > 0) {
        const updateResponse = await axios.patch(
          `${BACKEND_URL}/api/properties/${property.property_id}/update`,
          updateData,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          }
        );
        
        if (updateResponse.status !== 200) {
          console.warn("Database update failed, but blockchain transaction was successful:", updateResponse.data);
        } else {
          console.log("Database updated successfully:", updateResponse.data);
        }
      }
      
      toast({
        title: "Property Updated",
        description: "Your property has been successfully updated on the blockchain and in the database."
      });
      
      // Call the onSuccess callback if provided
      if (onSuccess) {
        const updatedProperty = {
          ...property,
          price: price && price !== '' ? parseFloat(price) : property.price,
          metadata_uri: imageUrl,
          is_active: isActive
        };
        onSuccess(updatedProperty);
      }
    } catch (error) {
      console.error("Transaction submission error:", error);
      
      if (axios.isAxiosError(error)) {
        // Log detailed error information for debugging
        console.error("Axios error details:");
        console.error("- Status:", error.response?.status);
        console.error("- Status text:", error.response?.statusText);
        console.error("- Response data:", error.response?.data);
        
        let isNftOwnershipError = false;
        let programLogs: string[] = [];
        
        if (error.response?.data) {
          const errorText = typeof error.response.data === 'string' 
            ? error.response.data 
            : JSON.stringify(error.response.data);
          
          console.error("Full error text:", errorText);
          
          // Extract program logs if they're included in the response
          const logMatch = errorText.match(/\[(.*?log messages)\]/i);
          if (logMatch) {
            console.error("Transaction included log messages");
            
            // Try to extract log messages from the response
            const logsMatch = errorText.match(/Program log: (.*?)(?=$|\n)/gm);
            if (logsMatch) {
              programLogs = logsMatch.map(log => log.replace('Program log: ', ''));
              console.error("Program logs extracted:", programLogs);
              
              // Display all program logs
              console.error("=== SOLANA PROGRAM LOGS ===");
              programLogs.forEach((log, i) => {
                console.error(`Log ${i+1}: ${log}`);
              });
              console.error("=== END PROGRAM LOGS ===");
              
              // Show logs in UI
              displayProgramLogs(programLogs);
            }
          }
          
          // Include the error code in the message if there is one
          if (errorText.includes("custom program error: 0x")) {
            const errorCodeMatch = errorText.match(/custom program error: (0x[0-9a-fA-F]+)/);
            if (errorCodeMatch) {
              const errorCode = errorCodeMatch[1];
              const errorCodeDec = parseInt(errorCode, 16);
              console.error(`Program error code: ${errorCode} (${errorCodeDec})`);
              
              // Specific handling for known error codes
              if (errorCodeDec === 2000 || errorCode === "0x7d0") {
                isNftOwnershipError = true;
                setErrors({ 
                  form: "You don't own the NFT for this property. The transaction was rejected by the blockchain." 
                });
                
                // Show detailed diagnostic info
                await verifyNFTOwnership();
                
                // Display any debug logs from the program
                if (programLogs.length > 0) {
                  console.error("Debug logs for NFT ownership error:");
                  programLogs.forEach(log => {
                    if (log.includes("DEBUG:") || log.includes("ERROR:")) {
                      console.error(`- ${log}`);
                    }
                  });
                }
                
                toast({
                  title: "NFT Ownership Error",
                  description: "You don't own the NFT for this property. The transaction failed."
                });
                
                // Ask user if they want to try a direct database update instead
                const useDirectUpdate = window.confirm(
                  "There was an error verifying your NFT ownership on the blockchain. Would you like to update just the database record instead?\n\n" +
                  "Note: This won't update the blockchain record, only the database."
                );
                
                if (useDirectUpdate) {
                  console.log("User chose to use direct database update instead");
                  try {
                    await updatePropertyViaApi(token);
                    return; // Early return to avoid throwing another error
                  } catch (apiError) {
                    console.error("API update also failed:", apiError);
                    throw new Error("Both blockchain and API updates failed. Please try again later.");
                  }
                }
                
                return; // Early return for specific errors
              }
            }
          }
        }
        
        // For non-NFT ownership errors, still offer a fallback to API update
        if (!isNftOwnershipError && error.response?.status === 500) {
          const doApiFallback = window.confirm(
            "Blockchain transaction failed. Would you like to update just the database records instead?\n\n" +
            "Note: This won't update the blockchain record, only the database."
          );
          
          if (doApiFallback) {
            try {
              console.log("Falling back to API update...");
              await updatePropertyViaApi(token);
              return; // Early return to avoid throwing the error again
            } catch (apiFallbackError) {
              console.error("API fallback also failed:", apiFallbackError);
              throw new Error("Both blockchain and API updates failed. Please try again later.");
            }
          }
        }
        
        // Show error message from the server if available
        const errorMessage = typeof error.response?.data === 'string' 
          ? error.response.data 
          : error.response?.data?.message || error.message;
        
        toast({
          title: "Transaction Failed",
          description: `Error: ${errorMessage}`
        });
      }
      
      // Rethrow the error to be caught by the main handler
      throw new Error("Blockchain transaction failed. Please try again or check the logs for details.");
    }
  };

  // Update property via API request only
  const updatePropertyViaApi = async (token: string) => {
    try {
      console.log("Using direct API update instead of blockchain update");
      
      // Create a simplified update payload with only what we need to change
      const updateData: Record<string, any> = {};
      
      if (price !== property.price.toString()) {
        // Convert price from SOL to lamports (1 SOL = 1,000,000,000 lamports)
        const priceFloat = parseFloat(price);
        if (!isNaN(priceFloat)) {
          const priceInLamports = Math.floor(priceFloat * LAMPORTS_PER_SOL);
          updateData['price'] = priceInLamports;
          console.log(`Converting price from ${priceFloat} SOL to ${priceInLamports} lamports for database`);
        } else {
          console.log(`Invalid price value: ${price}, using original value`);
          updateData['price'] = property.price;
        }
      }
      
      if (imageUrl !== property.metadata_uri) {
        updateData['metadata_uri'] = imageUrl;
      }
      
      if (isActive !== property.is_active) {
        updateData['is_active'] = isActive;
      }
      
      console.log("Sending API update with data:", updateData);
      
      // Only make the API call if we have fields to update
      if (Object.keys(updateData).length > 0) {
        const response = await axios.patch(
          `${BACKEND_URL}/api/properties/${property.property_id}/update`,
          updateData,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          }
        );
        
        if (response.status !== 200) {
          throw new Error(`API update failed: ${response.data?.message || 'Unknown error'}`);
        }
        
        console.log("API update successful:", response.data);
        
        toast({
          title: "Property Updated",
          description: "Your property has been successfully updated in the database."
        });
        
        // Call the onSuccess callback if provided
        if (onSuccess) {
          const updatedProperty = {
            ...property,
            price: price && price !== '' ? parseFloat(price) * LAMPORTS_PER_SOL : property.price,
            metadata_uri: imageUrl,
            is_active: isActive
          };
          onSuccess(updatedProperty);
        }
      } else {
        console.log("No changes to update in database");
        toast({
          title: "No Changes",
          description: "No changes were made to the property."
        });
      }
    } catch (error) {
      console.error("API update error:", error);
      toast({
        title: "Update Failed",
        description: `Failed to update property: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      
      // Rethrow the error to be caught by the main handler
      throw error;
    }
  };

  // Debugging function to check PDAs
  const verifyPropertyPDA = async () => {
    try {
      console.log("Verifying property PDA derivation...");

      // Create connection
      const connection = new Connection(SOLANA_RPC_ENDPOINT, "confirmed");
      const programId = new PublicKey(MARKETPLACE_PROGRAM_ID);
      
      console.log("Program ID:", programId.toString());
      
      // Try different marketplace authorities to find the correct one
      const possibleAuthorities = [
        "A9xYe8XDnCRyPdy7B75B5PT7JP9ktLtxi6xMBVa7C4Xd", // Current hardcoded value
        "97FYGBwDi8vGwJv9NLREgSNNqmDM6kBkGfWEZsJ27H7K", // Try another common one from the project
        "BWRHBY5p1PLYDp2TxuTf5MvyQ2osJGa3NvPyNQTuPbUK", // Try another possible one
        "5hAKEi9mYmnXxKZ8D5r4qQcT3ZyEqCej9SBwfSm1CZiY", // Additional possible authority
        "AeLeSdwrv9F24eT4JFtcWEKqXTsVGYhHHGNAg4nHWjm5", // Additional possible authority
        "GQw8zKi1u2gFAY8EkJW5HzGDKX1H6H3j7Cps9WzXbCTE"  // Additional possible authority
      ];
      
      for (const authorityStr of possibleAuthorities) {
        const marketplaceAuthority = new PublicKey(authorityStr);
        console.log("Trying marketplace authority:", marketplaceAuthority.toString());
        
        const [marketplacePDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("marketplace"), marketplaceAuthority.toBuffer()],
          programId
        );
        
        console.log("Found marketplace PDA:", marketplacePDA.toString());
        
        // Try both standard version and a lowercase version of the property_id
        const propertyIdVariations = [
          property.property_id,
          property.property_id.toLowerCase(),
          property.property_id.toUpperCase()
        ];
        
        for (const propId of propertyIdVariations) {
          console.log("Trying property_id variation:", propId);
          
          const [propertyPDA] = PublicKey.findProgramAddressSync(
            [
              Buffer.from("property"),
              marketplacePDA.toBuffer(),
              Buffer.from(propId)
            ],
            programId
          );
          
          console.log("Generated property PDA:", propertyPDA.toString());
          
          // Check if account exists
          try {
            const accountInfo = await connection.getAccountInfo(propertyPDA);
            console.log("Account exists:", !!accountInfo);
            if (accountInfo) {
              console.log("Account data size:", accountInfo.data.length);
              console.log("Account owner:", accountInfo.owner.toString());
              if (accountInfo.owner.equals(programId)) {
                console.log("✅ MATCH FOUND: This is likely the correct PDA!");
                console.log("Authority:", authorityStr);
                console.log("Property ID:", propId);
                
                // Try to simulate an update transaction to see debug logs
                await simulateUpdateTransaction(propertyPDA);
                
                // Now check NFT ownership
                await verifyNFTOwnership();
                return;
              }
            }
          } catch (e) {
            console.error("Error checking account:", e);
          }
        }
      }
      
      console.log("❌ No matching PDA found. The property might not be on-chain.");
      
    } catch (e) {
      console.error("Error verifying PDAs:", e);
    }
  };

  // New function to simulate transaction and get program logs
  const simulateUpdateTransaction = async (propertyPDA: PublicKey) => {
    try {
      console.log("\n=== Simulating Update Transaction ===");
      console.log("Using program ID:", MARKETPLACE_PROGRAM_ID);
      
      // Get Phantom provider
      // @ts-ignore - Phantom global type
      const phantomProvider = window.solana;
      
      if (!phantomProvider || !phantomProvider.isPhantom || !phantomProvider.isConnected) {
        console.error("Phantom wallet not connected");
        return;
      }
      
      const walletPublicKey = new PublicKey(phantomProvider.publicKey.toString());
      console.log("Wallet public key:", walletPublicKey.toString());
      
      // Get NFT mint address
      let nftMintAddress = '';
      if (property.nft_mint_address) {
        nftMintAddress = property.nft_mint_address;
      } else if (property.nft_mint) {
        nftMintAddress = property.nft_mint;
      } else {
        console.error("Property doesn't have an NFT mint address");
        return;
      }
      
      const nftMintPublicKey = new PublicKey(nftMintAddress);
      console.log("NFT mint address:", nftMintPublicKey.toString());
      
      // Create connection
      const connection = new Connection(SOLANA_RPC_ENDPOINT, "confirmed");
      const programId = new PublicKey(MARKETPLACE_PROGRAM_ID);
      
      // Get associated token account
      const ownerNftAccount = await getAssociatedTokenAddress(
        nftMintPublicKey,
        walletPublicKey
      );
      console.log("Owner NFT account:", ownerNftAccount.toString());
      
      // Log account details to help with debugging
      console.log("Checking account details before simulation...");
      const accountsToCheck = [
        walletPublicKey,
        propertyPDA,
        ownerNftAccount,
        nftMintPublicKey
      ];
      await logAccountDetails(connection, accountsToCheck);
      
      // Build a transaction to simulate
      const transaction = new Transaction();
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = walletPublicKey;
      
      // Create a minimal price update (doesn't matter for simulation)
      const priceBN = new BN(1 * LAMPORTS_PER_SOL);
      
      // Add update instruction
      const updateInstruction = buildUpdatePropertyInstruction(
        programId,
        priceBN,
        "",
        true,
        {
          property: propertyPDA,
          owner: walletPublicKey,
          owner_nft_account: ownerNftAccount,
          property_nft_mint: nftMintPublicKey
        }
      );
      
      transaction.add(updateInstruction);
      
      // Simulate the transaction
      console.log("Simulating transaction...");
      
      // Log details of accounts in the transaction
      console.log("Logging details of accounts in the transaction...");
      const simulation = await connection.simulateTransaction(transaction);
      
      // Process logs and display them
      const extractedLogs: string[] = [];
      
      // Extract and display logs
      if (simulation.value.logs && simulation.value.logs.length > 0) {
        console.log("=== PROGRAM LOGS FROM SIMULATION ===");
        simulation.value.logs.forEach((log, i) => {
          console.log(`${i+1}: ${log}`);
          
          // Extract and highlight debug messages
          if (log.includes("Program log:")) {
            const logMessage = log.split("Program log: ")[1];
            extractedLogs.push(logMessage);
            
            if (logMessage.includes("DEBUG:") || logMessage.includes("ERROR:")) {
              console.log(`DEBUG MESSAGE: ${logMessage}`);
            }
          }
        });
        console.log("=== END PROGRAM LOGS ===");
        
        // Display logs in UI
        displayProgramLogs(extractedLogs);
      } else if (simulation.value.err) {
        console.log("Simulation failed with error:", simulation.value.err);
        
        // Try to extract logs from error
        const errJson = JSON.stringify(simulation.value.err);
        console.log("Error details:", errJson);
        
        // Look for logs in the error
        if (typeof simulation.value.err === 'object' && simulation.value.err !== null) {
          const err = simulation.value.err as any;
          if (err.logs) {
            console.log("=== ERROR LOGS ===");
            err.logs.forEach((log: string, i: number) => {
              console.log(`${i+1}: ${log}`);
              
              // Extract log messages
              if (log.includes("Program log:")) {
                const logMessage = log.split("Program log: ")[1];
                extractedLogs.push(logMessage);
              }
            });
            console.log("=== END ERROR LOGS ===");
            
            // Display logs in UI
            displayProgramLogs(extractedLogs);
          }
        }
      } else {
        console.log("No logs returned from simulation");
      }
      
      console.log("=== Simulation Complete ===");
    } catch (error) {
      console.error("Error simulating transaction:", error);
    }
  };

  // Add a new function to check NFT ownership in detail
  const verifyNFTOwnership = async () => {
    try {
      console.log("\n=== Verifying NFT Ownership ===");
      
      // Get Phantom provider directly from window object
      // @ts-ignore - Phantom global type
      const phantomProvider = window.solana;
      
      if (!phantomProvider || !phantomProvider.isPhantom) {
        console.error("Phantom wallet not installed");
        return;
      }
      
      // Check if connected
      if (!phantomProvider.isConnected) {
        console.error("Phantom wallet not connected");
        return;
      }
      
      // Get wallet public key
      const walletPublicKeyStr = phantomProvider.publicKey?.toString();
      if (!walletPublicKeyStr) {
        console.error("Could not detect wallet public key");
        return;
      }
      
      const walletPublicKey = new PublicKey(walletPublicKeyStr);
      console.log("Wallet public key:", walletPublicKey.toString());
      
      // Check for NFT mint address
      let nftMintAddress = '';
      if (property.nft_mint_address) {
        nftMintAddress = property.nft_mint_address;
      } else if (property.nft_mint) {
        nftMintAddress = property.nft_mint;
      } else {
        console.error("Property doesn't have an NFT mint address");
        return;
      }
      
      const nftMintPublicKey = new PublicKey(nftMintAddress);
      console.log("NFT mint address:", nftMintPublicKey.toString());
      
      // Create Solana connection
      const connection = new Connection(SOLANA_RPC_ENDPOINT, "confirmed");
      
      // Calculate the expected associated token account
      const expectedTokenAccount = await getAssociatedTokenAddress(
        nftMintPublicKey,
        walletPublicKey
      );
      console.log("Expected token account:", expectedTokenAccount.toString());
      
      // Check if the property has a stored token account
      if (property.nft_token_account) {
        const storedTokenAccount = new PublicKey(property.nft_token_account);
        console.log("Stored token account:", storedTokenAccount.toString());
        console.log("Accounts match:", storedTokenAccount.equals(expectedTokenAccount));
      }
      
      // Check if the expected token account exists
      const expectedAccountInfo = await connection.getParsedAccountInfo(expectedTokenAccount);
      console.log("Expected token account exists:", !!expectedAccountInfo.value);
      
      if (expectedAccountInfo.value) {
        const accountData = expectedAccountInfo.value.data as any;
        const tokenOwner = new PublicKey(accountData.parsed.info.owner);
        console.log("Token owner:", tokenOwner.toString());
        console.log("Owner matches wallet:", tokenOwner.equals(walletPublicKey));
        
        const tokenMint = new PublicKey(accountData.parsed.info.mint);
        console.log("Token mint:", tokenMint.toString());
        console.log("Mint matches property NFT:", tokenMint.equals(nftMintPublicKey));
        
        const tokenAmount = accountData.parsed.info.tokenAmount;
        console.log("Token amount:", tokenAmount.uiAmount);
        console.log("Has NFT (amount ≥ 1):", tokenAmount.uiAmount >= 1);
        
        if (tokenOwner.equals(walletPublicKey) && 
            tokenMint.equals(nftMintPublicKey) && 
            tokenAmount.uiAmount >= 1) {
          console.log("✅ ALL CHECKS PASSED: Wallet owns the NFT");
        } else {
          console.log("❌ VERIFICATION FAILED: Wallet doesn't own the NFT");
        }
      } else {
        console.log("❌ VERIFICATION FAILED: Expected token account doesn't exist");
      }
      
      // If there's a stored token account and it's different from the expected one, check that too
      if (property.nft_token_account && 
          !new PublicKey(property.nft_token_account).equals(expectedTokenAccount)) {
        const storedTokenAccount = new PublicKey(property.nft_token_account);
        console.log("\nChecking stored token account (differs from expected):", storedTokenAccount.toString());
        
        const storedAccountInfo = await connection.getParsedAccountInfo(storedTokenAccount);
        console.log("Stored token account exists:", !!storedAccountInfo.value);
        
        if (storedAccountInfo.value) {
          const accountData = storedAccountInfo.value.data as any;
          const tokenOwner = new PublicKey(accountData.parsed.info.owner);
          console.log("Token owner:", tokenOwner.toString());
          console.log("Owner matches wallet:", tokenOwner.equals(walletPublicKey));
          
          const tokenMint = new PublicKey(accountData.parsed.info.mint);
          console.log("Token mint:", tokenMint.toString());
          console.log("Mint matches property NFT:", tokenMint.equals(nftMintPublicKey));
          
          const tokenAmount = accountData.parsed.info.tokenAmount;
          console.log("Token amount:", tokenAmount.uiAmount);
          console.log("Has NFT (amount ≥ 1):", tokenAmount.uiAmount >= 1);
          
          if (tokenOwner.equals(walletPublicKey) && 
              tokenMint.equals(nftMintPublicKey) && 
              tokenAmount.uiAmount >= 1) {
            console.log("✅ ALL CHECKS PASSED: Wallet owns the NFT (using stored token account)");
          } else {
            console.log("❌ VERIFICATION FAILED: Wallet doesn't own the NFT (using stored token account)");
          }
        }
      }
      
      console.log("=== NFT Ownership Check Complete ===");
      
    } catch (error) {
      console.error("Error verifying NFT ownership:", error);
    }
  };

  // Add this function to display logs in the UI
  const displayProgramLogs = (logs: string[]) => {
    // Function emptied - logs won't be displayed
  };

  const clearProgramLogs = () => {
    // Function emptied
  };

  const logAccountDetails = async (connection: Connection, accounts: PublicKey[]) => {
    console.log("\n=== ACCOUNT DETAILS ===");
    
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      console.log(`Account ${i+1}: ${account.toString()}`);
      
      try {
        const accountInfo = await connection.getAccountInfo(account);
        if (accountInfo) {
          console.log(`- Exists: Yes`);
          console.log(`- Owner: ${accountInfo.owner.toString()}`);
          console.log(`- Data size: ${accountInfo.data.length} bytes`);
          console.log(`- Executable: ${accountInfo.executable}`);
          console.log(`- Lamports: ${accountInfo.lamports}`);
          
          if (accountInfo.data.length > 0) {
            try {
              // Try to parse as a token account
              const tokenAccountInfo = await connection.getParsedAccountInfo(account);
              if (tokenAccountInfo.value) {
                const parsed = (tokenAccountInfo.value.data as any).parsed;
                if (parsed && parsed.type === 'account') {
                  console.log(`- Token account: Yes`);
                  console.log(`- Token owner: ${parsed.info.owner}`);
                  console.log(`- Token mint: ${parsed.info.mint}`);
                  console.log(`- Token amount: ${parsed.info.tokenAmount.uiAmount}`);
                }
              }
            } catch (e) {
              // Not a token account, or couldn't parse
              console.log(`- Failed to parse as token account`);
            }
          }
        } else {
          console.log(`- Exists: No`);
        }
      } catch (e) {
        console.error(`- Error getting account info: ${e}`);
      }
      
      console.log("---");
    }
    
    console.log("=== END ACCOUNT DETAILS ===\n");
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit}>
        {errors.form && (
          <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">
            {errors.form}
          </div>
        )}
        
        <div className="mb-4">
          <Label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="price">
            Price (SOL) - Optional
          </Label>
          <Input
            type="number"
            id="price"
            name="price"
            value={price}
            onChange={handlePriceChange}
            className={`w-full border rounded-lg ${errors.price ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="e.g., 10"
            min="0.000000001"
            step="0.000000001"
          />
          {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price}</p>}
          <p className="text-xs text-gray-500 mt-1">Enter price in SOL. Will be converted to lamports (1 SOL = 10^9 lamports).</p>
        </div>
        
        <div className="mb-4">
          <Label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="imageUrl">
            Image URL
          </Label>
          <Input
            type="text"
            id="imageUrl"
            name="imageUrl"
            value={imageUrl}
            onChange={handleImageUrlChange}
            className={`w-full border rounded-lg ${errors.imageUrl ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="https://example.com/image.jpg"
          />
          {errors.imageUrl && <p className="text-red-500 text-xs mt-1">{errors.imageUrl}</p>}
          <p className="text-xs text-gray-500 mt-1">Enter a direct link to your property image</p>
        </div>
        
        <div className="mb-6">
          <Label className="block text-gray-700 text-sm font-medium mb-2">
            Active Listing
          </Label>
          
          <div 
            className="flex cursor-pointer items-center py-2"
            onClick={toggleActiveStatus}
            role="checkbox"
            aria-checked={isActive}
            tabIndex={0}
            onKeyPress={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                toggleActiveStatus();
              }
            }}
          >
            <div className={`mr-3 flex h-6 w-12 items-center rounded-full p-1 ${isActive ? 'bg-blue-600' : 'bg-gray-300'}`}>
              <div className={`h-4 w-4 rounded-full bg-white transition-transform ${isActive ? 'translate-x-6' : 'translate-x-0'}`}></div>
            </div>
            <div className="flex flex-col">
              <span className="font-medium">{isActive ? 'Active' : 'Inactive'}</span>
              <span className="text-xs text-gray-500">
                {isActive 
                  ? "Your property is visible to potential buyers" 
                  : "Your property will be hidden from the marketplace"}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-end gap-4 mt-8">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <div className="flex items-center">
                <span className="animate-spin mr-2">⟳</span> Updating...
              </div>
            ) : "Update Property"}
          </Button>
        </div>
      </form>
    </div>
  );
}
