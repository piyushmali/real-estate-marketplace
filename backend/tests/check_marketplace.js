const { Connection, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');

// Program ID - your actual program ID from the blockchain
const PROGRAM_ID = new PublicKey("BdSKkquiFKRqxbXYC3Jufz9K59xisZ33VNbyaigkStW6");
// Wallet address used to initialize the marketplace
const WALLET_ADDRESS = "HtGXcunbPUU54wMa9ZiXdMXvv1b5ppT7DeFLJWdtH7Lr";

async function checkMarketplace() {
  try {
    // Create Solana connection
    const connection = new Connection('https://api.devnet.solana.com');
    
    // Get wallet pubkey
    const walletPubkey = new PublicKey(WALLET_ADDRESS);
    
    // Derive the marketplace PDA
    console.log('Deriving marketplace PDA...');
    const [marketplacePDA] = await PublicKey.findProgramAddress(
      [Buffer.from("marketplace"), walletPubkey.toBuffer()],
      PROGRAM_ID
    );
    console.log(`Marketplace PDA: ${marketplacePDA.toString()}`);
    
    // Check if the account exists
    console.log('Checking if marketplace account exists...');
    const accountInfo = await connection.getAccountInfo(marketplacePDA);
    
    if (accountInfo === null) {
      console.log('❌ Marketplace account does NOT exist. You need to initialize it first.');
      return;
    }
    
    console.log('✅ Marketplace account exists!');
    console.log(`Account size: ${accountInfo.data.length} bytes`);
    console.log(`Owner program: ${accountInfo.owner.toString()}`);
    
    if (accountInfo.owner.toString() !== PROGRAM_ID.toString()) {
      console.log('❌ WARNING: Marketplace account is not owned by the expected program!');
    }
    
    // Try to decode basic data structure (this is just a guess based on typical Anchor account layout)
    console.log('\nAttempting to decode basic account data...');
    
    // Anchor accounts typically have 8-byte discriminator at the start
    const discriminator = accountInfo.data.slice(0, 8);
    console.log(`Account discriminator: ${bs58.encode(discriminator)}`);
    
    // Output the raw data as base58 for debugging
    console.log(`Full account data (base58): ${bs58.encode(accountInfo.data)}`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the script
checkMarketplace(); 