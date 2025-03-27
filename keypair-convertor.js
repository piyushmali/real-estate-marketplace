const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');

// The key array you provided
const keyArray = ;

// Convert the array to a Uint8Array
const privateKeyBuffer = new Uint8Array(keyArray);

// Try to get the base58 encoding function in different ways
const encode = bs58.encode || (bs58.default && bs58.default.encode);

if (!encode) {
  console.error('Could not find bs58 encode function. bs58 structure:', Object.keys(bs58));
  process.exit(1);
}

try {
  // Create a Keypair from the private key
  const keypair = Keypair.fromSecretKey(privateKeyBuffer);

  // Get the public key
  const publicKey = keypair.publicKey;

  // Encode private key to base58
  const privateKeyBase58 = encode(privateKeyBuffer);

  console.log('Private Key (base58):', privateKeyBase58);
  console.log('Public Key (base58):', publicKey.toBase58());

  // Save to a JSON file
  fs.writeFileSync('keypair.json', JSON.stringify({
    privateKey: privateKeyBase58,
    publicKey: publicKey.toBase58()
  }, null, 2));
} catch (error) {
  console.error('Error processing keypair:', error);
}