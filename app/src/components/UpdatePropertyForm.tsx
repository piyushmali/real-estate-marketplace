import { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Property } from "@/context/PropertyContext";
import axios from "axios";
import { Buffer } from 'buffer';
import { PublicKey, Connection, Transaction, LAMPORTS_PER_SOL, TransactionInstruction } from "@solana/web3.js";
import { BN } from "@project-serum/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { useAuth } from "@/hooks/useAuth";

// Constants for blockchain interaction
const SOLANA_RPC_ENDPOINT = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const MARKETPLACE_PROGRAM_ID = import.meta.env.VITE_MARKETPLACE_PROGRAM_ID || "3UuWL58XcEWoJjpMz61LRsQS3u1Yp7ZedPPG9xpzxLJt";
// Add backend URL constant
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8080";

// Import the IDL for reference
import idlJsonRaw from "@/idl/real_estate_marketplace.json";

interface UpdatePropertyFormProps {
  property: Property;
  onClose: () => void;
  onSuccess?: (updatedProperty: Property) => void;
}

export function UpdatePropertyForm({ property, onClose, onSuccess }: UpdatePropertyFormProps) {
  const wallet = useWallet();
  const auth = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [price, setPrice] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form with current property data
  useEffect(() => {
    // Format price with proper decimal places (avoid showing 0.0000...)
    const priceValue = parseFloat(property.price.toString());
    setPrice(priceValue > 0 ? priceValue.toString() : '');
    setImageUrl(property.description || '');
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

  // Get auth token either from localStorage or directly from auth context
  const getAuthToken = (): string => {
    // Try localStorage first
    const token = localStorage.getItem('token');
    if (token) {
      return token;
    }
    
    // If no token in localStorage but user is authenticated, try to get from auth context
    if (auth.isAuthenticated) {
      // Access token field directly from auth object
      const authToken = (auth as any).token;
      if (authToken) {
        // Save to localStorage for future use
        localStorage.setItem('token', authToken);
        return authToken;
      }
    }
    
    throw new Error("Authentication token not found. Please login again.");
  };

  // Helper function to build the update property instruction directly
  const buildUpdatePropertyInstruction = (
    programId: PublicKey,
    price: BN | null,
    metadataUri: string | null,
    isActive: boolean,
    accounts: Record<string, PublicKey>
  ): TransactionInstruction => {
    // Find the update_property instruction in the IDL
    const instructionDef = idlJsonRaw.instructions.find(ix => ix.name === "update_property");
    if (!instructionDef) {
      throw new Error("update_property instruction not found in IDL");
    }

    // Get the discriminator for update_property
    const discriminator = Buffer.from(instructionDef.discriminator || new Uint8Array(8));
    
    // Serialize arguments
    const buffers: Buffer[] = [];
    
    // Price (option<u64>)
    if (price !== null) {
      // Option is Some
      const optionBuf = Buffer.alloc(1);
      optionBuf.writeUInt8(1, 0); // 1 = Some
      buffers.push(optionBuf);
      
      // u64 value
      const priceBuf = Buffer.alloc(8);
      const priceArr = price.toArray('le', 8);
      priceBuf.set(priceArr);
      buffers.push(priceBuf);
    } else {
      // Option is None
      const optionBuf = Buffer.alloc(1);
      optionBuf.writeUInt8(0, 0); // 0 = None
      buffers.push(optionBuf);
    }
    
    // MetadataUri (option<string>)
    if (metadataUri !== null) {
      // Option is Some
      const optionBuf = Buffer.alloc(1);
      optionBuf.writeUInt8(1, 0); // 1 = Some
      buffers.push(optionBuf);
      
      // String (4-byte length + bytes)
      const strBytes = Buffer.from(metadataUri);
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32LE(strBytes.length, 0);
      buffers.push(lenBuf);
      buffers.push(strBytes);
    } else {
      // Option is None
      const optionBuf = Buffer.alloc(1);
      optionBuf.writeUInt8(0, 0); // 0 = None
      buffers.push(optionBuf);
    }
    
    // IsActive (option<bool>)
    const isActiveBuf = Buffer.alloc(1);
    isActiveBuf.writeUInt8(1, 0); // 1 = Some (we always provide this)
    buffers.push(isActiveBuf);
    
    const boolBuf = Buffer.alloc(1);
    boolBuf.writeUInt8(isActive ? 1 : 0, 0);
    buffers.push(boolBuf);
    
    // Combine discriminator and serialized arguments
    const data = Buffer.concat([discriminator, ...buffers]);
    
    // Create account metas
    const keys = Object.entries(accounts).map(([name, pubkey]) => {
      let isSigner = false;
      let isWritable = false;
      
      // Find the account definition in the instruction
      const accountDef = instructionDef.accounts.find(acc => acc.name === name);
      if (accountDef) {
        isSigner = accountDef.signer === true;
        isWritable = accountDef.writable === true;
      } else {
        console.warn(`Account ${name} not found in instruction definition`);
      }
      
      // Owner is always a signer
      if (name === 'owner') {
        isSigner = true;
      }
      
      return {
        pubkey,
        isSigner,
        isWritable
      };
    });
    
    // Create the instruction
    return new TransactionInstruction({
      keys,
      programId,
      data
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Validate form before submission
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    setErrors({});
    
    try {
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
      
      if (hasNftInfo) {
        // Use blockchain approach if NFT info exists
        await updatePropertyViaBlockchain(token, walletPublicKey, phantomProvider);
      } else {
        // For properties without NFT info, just update via backend API
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

  // Update property via blockchain transaction
  const updatePropertyViaBlockchain = async (token: string, walletPublicKey: PublicKey, phantomProvider: any) => {
    // Prepare parameters for blockchain transaction
    const connection = new Connection(SOLANA_RPC_ENDPOINT, "confirmed");
    const programId = new PublicKey(MARKETPLACE_PROGRAM_ID);
    
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
        priceBN = new BN(Math.floor(priceValue * LAMPORTS_PER_SOL));
        console.log(`Price in lamports: ${priceBN.toString()}`);
      }
    }
    
    // Find marketplace PDA using fixed marketplace authority
    const marketplaceAuthority = new PublicKey("13EySfdhQL6b7dxzJnw73C33cRUnX1NjPBWEP1gkU43C");
    
    const [marketplacePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("marketplace"), marketplaceAuthority.toBuffer()],
      programId
    );
    
    console.log("Found marketplace PDA:", marketplacePDA.toString());
    
    // Find property PDA using the property_id
    const [propertyPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("property"),
        marketplacePDA.toBuffer(),
        Buffer.from(property.property_id)
      ],
      programId
    );
    
    console.log("Found property PDA:", propertyPDA.toString());
    
    // Create NFT mint public key from address string
    const nftMintPublicKey = new PublicKey(nftMintAddress);
    console.log("Using NFT mint public key:", nftMintPublicKey.toString());
    
    // Get NFT Token Account
    let ownerNftAccount;
    
    // Check for token account in property record
    if (property.nft_token_account) {
      // Use stored token account if available
      ownerNftAccount = new PublicKey(property.nft_token_account);
      console.log("Using stored NFT token account:", ownerNftAccount.toString());
    } else {
      // Otherwise derive from mint and wallet
      ownerNftAccount = await getAssociatedTokenAddress(
        nftMintPublicKey,
        walletPublicKey
      );
      console.log("Derived NFT token account:", ownerNftAccount.toString());
    }
    
    // Get latest blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    
    // Create a transaction manually
    const transaction = new Transaction();
    transaction.feePayer = walletPublicKey;
    transaction.recentBlockhash = blockhash;
    
    // Build update instruction manually
    const updateInstruction = buildUpdatePropertyInstruction(
      programId,
      priceBN,
      imageUrl,
      isActive,
      {
        property: propertyPDA,
        owner: walletPublicKey,
        owner_nft_account: ownerNftAccount,
        property_nft_mint: nftMintPublicKey
      }
    );
    
    transaction.add(updateInstruction);
    
    console.log("Transaction built, requesting signing from Phantom...");
    
    // Use Phantom's signTransaction directly
    const signedTransaction = await phantomProvider.signTransaction(transaction);
    console.log("Transaction signed successfully by Phantom");
    
    const serializedTransaction = signedTransaction.serialize();
    console.log("Transaction serialized");
    
    try {
      // Submit transaction to backend for processing with correct field name
      const response = await axios.post(
        `${BACKEND_URL}/api/transactions/submit`,
        {
          serialized_transaction: Buffer.from(serializedTransaction).toString('base64'),
          metadata: JSON.stringify({
            property_id: property.property_id,
            price: priceBN ? priceBN.toNumber() / LAMPORTS_PER_SOL : null,
            is_active: isActive,
            metadata_uri: imageUrl
          })
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (response.status !== 200) {
        throw new Error(`Failed to submit transaction: ${response.data.message || response.statusText}`);
      }
      
      // Log the full response for debugging
      console.log("Transaction response:", response.data);
      
      // The backend just returns the signature without a success flag
      const signature = response.data.signature;
      
      console.log("Transaction confirmed with signature:", signature);
      
      toast({
        title: "Property Updated",
        description: "Your property has been successfully updated on the blockchain."
      });
      
      // Call the onSuccess callback if provided
      if (onSuccess) {
        const updatedProperty = {
          ...property,
          price: price && price !== '' ? parseFloat(price) : property.price,
          description: imageUrl,
          is_active: isActive
        };
        onSuccess(updatedProperty);
      }
    } catch (error) {
      console.error("Transaction submission error:", error);
      
      // Fallback to API update if blockchain update fails
      console.log("Blockchain update failed. Falling back to API update...");
      await updatePropertyViaApi(token);
    }
  };

  // Update property directly via API for properties without NFT info
  const updatePropertyViaApi = async (token: string) => {
    console.log("Updating property directly via API (no blockchain transaction)");
    
    // Create JSON data object instead of FormData
    const updateData: Record<string, any> = {};
    
    // Only include fields that have changed
    if (price !== property.price.toString()) {
      updateData['price'] = parseFloat(price); // Send as number instead of string
    }
    
    if (imageUrl !== property.description) {
      updateData['description'] = imageUrl;
    }
    
    if (isActive !== property.is_active) {
      updateData['is_active'] = isActive;
    }
    
    console.log("Sending API update with data:", updateData);
    
    // Use axios to make the PATCH request with JSON data
    try {
      // Use the original API path structure with /update suffix
      const apiUrl = `${BACKEND_URL}/api/properties/${property.property_id}/update`;
      console.log("Using API URL:", apiUrl);
      
      const response = await axios.patch(
        apiUrl,
        updateData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (response.status !== 200) {
        throw new Error(`Failed to update property: ${response.data.message || response.statusText}`);
      }
      
      console.log("Database updated successfully:", response.data);
      
      toast({
        title: "Property Updated",
        description: "Your property has been successfully updated."
      });
      
      // Call the onSuccess callback if provided
      if (onSuccess) {
        const updatedProperty = {
          ...property,
          price: price && price !== '' ? parseFloat(price) : property.price,
          description: imageUrl,
          is_active: isActive
        };
        onSuccess(updatedProperty);
      }
    } catch (error) {
      console.error("API update error:", error);
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data;
        console.log("Error response data:", errorData);
        const errorMessage = errorData?.message || errorData?.error || error.message;
        throw new Error(`Failed to update property: ${errorMessage}`);
      }
      throw error;
    }
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
            min="0.001"
            step="0.001"
          />
          {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price}</p>}
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
        
        <div className="flex gap-4 mt-8">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-500 text-white hover:bg-blue-600"
          >
            {isSubmitting ? "Updating..." : "Update Property"}
          </Button>
        </div>
      </form>
    </div>
  );
}