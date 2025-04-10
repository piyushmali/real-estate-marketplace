const axios = require('axios');
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Check if transaction payload exists
if (!fs.existsSync('transaction_payload.json')) {
  console.error('Error: transaction_payload.json not found.');
  console.log('Please run the generate_transaction.js script first.');
  process.exit(1);
}

const requestPayload = JSON.parse(fs.readFileSync('transaction_payload.json', 'utf8'));

// Main function to test the API
async function testTransactionAPI() {
  try {
    // Prompt for JWT token
    const jwtToken = await new Promise(resolve => {
      rl.question('Enter your JWT token: ', token => {
        resolve(token);
      });
    });

    console.log('\nSending request to backend...');
    
    const response = await axios({
      method: 'post',
      url: 'http://localhost:8080/api/transactions/submit',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      data: requestPayload
    });

    console.log('\nAPI Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data && response.data.signature) {
      console.log(`\nTransaction submitted successfully!`);
      console.log(`Transaction Signature: ${response.data.signature}`);
      console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${response.data.signature}?cluster=devnet`);
    }
  } catch (error) {
    console.error('\nError testing API:');
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received from server');
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error:', error.message);
    }
  } finally {
    rl.close();
  }
}

testTransactionAPI(); 