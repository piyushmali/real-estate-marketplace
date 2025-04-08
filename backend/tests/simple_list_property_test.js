const { Keypair, Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { BN } = require('@coral-xyz/anchor');
const bs58 = require('bs58');
const fs = require('fs');
const axios = require('axios');

// Hardcoded values for testing - NEVER USE IN PRODUCTION
const SECRET_KEY = "3j75B8Wfn6aWWtygGadn4pJbhcgsFxGSDrm2FcktzXe3H2Gc55TUZhGmc9kQ3oNmqHFb7ZEgsvLzdnubnwPsBjXc";
const JWT_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJIdEdYY3VuYlBVVTU0d01hOVppWGRNWHZ2MWI1cHBUN0RlRkxKV2R0SDdMciIsImV4cCI6MTc0Mzc4ODYzM30._Qk_9RLt32HPXj4puDFEQ1PV1zAEQQLgVStMQ0WGD0w";

// Backend API URL
const API_URL = "http://127.0.0.1:8080";

// Program ID
const PROGRAM_ID = new PublicKey("E7v7RResymJU5XvvPA9uwxGSEEsdSE6XvaP7BTV2GGoQ");

// Marketplace authority
const MARKETPLACE_AUTHORITY = new PublicKey("A9xYe8XDnCRyPdy7B75B5PT7JP9ktLtxi6xMBVa7C4Xd");

// Property metadata for testing
const propertyMetadata = {
  property_id: `TestProperty${Math.floor(Math.random() * 10000)}`,
  price: 1500000,
  metadata_uri: "https://example.com/metadata/test.json",
  location: "123 Test St",
  square_feet: 3000,
  bedrooms: 4,
  bathrooms: 3
};

// Create instruction data for list_property
function createListPropertyInstructionData(propertyId, price, metadataUri, location, squareFeet, bedrooms, bathrooms) {
  // Instruction discriminator for list_property from the IDL: [254, 101, 42, 174, 220, 160, 42, 82]
  const discriminator = Buffer.from([254, 101, 42, 174, 220, 160, 42, 82]);
  
  // Prepare property ID
  const propertyIdBuffer = Buffer.from(propertyId);
  const propertyIdLenBuffer = Buffer.alloc(4);
  propertyIdLenBuffer.writeUInt32LE(propertyIdBuffer.length);
  
  // Prepare price
  const priceBuffer = Buffer.alloc(8);
  new BN(price).toArray('le', 8).forEach((byte, i) => priceBuffer[i] = byte);
  
  // Prepare metadata URI
  const metadataUriBuffer = Buffer.from(metadataUri);
  const metadataUriLenBuffer = Buffer.alloc(4);
  metadataUriLenBuffer.writeUInt32LE(metadataUriBuffer.length);
  
  // Prepare location
  const locationBuffer = Buffer.from(location);
  const locationLenBuffer = Buffer.alloc(4);
  locationLenBuffer.writeUInt32LE(locationBuffer.length);
  
  // Prepare square feet
  const squareFeetBuffer = Buffer.alloc(8);
  new BN(squareFeet).toArray('le', 8).forEach((byte, i) => squareFeetBuffer[i] = byte);
  
  // Prepare bedrooms & bathrooms
  const bedroomsBuffer = Buffer.alloc(1);
  bedroomsBuffer.writeUInt8(bedrooms);
  
  const bathroomsBuffer = Buffer.alloc(1);
  bathroomsBuffer.writeUInt8(bathrooms);
  
  // Concatenate all buffers
  return Buffer.concat([
    discriminator,
    propertyIdLenBuffer,
    propertyIdBuffer,
    priceBuffer,
    metadataUriLenBuffer,
    metadataUriBuffer,
    locationLenBuffer,
    locationBuffer,
    squareFeetBuffer,
    bedroomsBuffer,
    bathroomsBuffer
  ]);
}

async function testListProperty() {
  try {
    console.log('=== TESTING LIST_PROPERTY TRANSACTION ===');
    console.log('Property ID:', propertyMetadata.property_id);
    
    // 1. Setup connection
    console.log('\n1. Setting up connection...');
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // 2. Load wallet
    console.log('\n2. Loading wallet...');
    const secretKey = bs58.decode(SECRET_KEY);
    const signer = Keypair.fromSecretKey(secretKey);
    console.log(`Wallet address: ${signer.publicKey.toString()}`);
    
    // 3. Check wallet balance
    const balance = await connection.getBalance(signer.publicKey);
    console.log(`Wallet balance: ${balance / 1_000_000_000} SOL`);
    
    // 4. Check backend health
    console.log('\n4. Checking backend API health...');
    try {
      const healthResponse = await axios.get(`${API_URL}/health`);
      console.log('Backend health status:', healthResponse.status);
    } catch (error) {
      console.error('Backend health check failed:', error.message);
      console.error('Make sure your backend server is running!');
      return;
    }
    
    // 5. Get fresh blockhash from backend
    console.log('\n5. Getting fresh blockhash from backend...');
    let blockhash;
    try {
      const blockhashResponse = await axios({
        method: 'get',
        url: `${API_URL}/api/blockhash`,
        headers: {
          'Authorization': `Bearer ${JWT_TOKEN}`
        }
      });
      blockhash = blockhashResponse.data.blockhash;
      console.log(`Blockhash from backend: ${blockhash}`);
    } catch (error) {
      console.error('Failed to get blockhash from backend:', error.message);
      return;
    }
    
    // 6. Create NFT mint keypair
    console.log('\n6. Creating NFT mint keypair...');
    const nftMint = Keypair.generate();
    console.log(`NFT mint address: ${nftMint.publicKey.toString()}`);
    
    // 7. Derive all necessary PDAs
    console.log('\n7. Deriving necessary PDAs...');
    
    // Marketplace PDA
    const [marketplacePDA] = await PublicKey.findProgramAddress(
      [Buffer.from("marketplace"), MARKETPLACE_AUTHORITY.toBuffer()],
      PROGRAM_ID
    );
    console.log(`Marketplace PDA: ${marketplacePDA.toString()}`);
    
    // Property PDA
    const [propertyPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyMetadata.property_id)],
      PROGRAM_ID
    );
    console.log(`Property PDA: ${propertyPDA.toString()}`);
    
    // Owner NFT account
    const [ownerNFTAccount] = await PublicKey.findProgramAddress(
      [
        signer.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        nftMint.publicKey.toBuffer()
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    console.log(`Owner NFT account: ${ownerNFTAccount.toString()}`);
    
    // 8. Create instruction data
    console.log('\n8. Creating instruction data...');
    const instructionData = createListPropertyInstructionData(
      propertyMetadata.property_id,
      propertyMetadata.price,
      propertyMetadata.metadata_uri,
      propertyMetadata.location,
      propertyMetadata.square_feet,
      propertyMetadata.bedrooms,
      propertyMetadata.bathrooms
    );
    
    // 9. Create list_property instruction
    console.log('\n9. Creating list_property instruction...');
    const listPropertyInstruction = new TransactionInstruction({
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
    });
    
    // 10. Create transaction
    console.log('\n10. Creating transaction...');
    const transaction = new Transaction();
    transaction.add(listPropertyInstruction);
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = signer.publicKey;
    
    // 11. Sign the transaction
    console.log('\n11. Signing transaction...');
    transaction.sign(signer, nftMint);
    
    // 12. Serialize the transaction
    console.log('\n12. Serializing transaction...');
    const serializedTransaction = transaction.serialize().toString('base64');
    
    // 13. Create request payload
    console.log('\n13. Creating request payload...');
    const requestPayload = {
      serialized_transaction: serializedTransaction,
      metadata: JSON.stringify(propertyMetadata)
    };
    
    // Save payload to file for reference
    fs.writeFileSync('list_property_payload.json', JSON.stringify(requestPayload, null, 2));
    console.log('Request payload saved to list_property_payload.json');
    
    // 14. Submit transaction to backend
    console.log('\n14. Submitting transaction to backend...');
    try {
      const submitResponse = await axios({
        method: 'post',
        url: `${API_URL}/api/transactions/submit`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${JWT_TOKEN}`
        },
        data: requestPayload,
        timeout: 30000
      });
      
      console.log('\n✅ SUCCESS! Transaction submitted successfully!');
      console.log('Backend response:', submitResponse.data);
      console.log(`\nView on Solana Explorer: https://explorer.solana.com/tx/${submitResponse.data.signature}?cluster=devnet`);
      
      console.log('\n=== TEST COMPLETE ===');
    } catch (error) {
      console.error('\n❌ ERROR: Transaction submission failed!');
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        console.error('Response:', error.response.data);
        
        if (error.response.data.includes("custom program error: 0x65")) {
          console.log('\nThe error 0x65 (101) likely means:');
          console.log('1. PropertyIdTooLong - The ID exceeds the maximum length');
          console.log('See the IDL for the full list of error codes');
        }
      } else {
        console.error('Error:', error.message);
      }
      
      console.log('\nYou can submit manually with curl:');
      console.log(`curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer ${JWT_TOKEN}" \\
  -d @list_property_payload.json \\
  ${API_URL}/api/transactions/submit`);
    }
  } catch (error) {
    console.error('Unexpected error during testing:', error);
  }
}

// Run the test
testListProperty(); 