async function signWithPhantom(message) {
    console.log('Starting signWithPhantom...');
    if (!window.solana || !window.solana.isPhantom) {
        throw new Error('Phantom wallet not found. Please install Phantom.');
    }
    console.log('Phantom wallet detected');
    try {
        if (!window.solana.isConnected) {
            console.log("Connecting wallet...");
            await window.solana.connect();
        } else {
            console.log("Wallet already connected");
        }
        console.log('Successfully connected to Phantom wallet');
    } catch (error) {
        console.error('Failed to connect to Phantom wallet:', error);
        throw error;
    }

    const publicKey = window.solana.publicKey.toBase58();
    console.log('Phantom Public Key:', publicKey);

    console.log('Signing message:', message);
    try {
        const messageBytes = new TextEncoder().encode(message);
        const signedMessage = await window.solana.signMessage(messageBytes, 'utf8');
        console.log('Message signed successfully');
        const bs58 = await import('https://cdn.jsdelivr.net/npm/bs58@4.0.1/+esm');
        const signatureBase58 = bs58.default.encode(signedMessage.signature);
        console.log('Signature (Base58):', signatureBase58);
        return { publicKey, signature: signatureBase58 };
    } catch (error) {
        console.error('Error signing message with Phantom:', error);
        throw error;
    }
}

async function authenticateWithPhantom() {
    console.log('Starting authenticateWithPhantom...');
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `Timestamp: ${timestamp}`;
    console.log('Timestamp:', timestamp);
    console.log('Message to sign:', message);

    const { publicKey, signature } = await signWithPhantom(message);
    console.log('Received publicKey and signature from signWithPhantom');

    const authRequest = {
        public_key: publicKey,
        signature: signature,
        timestamp: timestamp
    };
    console.log('Authentication Request:', authRequest);

    console.log('Sending request to backend...');
    try {
        const response = await fetch('http://127.0.0.1:8080/api/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(authRequest)
        });

        console.log('Response status:', response.status);
        const result = await response.json();
        console.log('Authentication Response:', result);
        return result.token;
    } catch (error) {
        console.error('Error sending request to backend:', error);
        throw error;
    }
}

console.log('Starting authentication process...');
authenticateWithPhantom().then(token => {
    console.log('JWT Token:', token);
}).catch(error => {
    console.error('Authentication failed:', error);
});