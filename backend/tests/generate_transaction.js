const { Keypair, Connection, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, PublicKey } = require('@solana/web3.js');
const { BN } = require('@coral-xyz/anchor');
const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const bs58 = require('bs58');
const { Buffer } = require('buffer');
const fs = require('fs');
const axios = require('axios');

// Hardcoded values for easier testing - NOT FOR PRODUCTION
const PROGRAM_ID = "E7v7RResymJU5XvvPA9uwxGSEEsdSE6XvaP7BTV2GGoQ";
const SECRET_KEY = "3j75B8Wfn6aWWtygGadn4pJbhcgsFxGSDrm2FcktzXe3H2Gc55TUZhGmc9kQ3oNmqHFb7ZEgsvLzdnubnwPsBjXc";
const JWT_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJIdEdYY3VuYlBVVTU0d01hOVppWGRNWHZ2MWI1cHBUN0RlRkxKV2R0SDdMciIsImV4cCI6MTc0Mzc4ODYzM30._Qk_9RLt32HPXj4puDFEQ1PV1zAEQQLgVStMQ0WGD0w";

// Backend API URL
const API_URL = "http://localhost:8080";

// Example metadata for a property listing
const propertyMetadata = {
  property_id: "Property456", // Changed to avoid duplicate properties
  price: 1000000,
  metadata_uri: "https://example.com/metadata/property456.json",
  location: "456 Blockchain St",
  square_feet: 2500,
  bedrooms: 3,
  bathrooms: 2
};

// Create a simple dummy instruction to mimic a list_property call
// For this test, we'll just use a simple SystemProgram transfer
// because it's more reliable than trying to serialize the actual Anchor instruction
async function generateTransaction() {
  try {
    // Create Solana connection to devnet
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Load the wallet from secret key
    console.log('Loading wallet from secret key...');
    let signer;
    try {
      const secretKey = bs58.decode(SECRET_KEY);
      signer = Keypair.fromSecretKey(secretKey);
      console.log('Wallet address:', signer.publicKey.toString());
    } catch (error) {
      console.error('Invalid secret key, generating new keypair instead:', error);
      signer = Keypair.generate();
      console.log('Generated wallet address:', signer.publicKey.toString());
    }
    
    // Check balance
    const balance = await connection.getBalance(signer.publicKey);
    console.log(`Balance: ${balance / 1_000_000_000} SOL`);
    
    if (balance < 10_000_000) {
      console.warn('Warning: Low balance, you may need to fund this account on devnet');
      console.log('Solana Devnet Faucet: https://solfaucet.com/');
    }
    
    // Get a fresh blockhash from our backend
    console.log('Fetching fresh blockhash from backend...');
    let blockhash;
    try {
      const response = await axios({
        method: 'get',
        url: `${API_URL}/api/blockhash`,
        headers: {
          'Authorization': `Bearer ${JWT_TOKEN}`
        }
      });
      blockhash = response.data.blockhash;
      console.log('Got blockhash:', blockhash);
    } catch (error) {
      console.error('Failed to get blockhash from backend, using direct Solana RPC instead:', error);
      const { blockhash: solanaBlockhash } = await connection.getLatestBlockhash();
      blockhash = solanaBlockhash;
    }
    
    // Create a transaction
    const transaction = new Transaction();
    
    // Set the fresh blockhash
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = signer.publicKey;

    // Create a simple SystemProgram transfer instruction
    // This is much more reliable than trying to construct the actual list_property instruction
    // and is sufficient to test the backend's ability to handle transaction submission
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: signer.publicKey, // Send to self
      lamports: 100, // Minimal amount
    });
    
    // Add the transfer instruction
    transaction.add(transferInstruction);
    
    // Sign the transaction
    transaction.sign(signer);
    
    // Serialize the transaction
    const serializedTransaction = transaction.serialize().toString('base64');
    console.log('Created transaction with fresh blockhash');
    
    // Create the request payload for the backend
    const requestPayload = {
      serialized_transaction: serializedTransaction,
      metadata: JSON.stringify(propertyMetadata)
    };
    
    // Save to a file for later use
    fs.writeFileSync('transaction_payload.json', JSON.stringify(requestPayload, null, 2));
    console.log('Request payload saved to transaction_payload.json');
    
    // Immediately submit the transaction to avoid blockhash expiration
    console.log('Submitting transaction to backend...');
    try {
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
      console.error('Error submitting transaction:');
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        console.error('Response:', error.response.data);
      } else {
        console.error('Error:', error.message);
      }
      
      console.log('\nTo try manually with curl:');
      console.log(`curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer ${JWT_TOKEN}" \\
    -d @transaction_payload.json \\
    ${API_URL}/api/transactions/submit`);
    }
  } catch (error) {
    console.error('Error generating transaction:', error);
  }
}

generateTransaction(); 