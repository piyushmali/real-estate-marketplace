import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { PublicKey, Connection, SystemProgram, SYSVAR_RENT_PUBKEY, Keypair, LAMPORTS_PER_SOL, Transaction, TransactionInstruction } from "@solana/web3.js";
import { useProperties } from "@/context/PropertyContext";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { Program, BN, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createInitializeMintInstruction, createAssociatedTokenAccountInstruction, createMintToInstruction } from "@solana/spl-token";
import axios from "axios";
import idlJsonRaw from "@/idl/real_estate_marketplace.json";
import { useToast } from "@/components/ui/use-toast";

// API URL with fallback
const API_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8080";
const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com";

// Debug utility
const debugTransaction = (tx: any) => {
  try {
    const instructionsDetails = tx.instructions?.map((ins: any) => ({
      programId: ins.programId?.toString() || 'unknown',
      keysLength: ins.keys?.length || 0,
      dataLength: ins.data?.length || 0
    })) || [];
    
    const signaturesDetails = tx.signatures?.map((sig: any) => ({
      pubkey: sig.publicKey?.toString() || 'unknown',
      signature: sig.signature ? 'present' : 'null'
    })) || [];
    
    return {
      isValid: !!tx,
      instructions: instructionsDetails,
      signatures: signaturesDetails,
      recentBlockhash: tx.recentBlockhash || 'none',
      feePayer: tx.feePayer?.toString() || 'none'
    };
  } catch (err) {
    return {
      isValid: false,
      error: err.message,
      errorName: err.name,
      tx: typeof tx
    };
  }
};

interface PropertyFormProps {
  onClose: () => void;
}

// Create a compatible IDL structure from the raw JSON
const idlJson: Idl = {
  version: idlJsonRaw.metadata.version,
  name: idlJsonRaw.metadata.name,
  instructions: idlJsonRaw.instructions.map(ix => ({
    name: ix.name,
    accounts: ix.accounts.map(acc => ({
      name: acc.name,
      isMut: acc.writable === true,
      isSigner: acc.signer === true,
    })),
    args: ix.args.map(arg => {
      // Create proper type format for arguments
      let typeDef = arg.type;
      if (typeof typeDef === 'string') {
        // Handle primitive types properly
        return {
          name: arg.name,
          type: typeDef 
        };
      } else {
        // Handle complex types
        return {
          name: arg.name,
          type: typeDef
        };
      }
    }),
  })),
  accounts: idlJsonRaw.accounts.map(acc => ({
    name: acc.name,
    type: {
      kind: "struct",
      fields: [] // Empty fields for now since we don't need account structure
    },
  })),
  events: [],
  errors: idlJsonRaw.errors.map(err => ({
    code: err.code,
    name: err.name,
    msg: err.msg,
  })),
};

// Store program ID separately
const PROGRAM_ID = idlJsonRaw.address;

// Try a more direct approach - bypass IDL processing
const useDirectInstructions = async (
  program: any, 
  instruction: string, 
  args: any[], 
  accounts: Record<string, PublicKey>
) => {
  // Log the instruction we're trying to invoke
  console.log(`Invoking instruction '${instruction}' directly with args:`, args);
  console.log(`Using accounts:`, Object.keys(accounts).join(', '));
  
  // Get the programId directly
  const programId = new PublicKey(PROGRAM_ID);
  
  // Build account metas manually based on the IDL structure
  const getMeta = (rawIx: any) => {
    // Return account metas in format needed by the Transaction
    return rawIx.accounts.map((acc: any) => ({
      pubkey: accounts[acc.name],
      isWritable: acc.writable === true,
      isSigner: acc.signer === true
    }));
  };
  
  // Find the instruction in the raw IDL
  const rawIx = idlJsonRaw.instructions.find(ix => ix.name === instruction);
  if (!rawIx) {
    throw new Error(`Instruction '${instruction}' not found in IDL`);
  }
  
  // Get account metas
  const metas = getMeta(rawIx);
  console.log("Account metas:", metas);
  
  // Use program methods to create instruction
  return program.methods[instruction](...args)
    .accounts(accounts)
    .instruction();
};

export function PropertyForm({ onClose }: PropertyFormProps) {
  const { connected, publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { addProperty } = useProperties();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    property_id: `Property${Math.floor(Math.random() * 10000)}`,
    location: "",
    price: "",
    square_feet: "",
    bedrooms: "",
    bathrooms: "",
    metadata_uri: "https://picsum.photos/400/300", // Default image URL
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error for this field when user types
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.property_id.trim()) {
      newErrors.property_id = "Property ID is required";
    } else if (formData.property_id.length > 32) {
      newErrors.property_id = "Property ID must be less than 32 characters";
    }
    
    if (!formData.location.trim()) {
      newErrors.location = "Location is required";
    } else if (formData.location.length > 255) {
      newErrors.location = "Location must be less than 255 characters";
    }
    
    if (!formData.price) {
      newErrors.price = "Price is required";
    } else if (isNaN(Number(formData.price)) || Number(formData.price) <= 0) {
      newErrors.price = "Price must be a positive number";
    } else if (Number(formData.price) > 1000000) {
      newErrors.price = "Price must be reasonable (less than 1,000,000 SOL)";
    }
    
    if (!formData.square_feet) {
      newErrors.square_feet = "Square feet is required";
    } else if (isNaN(Number(formData.square_feet)) || Number(formData.square_feet) <= 0) {
      newErrors.square_feet = "Square feet must be a positive number";
    } else if (Number(formData.square_feet) > 1000000) {
      newErrors.square_feet = "Square feet must be reasonable (less than 1,000,000)";
    }
    
    if (!formData.bedrooms) {
      newErrors.bedrooms = "Bedrooms is required";
    } else if (isNaN(Number(formData.bedrooms)) || Number(formData.bedrooms) <= 0) {
      newErrors.bedrooms = "Bedrooms must be a positive number";
    } else if (Number(formData.bedrooms) > 100) {
      newErrors.bedrooms = "Bedrooms must be reasonable (less than 100)";
    }
    
    if (!formData.bathrooms) {
      newErrors.bathrooms = "Bathrooms is required";
    } else if (isNaN(Number(formData.bathrooms)) || Number(formData.bathrooms) <= 0) {
      newErrors.bathrooms = "Bathrooms must be a positive number";
    } else if (Number(formData.bathrooms) > 100) {
      newErrors.bathrooms = "Bathrooms must be reasonable (less than 100)";
    }
    
    if (!formData.metadata_uri.trim()) {
      newErrors.metadata_uri = "Image URL is required";
    } else {
      try {
        const url = new URL(formData.metadata_uri);
        if (!url.protocol.startsWith('http')) {
          newErrors.metadata_uri = "Image URL must use HTTP or HTTPS protocol";
        }
      } catch (e) {
        newErrors.metadata_uri = "Please enter a valid URL";
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getProgram = () => {
    if (!anchorWallet) throw new Error("Wallet not connected");
    
    const connection = new Connection(RPC_URL, "confirmed");
    
    const provider = new AnchorProvider(
      connection, 
      anchorWallet, 
      { commitment: "confirmed" }
    );
    
    console.log("Bypassing IDL parsing issues");
    
    try {
      // Create a simpler program object with just the methods we need
      console.log("Creating direct program access for:", PROGRAM_ID);
      const programId = new PublicKey(PROGRAM_ID);
      
      // Since we're having issues with Anchor's IDL parsing,
      // create a minimal program object with only what we need
      const minimalProgram = {
        programId,
        provider,
        methods: {
          // Add the methods we need
          listProperty: (...args: any[]) => {
            console.log("Creating listProperty instruction with args:", args);
            return {
              accounts: (accs: any) => {
                console.log("With accounts:", Object.keys(accs));
                return {
                  instruction: async () => {
                    // Find the instruction in the raw IDL
                    const rawIx = idlJsonRaw.instructions.find(ix => ix.name === "list_property");
                    if (!rawIx) {
                      throw new Error(`Instruction 'list_property' not found in IDL`);
                    }
                    
                    return buildInstruction(programId, "list_property", args, accs);
                  }
                };
              }
            };
          }
        }
      };
      
      console.log("Minimal program object created");
      return minimalProgram;
    } catch (err) {
      console.error("Error creating program:", err);
      console.error("Error object:", {
        message: err.message,
        name: err.name,
        stack: err.stack
      });
      
      throw new Error(`Failed to create program: ${err.message}`);
    }
  };

  // Helper function to build a Solana instruction directly
  const buildInstruction = (
    programId: PublicKey,
    instructionName: string,
    args: any[],
    accounts: Record<string, PublicKey>
  ) => {
    console.log(`Building instruction '${instructionName}'`);
    
    // Find the instruction in the IDL
    const instructionDef = idlJsonRaw.instructions.find(ix => 
      ix.name === instructionName.toLowerCase() || 
      ix.name === instructionName || 
      ix.name === "list_property"
    );
    
    if (!instructionDef) {
      throw new Error(`Instruction '${instructionName}' not found in IDL`);
    }
    
    // Use the discriminator from the IDL
    const discriminator = instructionDef.discriminator;
    console.log(`Using discriminator:`, discriminator);
    
    // Create a proper data buffer with discriminator
    const dataArray = [...discriminator]; // Start with the 8-byte discriminator
    
    // In a real implementation, you would serialize the args here
    // For now, we're just doing a minimal implementation
    console.log("Instruction data includes discriminator, actual args will be serialized by backend");
    
    const data = Buffer.from(dataArray);
    
    // Helper function to convert camelCase to snake_case
    const camelToSnake = (str: string) => {
      return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    };
    
    // Define common mappings
    const camelToSnakeMap: Record<string, string> = {
      systemProgram: "system_program",
      tokenProgram: "token_program",
      associatedTokenProgram: "associated_token_program"
    };
    
    // Create account metas
    const keys = Object.entries(accounts).map(([name, pubkey]) => {
      // Try to find account definition using original name
      let accountDef = instructionDef.accounts.find(acc => acc.name === name);
      
      // If not found, try with predefined mapping
      if (!accountDef && camelToSnakeMap[name]) {
        accountDef = instructionDef.accounts.find(acc => acc.name === camelToSnakeMap[name]);
      }
      
      // If still not found, try with automatic camelCase to snake_case conversion
      if (!accountDef) {
        const snakeName = camelToSnake(name);
        accountDef = instructionDef.accounts.find(acc => acc.name === snakeName);
      }
      
      if (!accountDef) {
        console.error(`Available accounts in instruction:`, instructionDef.accounts.map(a => a.name));
        throw new Error(`Account '${name}' not found in instruction '${instructionName}'. Try using snake_case naming (e.g., system_program instead of systemProgram).`);
      }
      
      // Special case: property_nft_mint needs to be a signer regardless of IDL definition
      // This is because we're creating a new mint and it needs to sign the transaction
      // The error 0x66 (InvalidNFTMint) occurs when this account isn't properly set up
      const isPropertyNftMint = name === 'property_nft_mint' || accountDef.name === 'property_nft_mint';
      
      // For property_nft_mint, we need to ensure it's both a signer and writable
      // regardless of what the IDL says
      
      return {
        pubkey,
        isSigner: isPropertyNftMint || accountDef.signer === true,
        isWritable: isPropertyNftMint || accountDef.writable === true
      };
    });
    
    console.log("Created account metas:", keys.map(k => ({ 
      pubkey: k.pubkey.toString(), 
      isSigner: k.isSigner, 
      isWritable: k.isWritable 
    })));
    
    // Use the Solana web3.js TransactionInstruction directly
    return new TransactionInstruction({
      keys,
      programId,
      data
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    if (!connected || !publicKey || !anchorWallet) {
      setErrors({ general: "Please connect your wallet first" });
      return;
    }
    
    setIsSubmitting(true);
    try {
      // Create property metadata object first, to validate we can construct this
      const propertyMetadata = {
        property_id: formData.property_id,
        location: formData.location,
        price: Number(formData.price),
        square_feet: Number(formData.square_feet),
        bedrooms: Number(formData.bedrooms),
        bathrooms: Number(formData.bathrooms),
        metadata_uri: formData.metadata_uri,
        owner: new PublicKey(publicKey.toString()),
      };
      
      console.log("Creating Anchor program connection");
      
      // Initialize Anchor program
      const program = getProgram();
      
      console.log("Program created successfully");
      
      // Create NFT Mint keypair
      const propertyNftMint = Keypair.generate();
      console.log("propertyNftMint created:", {
        publicKey: propertyNftMint.publicKey.toString(),
        secretKey: propertyNftMint.secretKey.length
      });
      
      // Note: The NFT mint is created by the program itself
      // We don't need to initialize it separately, but we need to ensure
      // it's properly passed as a signer to the transaction
      
      console.log("Finding marketplace PDA");
      
      // Find marketplace PDA - hardcoded authority for simplicity
      const marketplaceAuthority = new PublicKey("13EySfdhQL6b7dxzJnw73C33cRUnX1NjPBWEP1gkU43C");
      const [marketplacePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("marketplace"), marketplaceAuthority.toBuffer()],
        program.programId
      );
      
      console.log("Finding property PDA");
      
      // Find property PDA
      const [propertyPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(formData.property_id)],
        program.programId
      );
      
      console.log("Property PDA:", propertyPDA.toString());
      
      console.log("Getting associated token address");
      
      // Find owner's NFT account (ATA)
      const ownerNftAccount = await getAssociatedTokenAddress(
        propertyNftMint.publicKey,
        new PublicKey(publicKey.toString())
      );
      
      console.log("Owner NFT Account:", ownerNftAccount.toString());
      
      console.log("Converting price to BN");
      
      // Convert price to lamports (as BN) - ensure it's a valid number first
      const priceInSol = Number(formData.price);
      if (isNaN(priceInSol)) {
        throw new Error("Invalid price value");
      }
      const price = new BN(priceInSol * LAMPORTS_PER_SOL);
      
      // Convert square feet to BN - ensure it's a valid number first
      const sqFeet = Number(formData.square_feet);
      if (isNaN(sqFeet)) {
        throw new Error("Invalid square feet value");
      }
      const squareFeetBN = new BN(sqFeet);
      
      console.log("Getting fresh blockhash");
      
      // Prepare request to backend for fresh blockhash
      const blockhashResponse = await axios.get(
        `${API_URL}/api/blockhash`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
          }
        }
      );
      const blockhash = blockhashResponse.data.blockhash;
      
      console.log("Building transaction");
      
      // Build transaction with explicit try/catch to catch any errors in the transaction building
      let tx;
      try {
        // Ensure all account inputs are valid PublicKey objects
        if (!marketplacePDA || !propertyPDA || !publicKey || !propertyNftMint.publicKey || !ownerNftAccount) {
          throw new Error("One or more account addresses are invalid");
        }
        
        console.log("All accounts present before transaction build:", {
          marketplace: marketplacePDA.toString(),
          property: propertyPDA.toString(),
          owner: publicKey.toString(),
          property_nft_mint: propertyNftMint.publicKey.toString(),
          owner_nft_account: ownerNftAccount.toString()
        });

        // Log program object info
        console.log("Program info:", {
          programId: program.programId.toString(),
          provider: program.provider.connection.rpcEndpoint
        });

        console.log("Creating instruction directly");
        
        // Create instruction directly using our helper
        const ixData = buildInstruction(
          program.programId,
          "list_property",
          [
            formData.property_id,
            price,
            formData.metadata_uri,
            formData.location,
            squareFeetBN,
            Number(formData.bedrooms),
            Number(formData.bathrooms)
          ], 
          {
            marketplace: marketplacePDA,
            property: propertyPDA,
            owner: new PublicKey(publicKey.toString()),
            // Ensure property_nft_mint is correctly passed
            // The error 0x66 (InvalidNFTMint) indicates an issue with this account
            property_nft_mint: propertyNftMint.publicKey,
            owner_nft_account: ownerNftAccount,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          }
        );
          
        console.log("Instruction created successfully");
        
        // Create a transaction manually
        console.log("Creating transaction manually");
        tx = new Transaction();
        
        // Add mint initialization instruction
        // This is needed to properly initialize the NFT mint account
        // Error 0x66 (InvalidNFTMint) occurs when the mint isn't properly initialized
        console.log("Adding mint initialization instruction");
        const mintRentExempt = await program.provider.connection.getMinimumBalanceForRentExemption(82);
        
        // Create mint account instruction
        const createMintAccountIx = SystemProgram.createAccount({
          fromPubkey: new PublicKey(publicKey.toString()),
          newAccountPubkey: propertyNftMint.publicKey,
          space: 82,
          lamports: mintRentExempt,
          programId: TOKEN_PROGRAM_ID
        });
        
        // Initialize mint instruction - using the imported functions
        const initMintIx = createInitializeMintInstruction(
          propertyNftMint.publicKey,
          0, // 0 decimals for NFT
          new PublicKey(publicKey.toString()),
          new PublicKey(publicKey.toString()) // Set freeze authority to owner as well
        );
        
        // Create associated token account for owner
        const createATAIx = createAssociatedTokenAccountInstruction(
          new PublicKey(publicKey.toString()),
          ownerNftAccount,
          new PublicKey(publicKey.toString()),
          propertyNftMint.publicKey
        );
        
        // Mint one token to the owner - this is important to do BEFORE the list_property instruction
        // The program expects the NFT to be already minted when list_property is called
        const mintToIx = createMintToInstruction(
          propertyNftMint.publicKey,
          ownerNftAccount,
          new PublicKey(publicKey.toString()),
          1, // Mint exactly 1 token for NFT
          []
        );
        
        console.log("Created all token initialization instructions");
        
        // Add all instructions to transaction in the correct order
        // The order is important - we need to fully initialize the NFT mint and mint a token
        // before calling list_property
        tx.add(createMintAccountIx);
        tx.add(initMintIx);
        tx.add(createATAIx);
        tx.add(mintToIx);
        
        // Add the list_property instruction last, after the NFT is fully initialized
        tx.add(ixData);
        
        console.log("Added all instructions to transaction");
        
        // Set recent blockhash
        tx.recentBlockhash = blockhash;
        tx.feePayer = new PublicKey(publicKey.toString());
        
        // Make sure the propertyNftMint is included as a signer
        // This is critical for the NFT mint initialization to work properly
        tx.partialSign(propertyNftMint);
        
        console.log("Transaction created and signed with propertyNftMint");
        console.log("Transaction details:", debugTransaction(tx));
        
        // Log the signers for debugging
        console.log("Transaction signers:", tx.signatures.map(s => s.publicKey.toString()));
        console.log("Property NFT mint pubkey:", propertyNftMint.publicKey.toString());
        console.log("Is property_nft_mint in signers:", tx.signatures.some(s => s.publicKey.equals(propertyNftMint.publicKey)));
        
        // Verify that the property_nft_mint is included in the transaction signers
        if (!tx.signatures.some(s => s.publicKey.equals(propertyNftMint.publicKey))) {
          throw new Error("Property NFT mint is not included as a signer in the transaction");
        }
        
        // Sign with wallet
        console.log("Signing transaction with wallet");
        const signedTx = await anchorWallet.signTransaction(tx);
        
        console.log("Transaction signed successfully");
        console.log("Signature details:", debugTransaction(signedTx));
        
        // Serialize the transaction
        console.log("Serializing transaction");
        // Make sure we're not requiring all signatures when serializing
        // This is important because the backend will verify and process the transaction
        // We need to include the propertyNftMint signature in the serialized transaction
        const serializedTransaction = signedTx.serialize({verifySignatures: false, requireAllSignatures: false}).toString('base64');
        
        console.log("Transaction serialized, length:", serializedTransaction.length);
        
        // Send to backend
        console.log("Sending transaction to backend");
        // The backend expects only serialized_transaction and metadata
        // The property_nft_mint keypair has already signed the transaction
        const response = await axios.post(
          `${API_URL}/api/transactions/submit`,
          {
            serialized_transaction: serializedTransaction,
            metadata: JSON.stringify(propertyMetadata)
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
            }
          }
        );
        
        console.log("Transaction submitted successfully:", response.data);
        
        // Create a plain serializable property object
        const newProperty = {
          location: formData.location,
          price: Number(formData.price),
          square_feet: Number(formData.square_feet),
          bedrooms: Number(formData.bedrooms),
          bathrooms: Number(formData.bathrooms),
          metadata_uri: formData.metadata_uri,
          owner: publicKey.toString(),
          property_id: formData.property_id
        };
        
        // Add property to local state
        addProperty(newProperty);
        
        toast({
          title: "Property Listed!",
          description: `Your property has been successfully listed. Transaction: ${response.data.signature}`,
        });
        
        onClose();
      } catch (err) {
        console.error("Error adding property:", err);
        console.error("Detailed error info:", {
          message: err.message,
          stack: err.stack,
          name: err.name
        });
        
        // Extract more detailed error message if available from axios response
        let errorMessage = err.message || "Unknown error";
        if (err.response) {
          console.error("Server response:", err.response.data);
          errorMessage = err.response.data || errorMessage;
          // If the error message is an object, try to extract a readable message
          if (typeof errorMessage === 'object') {
            errorMessage = JSON.stringify(errorMessage);
          }
        }
        
        setErrors({ general: `Failed to add property: ${errorMessage}` });
        setIsSubmitting(false);
        
        toast({
          variant: "destructive",
          title: "Transaction Failed",
          description: `Could not list property: ${errorMessage}`,
        });
      }
    } catch (error) {
      console.error("Error adding property:", error);
      setErrors({ general: `Failed to add property: ${error.message || "Unknown error"}` });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-center">List a New Property</h2>
      
      <form onSubmit={handleSubmit}>
        {errors.general && (
          <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">
            {errors.general}
          </div>
        )}
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="property_id">
            Property ID
          </label>
          <input
            type="text"
            id="property_id"
            name="property_id"
            value={formData.property_id}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg ${errors.property_id ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="e.g., Property123"
          />
          {errors.property_id && <p className="text-red-500 text-xs mt-1">{errors.property_id}</p>}
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="location">
            Location
          </label>
          <input
            type="text"
            id="location"
            name="location"
            value={formData.location}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg ${errors.location ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="e.g., 123 Main St, New York, NY"
          />
          {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location}</p>}
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="price">
            Price (SOL)
          </label>
          <input
            type="number"
            id="price"
            name="price"
            value={formData.price}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg ${errors.price ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="e.g., 10"
            min="0.001"
            step="0.001"
          />
          {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price}</p>}
        </div>
        
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="bedrooms">
              Bedrooms
            </label>
            <input
              type="number"
              id="bedrooms"
              name="bedrooms"
              value={formData.bedrooms}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg ${errors.bedrooms ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="e.g., 3"
              min="1"
            />
            {errors.bedrooms && <p className="text-red-500 text-xs mt-1">{errors.bedrooms}</p>}
          </div>
          
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="bathrooms">
              Bathrooms
            </label>
            <input
              type="number"
              id="bathrooms"
              name="bathrooms"
              value={formData.bathrooms}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg ${errors.bathrooms ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="e.g., 2"
              min="1"
              step="0.5"
            />
            {errors.bathrooms && <p className="text-red-500 text-xs mt-1">{errors.bathrooms}</p>}
          </div>
          
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="square_feet">
              Sq. Feet
            </label>
            <input
              type="number"
              id="square_feet"
              name="square_feet"
              value={formData.square_feet}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg ${errors.square_feet ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="e.g., 2000"
              min="1"
            />
            {errors.square_feet && <p className="text-red-500 text-xs mt-1">{errors.square_feet}</p>}
          </div>
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="metadata_uri">
            Image URL
          </label>
          <input
            type="text"
            id="metadata_uri"
            name="metadata_uri"
            value={formData.metadata_uri}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg ${errors.metadata_uri ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="e.g., https://example.com/image.jpg"
          />
          {errors.metadata_uri && <p className="text-red-500 text-xs mt-1">{errors.metadata_uri}</p>}
        </div>
        
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600"
        >
          {isSubmitting ? "Listing..." : "List Property"}
        </button>
      </form>
    </div>
  );
}