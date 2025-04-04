const { Keypair, Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const anchor = require('@coral-xyz/anchor');
const { BN } = anchor;
const bs58 = require('bs58');
const fs = require('fs');
const axios = require('axios');

// Hardcoded values for testing - NEVER USE IN PRODUCTION
const SECRET_KEY = "3ZYfJwhSeJc53nynauea3xxAnB6vNAQNKAqBjYuvrjEMKMckSnBUtqMVDmxEsz8qXR3Jm8ZHg5YoRgxNWJZuVgs4";
const JWT_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJIdEdYY3VuYlBVVTU0d01hOVppWGRNWHZ2MWI1cHBUN0RlRkxKV2R0SDdMciIsImV4cCI6MTc0Mzc4ODYzM30._Qk_9RLt32HPXj4puDFEQ1PV1zAEQQLgVStMQ0WGD0w";

// Backend API URL
const API_URL = "http://127.0.0.1:8080";

// Program ID
const PROGRAM_ID = new PublicKey("BdSKkquiFKRqxbXYC3Jufz9K59xisZ33VNbyaigkStW6");

// Marketplace authority
const MARKETPLACE_AUTHORITY = new PublicKey("13EySfdhQL6b7dxzJnw73C33cRUnX1NjPBWEP1gkU43C");

// Property metadata for testing
const propertyMetadata = {
  property_id: `TestProperty${Math.floor(Math.random() * 10000)}`, // Random ID to avoid conflicts
  price: 1500000,
  metadata_uri: "https://example.com/metadata/test.json",
  location: "123 Test St",
  square_feet: 3000,
  bedrooms: 4,
  bathrooms: 3
};

// Load the IDL (this would be imported in frontend)
const idlJson = fs.readFileSync('../../target/idl/real_estate_marketplace.json', 'utf8');
const idl = JSON.parse(idlJson);

async function testCompleteFlow() {
  try {
    console.log('=== TESTING COMPLETE FLOW ===');
    console.log('Property ID:', propertyMetadata.property_id);
    
    // 1. Setup connection
    console.log('\n1. Setting up connection...');
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // 2. Load wallet (this would be Phantom in frontend)
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
    
    // 6. Setup Anchor wallet and provider
    console.log('\n6. Setting up Anchor wallet and provider...');
    const wallet = new anchor.Wallet(signer);
    const provider = new anchor.AnchorProvider(
      connection, 
      wallet, 
      { commitment: 'confirmed' }
    );
    
    // 7. Create program interface with IDL
    console.log('\n7. Creating Anchor program interface...');
    const program = new anchor.Program(idl, PROGRAM_ID, provider);
    
    // 8. Create NFT mint keypair
    console.log('\n8. Creating NFT mint keypair...');
    const nftMint = Keypair.generate();
    console.log(`NFT mint address: ${nftMint.publicKey.toString()}`);
    
    // 9. Derive all necessary PDAs
    console.log('\n9. Deriving necessary PDAs...');
    
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
    
    // 10. Build transaction
    console.log('\n10. Building transaction...');
    const tx = await program.methods
      .listProperty(
        propertyMetadata.property_id,
        new BN(propertyMetadata.price),
        propertyMetadata.metadata_uri,
        propertyMetadata.location,
        new BN(propertyMetadata.square_feet),
        propertyMetadata.bedrooms,
        propertyMetadata.bathrooms
      )
      .accounts({
        marketplace: marketplacePDA,
        property: propertyPDA,
        owner: signer.publicKey,
        propertyNftMint: nftMint.publicKey,
        ownerNftAccount: ownerNFTAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY
      })
      .signers([nftMint])
      .transaction();
    
    // 11. Set recent blockhash and fee payer
    console.log('\n11. Setting blockhash and fee payer...');
    tx.recentBlockhash = blockhash;
    tx.feePayer = signer.publicKey;
    
    // 12. Sign transaction
    console.log('\n12. Signing transaction...');
    tx.partialSign(nftMint);
    tx.partialSign(signer);
    
    // 13. Serialize transaction
    console.log('\n13. Serializing transaction...');
    const serializedTransaction = tx.serialize().toString('base64');
    
    // 14. Create request payload
    console.log('\n14. Creating request payload...');
    const requestPayload = {
      serialized_transaction: serializedTransaction,
      metadata: JSON.stringify(propertyMetadata)
    };
    
    // Save payload to file for reference
    fs.writeFileSync('test_transaction_payload.json', JSON.stringify(requestPayload, null, 2));
    console.log('Request payload saved to test_transaction_payload.json');
    
    // 15. Submit transaction to backend
    console.log('\n15. Submitting transaction to backend...');
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
      
      console.log('\n=== FLOW TESTING COMPLETE ===');
      console.log('The transaction flow is working correctly!');
      console.log('You can now implement this in your frontend application.');
    } catch (error) {
      console.error('\n❌ ERROR: Transaction submission failed!');
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        console.error('Response:', error.response.data);
        
        if (error.response.data.includes("custom program error: 0x65")) {
          console.log('\nThe error 0x65 (101) might indicate one of these issues:');
          console.log('1. The marketplace is not initialized correctly');
          console.log('2. You might not have permission to use this marketplace');
          console.log('3. The property ID might already exist');
          console.log('4. There might be an issue with NFT creation');
        }
      } else {
        console.error('Error:', error.message);
      }
      
      console.log('\nYou can submit manually with curl:');
      console.log(`curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer ${JWT_TOKEN}" \\
  -d @test_transaction_payload.json \\
  ${API_URL}/api/transactions/submit`);
    }
  } catch (error) {
    console.error('Unexpected error during testing:', error);
  }
}

// Run the test
testCompleteFlow(); 