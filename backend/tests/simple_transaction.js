const { Keypair, Connection, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');
const axios = require('axios');

// Hardcoded values for testing - NEVER USE IN PRODUCTION
const SECRET_KEY = "3j75B8Wfn6aWWtygGadn4pJbhcgsFxGSDrm2FcktzXe3H2Gc55TUZhGmc9kQ3oNmqHFb7ZEgsvLzdnubnwPsBjXc";
const JWT_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJIdEdYY3VuYlBVVTU0d01hOVppWGRNWHZ2MWI1cHBUN0RlRkxKV2R0SDdMciIsImV4cCI6MTc0Mzc4ODYzM30._Qk_9RLt32HPXj4puDFEQ1PV1zAEQQLgVStMQ0WGD0w";

// Backend API URL
const API_URL = "http://127.0.0.1:8080";

// Property metadata
const propertyMetadata = {
  property_id: "SimpleTest123",
  price: 1500000,
  metadata_uri: "https://example.com/metadata/simpletest123.json",
  location: "123 Test St",
  square_feet: 3000,
  bedrooms: 4,
  bathrooms: 3
};

async function generateSimpleTransaction() {
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
    
    // Get blockhash directly from Solana
    console.log('Getting fresh blockhash...');
    const { blockhash } = await connection.getLatestBlockhash();
    console.log(`Blockhash: ${blockhash}`);
    
    // Create a simple transaction
    console.log('Creating simple transaction...');
    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = signer.publicKey;
    
    // Add a simple transfer instruction (sending a tiny amount to self)
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: signer.publicKey,
      lamports: 100, // 0.0000001 SOL
    });
    
    transaction.add(transferInstruction);
    
    // Sign the transaction
    console.log('Signing transaction...');
    transaction.sign(signer);
    
    // Serialize the transaction
    const serializedTransaction = transaction.serialize().toString('base64');
    
    // Create request payload
    const requestPayload = {
      serialized_transaction: serializedTransaction,
      metadata: JSON.stringify(propertyMetadata)
    };
    
    // Save payload to file
    fs.writeFileSync('simple_payload.json', JSON.stringify(requestPayload, null, 2));
    console.log('Request payload saved to simple_payload.json');
    
    // Submit transaction
    console.log('Submitting transaction to backend...');
    
    const submitResponse = await axios({
      method: 'post',
      url: `${API_URL}/api/transactions/submit`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      data: requestPayload
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
  -d @simple_payload.json \\
  ${API_URL}/api/transactions/submit`);
  }
}

generateSimpleTransaction(); 