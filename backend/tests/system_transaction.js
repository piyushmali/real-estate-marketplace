const { Keypair, Connection, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');
const axios = require('axios');

// Hardcoded values for testing - NEVER USE IN PRODUCTION
const SECRET_KEY = "3j75B8Wfn6aWWtygGadn4pJbhcgsFxGSDrm2FcktzXe3H2Gc55TUZhGmc9kQ3oNmqHFb7ZEgsvLzdnubnwPsBjXc";
const JWT_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJIdEdYY3VuYlBVVTU0d01hOVppWGRNWHZ2MWI1cHBUN0RlRkxKV2R0SDdMciIsImV4cCI6MTc0Mzc4ODYzM30._Qk_9RLt32HPXj4puDFEQ1PV1zAEQQLgVStMQ0WGD0w";

// Backend API URL
const API_URL = "http://127.0.0.1:8080";

// Property metadata (just for database storage testing)
const propertyMetadata = {
  property_id: "SystemTest123",
  price: 1000000,
  metadata_uri: "https://example.com/metadata/system123.json",
  location: "123 Test St",
  square_feet: 2000,
  bedrooms: 3,
  bathrooms: 2
};

async function generateSystemTransaction() {
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
    
    // Get the most recent blockhash directly from Solana
    console.log('Getting fresh blockhash directly from Solana...');
    const { blockhash } = await connection.getLatestBlockhash();
    console.log(`Blockhash: ${blockhash}`);
    
    // Create a simple transaction
    console.log('Creating simple SystemProgram transfer transaction...');
    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = signer.publicKey;
    
    // Simple transfer instruction (sending a minimal amount to the same address)
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: signer.publicKey, // Self-transfer
      lamports: 100, // 0.0000001 SOL
    });
    
    // Add the transfer instruction to the transaction
    transaction.add(transferInstruction);
    
    // Sign the transaction
    console.log('Signing transaction...');
    transaction.sign(signer);
    
    // Try to submit the transaction directly to Solana first to verify it's valid
    console.log('Verifying transaction directly with Solana RPC...');
    try {
      const signature = await connection.sendRawTransaction(transaction.serialize());
      console.log(`Direct Solana submission successful: ${signature}`);
      console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    } catch (error) {
      console.error('Direct Solana submission failed:', error.message);
    }
    
    // Serialize the transaction for the backend
    const serializedTransaction = transaction.serialize().toString('base64');
    
    // Create request payload
    const requestPayload = {
      serialized_transaction: serializedTransaction,
      metadata: JSON.stringify(propertyMetadata)
    };
    
    // Save payload to file
    fs.writeFileSync('system_payload.json', JSON.stringify(requestPayload, null, 2));
    console.log('Request payload saved to system_payload.json');
    
    // Submit transaction
    console.log('Submitting transaction to backend...');
    
    try {
      const submitResponse = await axios({
        method: 'post',
        url: `${API_URL}/api/transactions/submit`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${JWT_TOKEN}`
        },
        data: requestPayload,
        timeout: 10000 // 10-second timeout
      });
      
      console.log('Transaction submitted successfully!');
      console.log('Response:', submitResponse.data);
      console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${submitResponse.data.signature}?cluster=devnet`);
    } catch (error) {
      console.error('Backend submission error:');
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        console.error('Response:', error.response.data);
      } else if (error.request) {
        console.error('No response received from backend');
      } else {
        console.error('Error setting up request:', error.message);
      }
      
      console.log('\nYou can submit manually with curl:');
      console.log(`curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer ${JWT_TOKEN}" \\
    -d @system_payload.json \\
    ${API_URL}/api/transactions/submit`);
    }
  } catch (error) {
    console.error('Script error:', error);
  }
}

// Run the script
generateSystemTransaction(); 