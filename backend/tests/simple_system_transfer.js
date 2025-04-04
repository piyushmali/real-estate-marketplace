const { Keypair, Connection, PublicKey, SystemProgram, Transaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');
const axios = require('axios');

// Hardcoded values for testing - NEVER USE IN PRODUCTION
const SECRET_KEY = "3j75B8Wfn6aWWtygGadn4pJbhcgsFxGSDrm2FcktzXe3H2Gc55TUZhGmc9kQ3oNmqHFb7ZEgsvLzdnubnwPsBjXc";
const JWT_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJIdEdYY3VuYlBVVTU0d01hOVppWGRNWHZ2MWI1cHBUN0RlRkxKV2R0SDdMciIsImV4cCI6MTc0Mzc4ODYzM30._Qk_9RLt32HPXj4puDFEQ1PV1zAEQQLgVStMQ0WGD0w";

// Backend API URL
const API_URL = "http://127.0.0.1:8080";

// Property metadata for testing
const propertyMetadata = {
  property_id: `TestProperty${Math.floor(Math.random() * 10000)}`,
  price: 1000000,
  metadata_uri: "https://example.com/metadata/test.json",
  location: "123 Test St",
  square_feet: 2500,
  bedrooms: 3,
  bathrooms: 2
};

async function testSystemTransfer() {
  try {
    console.log('=== TESTING SIMPLE SYSTEM TRANSFER ===');
    
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
    
    // 6. Create destination wallet
    console.log('\n6. Creating destination wallet...');
    const destinationWallet = Keypair.generate();
    console.log(`Destination address: ${destinationWallet.publicKey.toString()}`);
    
    // 7. Create SystemProgram transfer instruction
    console.log('\n7. Creating SystemProgram transfer instruction...');
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: destinationWallet.publicKey,
      lamports: 10000000 // 0.01 SOL
    });
    
    // 8. Create transaction
    console.log('\n8. Creating transaction...');
    const transaction = new Transaction();
    transaction.add(transferInstruction);
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = signer.publicKey;
    
    // 9. Sign the transaction
    console.log('\n9. Signing transaction...');
    transaction.sign(signer);
    
    // 10. Serialize the transaction
    console.log('\n10. Serializing transaction...');
    const serializedTransaction = transaction.serialize().toString('base64');
    
    // 11. Create request payload
    console.log('\n11. Creating request payload...');
    const requestPayload = {
      serialized_transaction: serializedTransaction,
      metadata: JSON.stringify(propertyMetadata)
    };
    
    // Save payload to file for reference
    fs.writeFileSync('system_transfer_payload.json', JSON.stringify(requestPayload, null, 2));
    console.log('Request payload saved to system_transfer_payload.json');
    
    // 12. Submit transaction to backend
    console.log('\n12. Submitting transaction to backend...');
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
      } else {
        console.error('Error:', error.message);
      }
      
      console.log('\nYou can submit manually with curl:');
      console.log(`curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer ${JWT_TOKEN}" \\
  -d @system_transfer_payload.json \\
  ${API_URL}/api/transactions/submit`);
    }
  } catch (error) {
    console.error('Unexpected error during testing:', error);
  }
}

// Run the test
testSystemTransfer(); 