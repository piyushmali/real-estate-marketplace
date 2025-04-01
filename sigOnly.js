const { Connection, Keypair, Transaction, sendAndConfirmRawTransaction } = require('@solana/web3.js');

// The serialized transaction from the backend
const serializedTransaction = "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAUKAJL2CwW+hBeZymR0ej7wXZPAur8ILA9XXYJiWJ3wBTMarnBYZcj4fCQ8V9aMd1igq32mOFt9kHmEn9CKAnEb7WAVVJv6VLPabJSFbGj6Vxs54OWm+yU4moWxYN55ApOxbvKQzlP4g5OPJOhfMKtG9Kd6lvCOjPzA0l5d4AuO6H+bRFm2ECy3R/VAD3tNbS4aHRAHBvgRhzSJpBkyng8+kwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABqfVFxksXFEhjMlMPUrxf1ja7gibof1E49vZigAAAAAG3fbh12Whk9nL4UbO63msHLSF7V9bN5E6jPWFfv8AqYyXJY9OJInxuz0QKRSODYMLWhOZ2v8QhASOe9jb6fhZtZLwczGuP0ra2vWoPM8o//5xJQv5UySCjZMLl2v5m8v5LgH0KBXRvM6AE4GbN2wfq0cpeFuRkUx8/OmgGykQUgEJCQMCAAQBBQcIBln+ZSqu3KAqUnByb3BlcnR5XzAwMQBAQg8AAAAAAGh0dHBzOi8vZXhhbXBsZS5jb20vcHJvcGVydHlfMDAxLmpzb24AMTIzIE1haW4gU3QA0AcAAAAAAAADAg==";

// Your private key as a byte array (also the admin keypair)
const privateKeyBytes = Uint8Array.from([128,25,174,151,249,133,54,35,31,185,27,135,159,162,193,24,92,70,123,28,138,211,234,177,173,32,185,224,76,141,205,76,0,146,246,11,5,190,132,23,153,202,100,116,122,62,240,93,147,192,186,191,8,44,15,87,93,130,98,88,157,240,5,51]);

// Set up the connection to Solana Devnet
const connection = new Connection("https://api.devnet.solana.com", { commitment: "confirmed" });
console.log("Connected to Solana Devnet");

// Convert your private key to a Keypair
let keypair;
try {
    keypair = Keypair.fromSecretKey(privateKeyBytes);
    console.log('Your Public Key (User and Admin):', keypair.publicKey.toBase58());
} catch (error) {
    console.error('Error creating Keypair from private key:', error);
    process.exit(1);
}

// Check wallet balance
async function checkBalance() {
    const balance = await connection.getBalance(keypair.publicKey);
    console.log('Wallet Balance:', balance / 1_000_000_000, 'SOL');
    if (balance < 1_000_000_000) {
        console.error('Insufficient funds in wallet. Please fund the wallet with at least 1 SOL.');
        process.exit(1);
    }
}

// Deserialize the transaction
console.log('Deserializing transaction...');
let transaction;
try {
    const transactionBytes = Buffer.from(serializedTransaction, 'base64');
    transaction = Transaction.from(transactionBytes);
    console.log('Transaction deserialized successfully');
} catch (error) {
    console.error('Error deserializing transaction:', error);
    process.exit(1);
}

// Log transaction details before signing
console.log('Fee Payer:', transaction.feePayer.toBase58());
console.log('Required Signers (before signing):');
transaction.signatures.forEach((sig, i) => {
    const pubKey = sig.publicKey.toBase58();
    const isSigned = sig.signature !== null;
    console.log(`  ${i}: ${pubKey} - ${isSigned ? 'Signed' : 'Not Signed'}`);
});

// Fetch a fresh blockhash
async function updateBlockhash() {
    console.log('Fetching latest blockhash...');
    const { blockhash } = await connection.getLatestBlockhash({ commitment: 'confirmed' });
    transaction.recentBlockhash = blockhash;
    console.log('Updated Blockhash:', blockhash);
}

// Sign the transaction with the keypair (user and admin are the same)
async function signTransaction() {
    await updateBlockhash();

    console.log('Signing transaction...');
    try {
        // Clear existing signatures for the keypair
        transaction.signatures = transaction.signatures.map(sigPair => {
            if (sigPair.publicKey.equals(keypair.publicKey)) {
                return { publicKey: sigPair.publicKey, signature: null };
            }
            return sigPair;
        });

        // Sign with the keypair
        transaction.sign(keypair);
        console.log('Transaction signed successfully by user and admin');
    } catch (error) {
        console.error('Error signing transaction:', error);
        process.exit(1);
    }

    // Log transaction details after signing
    console.log('Required Signers (after signing):');
    transaction.signatures.forEach((sig, i) => {
        const pubKey = sig.publicKey.toBase58();
        const isSigned = sig.signature !== null;
        console.log(`  ${i}: ${pubKey} - ${isSigned ? 'Signed' : 'Not Signed'}`);
    });
}

// Serialize the signed transaction to base64
async function serializeTransaction() {
    let signedSerializedTransaction;
    try {
        signedSerializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
        console.log('Signed Serialized Transaction (Base64):', signedSerializedTransaction);
    } catch (error) {
        console.error('Error serializing signed transaction:', error);
        process.exit(1);
    }
    return signedSerializedTransaction;
}

// Submit the transaction to Devnet
async function submitTransaction() {
    console.log('Submitting transaction to Devnet...');
    try {
        const serializedTx = transaction.serialize();
        const signature = await sendAndConfirmRawTransaction(connection, serializedTx, {
            skipPreflight: false,
            commitment: 'confirmed',
            maxRetries: 5,
        });
        console.log('Transaction Signature:', signature);
        console.log('Transaction confirmed successfully');
        console.log('Verify the transaction on Solana Explorer:');
        console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
        return signature;
    } catch (error) {
        console.error('Error submitting transaction:', error);
        if (error.logs) {
            console.error('Transaction Logs:', error.logs);
        }
        throw error;
    }
}

// Main function to execute the steps
async function main() {
    await checkBalance();
    await signTransaction();
    const signedTx = await serializeTransaction();
    const signature = await submitTransaction();
    return { signedTx, signature };
}

// Run the script
main().then(result => {
    console.log('Signed transaction:', result.signedTx);
    console.log('Transaction signature:', result.signature);
}).catch(error => {
    console.error('Error in main execution:', error);
    process.exit(1);
});