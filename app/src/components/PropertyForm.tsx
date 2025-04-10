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
  const { addProperty, getProperties } = useProperties();
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
    
    // Handle price specifically to limit to 1 decimal place
    if (name === 'price') {
      // Allow empty input for better UX
      if (value === '') {
        setFormData(prev => ({ ...prev, [name]: value }));
        return;
      }
      
      // Allow numeric inputs including decimals
      if (/^(\d+\.?\d*|\.\d+)$/.test(value) || value === '') {
        setFormData(prev => ({ ...prev, [name]: value }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    
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
    const discriminator = Buffer.from(instructionDef.discriminator);
    console.log(`Using discriminator:`, discriminator);
    
    // We need to properly serialize our args according to Anchor's format
    // For list_property, we have string, u64, string, string, u64, u8, u8
    
    // Serialize the arguments according to their types
    const serializedArgs = serializeAnchorArgs(args, instructionDef.args);
    
    // Combine discriminator and serialized arguments
    const data = Buffer.concat([discriminator, serializedArgs]);
    console.log("Data buffer created with length:", data.length);
    
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
      const isPropertyNftMint = name === 'property_nft_mint' || accountDef.name === 'property_nft_mint';
      
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

  // Helper function to serialize Anchor arguments
  const serializeAnchorArgs = (args: any[], argDefs: any[]): Buffer => {
    // Let's serialize the arguments properly based on their types
    const buffers: Buffer[] = [];
    
    args.forEach((arg, i) => {
      const argDef = argDefs[i];
      const type = argDef.type;
      
      console.log(`Serializing arg ${i}: ${argDef.name} (${type}) = ${arg}`);
      
      switch (type) {
        case 'string': {
          // Anchor format: 4-byte length prefix + UTF-8 bytes
          const strBytes = Buffer.from(arg);
          const lenBuf = Buffer.alloc(4);
          lenBuf.writeUInt32LE(strBytes.length, 0);
          buffers.push(lenBuf);
          buffers.push(strBytes);
          break;
        }
        case 'u64': {
          // Anchor format: 8-byte little-endian
          const numBuf = Buffer.alloc(8);
          if (arg instanceof BN) {
            const bn = arg as BN;
            const arr = bn.toArray('le', 8);
            numBuf.set(arr);
          } else {
            let bn = new BN(arg);
            const arr = bn.toArray('le', 8);
            numBuf.set(arr);
          }
          buffers.push(numBuf);
          break;
        }
        case 'u8': {
          // Anchor format: 1-byte
          const numBuf = Buffer.alloc(1);
          numBuf.writeUInt8(Number(arg), 0);
          buffers.push(numBuf);
          break;
        }
        case 'bool': {
          // Anchor format: 1-byte (0 or 1)
          const boolBuf = Buffer.alloc(1);
          boolBuf.writeUInt8(arg ? 1 : 0, 0);
          buffers.push(boolBuf);
          break;
        }
        default:
          throw new Error(`Unsupported argument type: ${type}`);
      }
    });
    
    return Buffer.concat(buffers);
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
        price: parseFloat(parseFloat(formData.price).toFixed(1)),
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
      
      // Get the connection from the program provider
      const connection = new Connection(RPC_URL, "confirmed");
      
      // Following the test file approach more closely
      console.log("Finding marketplace PDA");
      
      // Find marketplace PDA - hardcoded authority for simplicity
      const marketplaceAuthority = new PublicKey("A9xYe8XDnCRyPdy7B75B5PT7JP9ktLtxi6xMBVa7C4Xd");
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
      
      // Calculate rent-exempt minimum balance for mint account
      const mintRentExempt = await connection.getMinimumBalanceForRentExemption(82);
      
      // First prepare all the instructions needed
      console.log("Preparing all instructions for combined transaction");
      
      // 1. Create mint account instruction
      const createMintAccountIx = SystemProgram.createAccount({
        fromPubkey: new PublicKey(publicKey.toString()),
        newAccountPubkey: propertyNftMint.publicKey,
        space: 82,
        lamports: mintRentExempt,
        programId: TOKEN_PROGRAM_ID
      });
      
      // 2. Initialize mint instruction
      const initMintIx = createInitializeMintInstruction(
        propertyNftMint.publicKey,
        0, // 0 decimals for NFT
        new PublicKey(publicKey.toString()),
        new PublicKey(publicKey.toString())
      );
      
      // 3. Create associated token account for owner
      const ownerNftAccount = await getAssociatedTokenAddress(
        propertyNftMint.publicKey,
        new PublicKey(publicKey.toString())
      );
      
      const createATAIx = createAssociatedTokenAccountInstruction(
        new PublicKey(publicKey.toString()),
        ownerNftAccount,
        new PublicKey(publicKey.toString()),
        propertyNftMint.publicKey
      );
      
      // 4. Mint one token to the owner
      const mintToIx = createMintToInstruction(
        propertyNftMint.publicKey,
        ownerNftAccount,
        new PublicKey(publicKey.toString()),
        1, // Mint exactly 1 token for NFT
        []
      );
      
      // Convert price to lamports (as BN) - ensure it's a valid number first
      const priceInSol = parseFloat(formData.price);
      if (isNaN(priceInSol)) {
        throw new Error("Invalid price value");
      }
      // Multiply by LAMPORTS_PER_SOL and use Math.floor to ensure we have a whole number of lamports
      const priceInLamports = Math.floor(priceInSol * LAMPORTS_PER_SOL);
      const price = new BN(priceInLamports);
      console.log(`Converting price from ${priceInSol} SOL to ${priceInLamports} lamports`);
      
      // Convert square feet to BN - ensure it's a valid number first
      const sqFeet = Number(formData.square_feet);
      if (isNaN(sqFeet)) {
        throw new Error("Invalid square feet value");
      }
      const squareFeetBN = new BN(sqFeet);
      
      // 5. Create listing instruction
      console.log("Building list_property instruction");
      const listPropertyIx = buildInstruction(
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
          property_nft_mint: propertyNftMint.publicKey,
          owner_nft_account: ownerNftAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        }
      );
      
      console.log("All instructions created successfully");
      
      // Get fresh blockhash right before creating the transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      console.log("Got fresh blockhash:", blockhash);
      
      // Create a single transaction with all instructions
      const tx = new Transaction();
      tx.add(createMintAccountIx);
      tx.add(initMintIx);
      tx.add(createATAIx);
      // tx.add(mintToIx);
      tx.add(listPropertyIx);
      
      // Set recent blockhash and fee payer
      tx.recentBlockhash = blockhash;
      tx.feePayer = new PublicKey(publicKey.toString());
      
      // NFT mint keypair needs to sign
      tx.partialSign(propertyNftMint);
      
      console.log("Transaction created and signed by NFT mint");
      console.log("Transaction details:", debugTransaction(tx));
      
      // Sign with wallet
      console.log("Signing transaction with wallet");
      const signedTx = await anchorWallet.signTransaction(tx);
      
      console.log("Transaction fully signed");
      
      // Send and confirm transaction
      console.log("Sending transaction to Solana network");
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });
      
      console.log("Transaction sent, signature:", signature);
      
      // Wait for confirmation with enough retry attempts
      console.log("Waiting for transaction confirmation");
      
      try {
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight
        }, 'confirmed');
        
        if (confirmation.value.err) {
          console.error("Transaction confirmed but has errors:", confirmation.value.err);
          throw new Error(`Transaction confirmed but has errors: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        console.log("Transaction confirmed successfully:", confirmation);
        
        // Now that transaction is confirmed, add property to backend
        console.log("Transaction confirmed, notifying backend");
        
        try {
          // The backend expects a ListPropertyRequest in the metadata field
          const propertyMetadataJson = JSON.stringify({
            property_id: formData.property_id,
            price: Number(formData.price) * LAMPORTS_PER_SOL,
            metadata_uri: formData.metadata_uri,
            location: formData.location,
            square_feet: Number(formData.square_feet),
            bedrooms: Number(formData.bedrooms),
            bathrooms: Number(formData.bathrooms),
            nft_mint_address: propertyNftMint.publicKey.toString(),
            nft_token_account: ownerNftAccount.toString()
          });
          
          // Send to backend - use the correct API endpoint with the expected field names
          const response = await axios.post(
            `${API_URL}/api/transactions/submit`,
            {
              // Backend expects serialized_transaction, not signature
              serialized_transaction: signedTx.serialize().toString('base64'),
              metadata: propertyMetadataJson
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
              }
            }
          );
          
          console.log("Backend notified successfully:", response.data);
        } catch (backendErr) {
          // Even if backend notification fails, continue with local state update
          console.warn("Backend notification failed, but transaction was successful:", backendErr);
          // Don't rethrow the error since the transaction succeeded
        }
        
        // Create a plain serializable property object
        const newProperty = {
          location: formData.location,
          price: priceInLamports, // Store the lamport value in the database
          square_feet: Number(formData.square_feet),
          bedrooms: Number(formData.bedrooms),
          bathrooms: Number(formData.bathrooms),
          metadata_uri: formData.metadata_uri,
          owner: publicKey.toString(),
          property_id: formData.property_id,
          nft_mint_address: propertyNftMint.publicKey.toString(),
          nft_token_account: ownerNftAccount.toString()
        };
        
        // Add property to local state
        addProperty(newProperty);
        
        // No need to refresh properties immediately - avoid rate limits
        // The useEffect in PropertyGrid will handle refresh on next render
        
        toast({
          title: "Property Listed!",
          description: `Your property has been successfully listed. Transaction: ${signature}`,
        });
        
        onClose();
      } catch (confirmErr) {
        console.error("Error confirming transaction:", confirmErr);
        
        // Check if transaction was still successful despite confirmation error
        try {
          const status = await connection.getSignatureStatus(signature);
          console.log("Manual signature status check:", status);
          
          if (status.value && !status.value.err) {
            console.log("Transaction appears successful despite confirmation error");
            
            // Still add the property and notify backend
            // Create a plain serializable property object
            const newProperty = {
              location: formData.location,
              price: priceInLamports, // Store the lamport value in the database
              square_feet: Number(formData.square_feet),
              bedrooms: Number(formData.bedrooms),
              bathrooms: Number(formData.bathrooms),
              metadata_uri: formData.metadata_uri,
              owner: publicKey.toString(),
              property_id: formData.property_id,
              nft_mint_address: propertyNftMint.publicKey.toString(),
              nft_token_account: ownerNftAccount.toString()
            };
            
            // Add property to local state
            addProperty(newProperty);
            
            // No need to refresh properties immediately - avoid rate limits
            // The useEffect in PropertyGrid will handle refresh on next render
            
            toast({
              title: "Property Listed!",
              description: `Your property has been successfully listed. Transaction: ${signature}`,
            });
            
            onClose();
            return;
          }
        } catch (statusErr) {
          console.error("Error checking transaction status:", statusErr);
        }
        
        throw confirmErr;
      }
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
      
      // Check if error is related to rate limiting
      if (err.message && err.message.includes("429") || 
          (err.response && err.response.status === 429)) {
        setErrors({ 
          general: "Rate limit exceeded. The Solana RPC is busy, please wait a moment and try again." 
        });
        
        toast({
          variant: "destructive",
          title: "Rate Limit Exceeded",
          description: "Too many requests to the Solana network. Please wait a moment and try again.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Transaction Failed",
          description: `Could not list property: ${errorMessage}`,
        });
      }
    } finally {
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
            min="0.000000001"
            step="0.000000001"
          />
          {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price}</p>}
          <p className="text-xs text-gray-500 mt-1">Enter price in SOL. Will be converted to lamports (1 SOL = 10^9 lamports).</p>
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