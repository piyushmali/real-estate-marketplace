const { Keypair, Connection, Transaction, SystemProgram, PublicKey, SYSVAR_RENT_PUBKEY } = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');
const axios = require('axios');
const BN = require('bn.js');
const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');

// Hardcoded values for testing - NEVER USE IN PRODUCTION
const SECRET_KEY = "3j75B8Wfn6aWWtygGadn4pJbhcgsFxGSDrm2FcktzXe3H2Gc55TUZhGmc9kQ3oNmqHFb7ZEgsvLzdnubnwPsBjXc";
const JWT_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJIdEdYY3VuYlBVVTU0d01hOVppWGRNWHZ2MWI1cHBUN0RlRkxKV2R0SDdMciIsImV4cCI6MTc0Mzc4ODYzM30._Qk_9RLt32HPXj4puDFEQ1PV1zAEQQLgVStMQ0WGD0w";

// Backend API URL
const API_URL = "http://127.0.0.1:8080";

// Program ID - this should be your actual program ID from the blockchain
const PROGRAM_ID = new PublicKey("BdSKkquiFKRqxbXYC3Jufz9K59xisZ33VNbyaigkStW6");

// Marketplace authority wallet (this should be the wallet that initialized the marketplace)
const MARKETPLACE_AUTHORITY = "13EySfdhQL6b7dxzJnw73C33cRUnX1NjPBWEP1gkU43C";

// Property metadata
const propertyMetadata = {
  property_id: "PropertyTest789",
  price: 1500000,
  metadata_uri: "https://example.com/metadata/property789.json",
  location: "789 Test St",
  square_feet: 3000,
  bedrooms: 4,
  bathrooms: 3
};

// Function to serialize data for list_property instruction based on tests/real-estate-marketplace.ts
function serializeListPropertyData(property_id, price, metadata_uri, location, square_feet, bedrooms, bathrooms) {
  // Create an Anchor-style instruction data buffer
  
  // First 8 bytes are the instruction discriminator (sha256("global:list_property")[:8])
  // This is a simplified version - in real Anchor this would be a proper hash
  const discriminator = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);  // Placeholder
  discriminator.writeUInt8(1, 0); // Use 1 for listProperty instruction
  
  // Property ID (string)
  const property_id_buffer = Buffer.from(property_id);
  const property_id_len = Buffer.alloc(4);
  property_id_len.writeUInt32LE(property_id_buffer.length, 0);
  
  // Price (u64/BN)
  const price_buffer = Buffer.alloc(8);
  const priceBN = new BN(price);
  priceBN.toArrayLike(Buffer, 'le', 8).copy(price_buffer);
  
  // Metadata URI (string)
  const metadata_uri_buffer = Buffer.from(metadata_uri);
  const metadata_uri_len = Buffer.alloc(4);
  metadata_uri_len.writeUInt32LE(metadata_uri_buffer.length, 0);
  
  // Location (string)
  const location_buffer = Buffer.from(location);
  const location_len = Buffer.alloc(4);
  location_len.writeUInt32LE(location_buffer.length, 0);
  
  // Square feet (u64/BN)
  const square_feet_buffer = Buffer.alloc(8);
  const square_feetBN = new BN(square_feet);
  square_feetBN.toArrayLike(Buffer, 'le', 8).copy(square_feet_buffer);
  
  // Bedrooms (u8)
  const bedrooms_buffer = Buffer.alloc(1);
  bedrooms_buffer.writeUInt8(bedrooms, 0);
  
  // Bathrooms (u8)
  const bathrooms_buffer = Buffer.alloc(1);
  bathrooms_buffer.writeUInt8(bathrooms, 0);
  
  // Combine all buffers in the correct order
  return Buffer.concat([
    discriminator,
    property_id_len,
    property_id_buffer,
    price_buffer,
    metadata_uri_len, 
    metadata_uri_buffer,
    location_len,
    location_buffer,
    square_feet_buffer,
    bedrooms_buffer,
    bathrooms_buffer
  ]);
}

async function generateListPropertyTransaction() {
  try {
    // Create Solana connection
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Load wallet
    console.log('Loading wallet...');
    const secretKey = bs58.decode(SECRET_KEY);
    const signer = Keypair.fromSecretKey(secretKey);
    console.log(`Wallet address: ${signer.publicKey.toString()}`);
    
    // Check balance
    const balance = await connection.getBalance(signer.publicKey);
    console.log(`Balance: ${balance / 1_000_000_000} SOL`);
    
    // Get blockhash from backend
    console.log('Getting fresh blockhash from backend...');
    const blockhashResponse = await axios({
      method: 'get',
      url: `${API_URL}/api/blockhash`,
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`
      }
    });
    const blockhash = blockhashResponse.data.blockhash;
    console.log(`Blockhash from backend: ${blockhash}`);
    
    // Create a new transaction
    console.log('Creating list_property transaction...');
    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = signer.publicKey;
    
    // Create NFT mint keypair (required by the program)
    console.log('Creating NFT mint keypair...');
    const nftMint = Keypair.generate();
    console.log(`NFT Mint address: ${nftMint.publicKey.toString()}`);
    
    // Derive the marketplace state account address (PDA) correctly
    // Using the authority that initialized the marketplace
    const marketplaceAuthority = new PublicKey(MARKETPLACE_AUTHORITY);
    const [marketplacePDA] = await PublicKey.findProgramAddress(
      [Buffer.from("marketplace"), marketplaceAuthority.toBuffer()],
      PROGRAM_ID
    );
    console.log(`Marketplace PDA: ${marketplacePDA.toString()} (using authority: ${MARKETPLACE_AUTHORITY})`);
    
    // Derive a PDA for this property correctly
    // Based on tests/real-estate-marketplace.ts
    const [propertyPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyMetadata.property_id)],
      PROGRAM_ID
    );
    console.log(`Property PDA: ${propertyPDA.toString()}`);
    
    // Get owner NFT account (a PDA for associated token account)
    const [ownerNFTAccount] = await PublicKey.findProgramAddress(
      [
        signer.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        nftMint.publicKey.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    console.log(`Owner NFT Account: ${ownerNFTAccount.toString()}`);
    
    // Serialize the instruction data with all metadata fields
    const instructionData = serializeListPropertyData(
      propertyMetadata.property_id,
      propertyMetadata.price,
      propertyMetadata.metadata_uri,
      propertyMetadata.location,
      propertyMetadata.square_feet,
      propertyMetadata.bedrooms,
      propertyMetadata.bathrooms
    );
    
    // Create the instruction with the CORRECT account structure
    // Based on tests/real-estate-marketplace.ts
    const listPropertyInstruction = {
      programId: PROGRAM_ID,
      keys: [
        { pubkey: marketplacePDA, isSigner: false, isWritable: true },
        { pubkey: propertyPDA, isSigner: false, isWritable: true },
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: nftMint.publicKey, isSigner: true, isWritable: true },
        { pubkey: ownerNFTAccount, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: instructionData
    };
    
    // Add the instruction to the transaction
    transaction.add(listPropertyInstruction);
    
    // Sign the transaction with both signer and nftMint
    console.log('Signing transaction...');
    transaction.sign(signer, nftMint);
    
    // Serialize the transaction
    const serializedTransaction = transaction.serialize().toString('base64');
    
    // Create request payload
    const requestPayload = {
      serialized_transaction: serializedTransaction,
      metadata: JSON.stringify(propertyMetadata)
    };
    
    // Save payload to file
    fs.writeFileSync('list_property_payload.json', JSON.stringify(requestPayload, null, 2));
    console.log('Request payload saved to list_property_payload.json');
    
    // Submit transaction
    console.log('Submitting transaction to backend...');
    
    const submitResponse = await axios({
      method: 'post',
      url: `${API_URL}/api/transactions/submit`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      data: requestPayload,
      timeout: 30000 // 30-second timeout
    });
    
    console.log('Transaction submitted successfully!');
    console.log('Response:', submitResponse.data);
    console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${submitResponse.data.signature}?cluster=devnet`);
  } catch (error) {
    console.error('Error:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else {
      console.error(error.message);
    }
    
    console.log('\nYou can submit manually with curl:');
    console.log(`curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer ${JWT_TOKEN}" \\
  -d @list_property_payload.json \\
  ${API_URL}/api/transactions/submit`);
  }
}

// Run the script
generateListPropertyTransaction(); 