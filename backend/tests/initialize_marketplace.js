const { Connection, Keypair, Transaction, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction } = require('@solana/web3.js');
const bs58 = require('bs58');
const BN = require('bn.js');

// Program ID - your actual program ID
const PROGRAM_ID = new PublicKey("BdSKkquiFKRqxbXYC3Jufz9K59xisZ33VNbyaigkStW6");

// Hardcoded values for testing - NEVER USE IN PRODUCTION
const SECRET_KEY = "3ZYfJwhSeJc53nynauea3xxAnB6vNAQNKAqBjYuvrjEMKMckSnBUtqMVDmxEsz8qXR3Jm8ZHg5YoRgxNWJZuVgs4";

// Function to create initialize marketplace instruction data (based on test file)
function createInitializeMarketplaceData(feePercentage) {
  // Create an Anchor-style instruction data buffer
  // First 8 bytes are the instruction discriminator
  const discriminator = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);
  discriminator.writeUInt8(0, 0); // 0 = initialize_marketplace instruction
  
  // Fee percentage (u16)
  const feeBuffer = Buffer.alloc(2);
  feeBuffer.writeUInt16LE(feePercentage, 0);
  
  // Combine all buffers in the correct order
  return Buffer.concat([discriminator, feeBuffer]);
}

async function initializeMarketplace() {
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
    
    // Derive the marketplace PDA
    console.log('Deriving marketplace PDA...');
    const [marketplacePDA] = await PublicKey.findProgramAddress(
      [Buffer.from("marketplace"), signer.publicKey.toBuffer()],
      PROGRAM_ID
    );
    console.log(`Marketplace PDA: ${marketplacePDA.toString()}`);
    
    // Check if marketplace already exists
    console.log('Checking if marketplace already exists...');
    const marketplaceAccount = await connection.getAccountInfo(marketplacePDA);
    if (marketplaceAccount !== null) {
      console.log('⚠️ Marketplace account already exists!');
      return;
    }
    
    // Get recent blockhash
    console.log('Getting recent blockhash...');
    const { blockhash } = await connection.getLatestBlockhash();
    console.log(`Blockhash: ${blockhash}`);
    
    // Create initialize marketplace instruction
    console.log('Creating initialize_marketplace instruction...');
    const feePercentage = 100; // 1% fee (100 = 1%)
    const instructionData = createInitializeMarketplaceData(feePercentage);
    
    const initMarketplaceIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: marketplacePDA, isSigner: false, isWritable: true },
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: instructionData,
    });
    
    // Create transaction
    const transaction = new Transaction();
    transaction.add(initMarketplaceIx);
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = signer.publicKey;
    
    // Sign and send transaction
    console.log('Signing and sending transaction...');
    transaction.sign(signer);
    
    const signature = await connection.sendRawTransaction(
      transaction.serialize()
    );
    
    console.log('Confirming transaction...');
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      console.log('❌ Transaction failed!');
      console.log('Error:', confirmation.value.err);
    } else {
      console.log('✅ Marketplace initialized successfully!');
      console.log(`Transaction signature: ${signature}`);
      console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    }
    
    // Verify account was created
    console.log('\nVerifying marketplace account...');
    const newMarketplaceAccount = await connection.getAccountInfo(marketplacePDA);
    
    if (newMarketplaceAccount === null) {
      console.log('❌ Marketplace account was not created!');
    } else {
      console.log('✅ Marketplace account exists!');
      console.log(`Account size: ${newMarketplaceAccount.data.length} bytes`);
      console.log(`Owner program: ${newMarketplaceAccount.owner.toString()}`);
      
      // Print account data
      console.log(`Account data (base58): ${bs58.encode(newMarketplaceAccount.data)}`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the script
initializeMarketplace(); 