const { Connection, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');

// Program ID - your actual program ID from the blockchain
const PROGRAM_ID = new PublicKey("BdSKkquiFKRqxbXYC3Jufz9K59xisZ33VNbyaigkStW6");

async function checkAllMarketplaces() {
  try {
    // Create Solana connection
    const connection = new Connection('https://api.devnet.solana.com');
    
    // Try different seed derivations
    console.log('=== Checking possible marketplace PDA derivations ===');
    
    // Option 1: Just "marketplace" seed (simplest)
    const [marketplacePDA1] = await PublicKey.findProgramAddress(
      [Buffer.from("marketplace")],
      PROGRAM_ID
    );
    console.log(`\nOption 1 - [marketplace]: ${marketplacePDA1.toString()}`);
    const accountInfo1 = await connection.getAccountInfo(marketplacePDA1);
    console.log(`Exists: ${accountInfo1 !== null}`);
    if (accountInfo1 !== null) {
      console.log(`Size: ${accountInfo1.data.length} bytes`);
      console.log(`Owner: ${accountInfo1.owner.toString()}`);
    }
    
    // List of wallets to try
    const wallets = [
      'HtGXcunbPUU54wMa9ZiXdMXvv1b5ppT7DeFLJWdtH7Lr',
      '13EySfdhQL6b7dxzJnw73C33cRUnX1NjPBWEP1gkU43C'
    ];
    
    // Option 2: "marketplace" + wallet pubkey (most common)
    for (const wallet of wallets) {
      const walletPubkey = new PublicKey(wallet);
      const [marketplacePDA2] = await PublicKey.findProgramAddress(
        [Buffer.from("marketplace"), walletPubkey.toBuffer()],
        PROGRAM_ID
      );
      console.log(`\nOption 2 - [marketplace, ${wallet}]: ${marketplacePDA2.toString()}`);
      const accountInfo2 = await connection.getAccountInfo(marketplacePDA2);
      console.log(`Exists: ${accountInfo2 !== null}`);
      if (accountInfo2 !== null) {
        console.log(`Size: ${accountInfo2.data.length} bytes`);
        console.log(`Owner: ${accountInfo2.owner.toString()}`);
        console.log(`Raw data: ${bs58.encode(accountInfo2.data).substring(0, 40)}...`);
      }
    }
    
    // Option 3: Just "marketplace" + a fixed string
    const [marketplacePDA3] = await PublicKey.findProgramAddress(
      [Buffer.from("marketplace"), Buffer.from("v1")],
      PROGRAM_ID
    );
    console.log(`\nOption 3 - [marketplace, "v1"]: ${marketplacePDA3.toString()}`);
    const accountInfo3 = await connection.getAccountInfo(marketplacePDA3);
    console.log(`Exists: ${accountInfo3 !== null}`);
    if (accountInfo3 !== null) {
      console.log(`Size: ${accountInfo3.data.length} bytes`);
      console.log(`Owner: ${accountInfo3.owner.toString()}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the script
checkAllMarketplaces(); 