// FRONTEND EXAMPLE - FOR REFERENCE ONLY

// This is a simplified example of how you would use Anchor in a frontend environment
// with Phantom wallet integration. This code doesn't run as-is but serves as a template.

import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Program, BN, AnchorProvider, web3 } from '@coral-xyz/anchor';
import { useWallet } from '@solana/wallet-adapter-react';

// STEP 1: Import your IDL
// In a real frontend app, you would import the IDL like this:
// import idl from './idl/real_estate_marketplace.json';
// For this example, we'll just reference it

// YOUR ACTUAL PROGRAM ID
const PROGRAM_ID = new PublicKey("E7v7RResymJU5XvvPA9uwxGSEEsdSE6XvaP7BTV2GGoQ");

// MARKETPLACE AUTHORITY (whoever initialized the marketplace)
const MARKETPLACE_AUTHORITY = new PublicKey("A9xYe8XDnCRyPdy7B75B5PT7JP9ktLtxi6xMBVa7C4Xd");

// Example React component or function
async function listProperty() {
  // This would be from your React state or form inputs
  const propertyData = {
    property_id: "NewProperty123",
    price: 1500000,
    metadata_uri: "https://example.com/metadata/property123.json",
    location: "123 Main St",
    square_feet: 3000,
    bedrooms: 4,
    bathrooms: 3
  };
  
  // STEP 2: Setup Connection and Wallet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // In a React component, you would get this from the wallet adapter:
  // const { publicKey, signTransaction } = useWallet();
  // For this example, we'll simulate it
  const wallet = {
    publicKey: window.solana.publicKey,
    signTransaction: async (tx) => window.solana.signTransaction(tx)
  };
  
  try {
    // STEP 3: Get Fresh Blockhash from YOUR Backend
    const blockhashResponse = await fetch('http://127.0.0.1:8080/api/blockhash', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
      }
    });
    const { blockhash } = await blockhashResponse.json();
    
    // STEP 4: Create a Phantom-compatible wallet provider
    // This is simplified - in a real app you'd use a proper provider
    const provider = {
      connection,
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction,
      signAllTransactions: wallet.signAllTransactions
    };
    
    // STEP 5: Create NFT mint keypair
    const nftMint = web3.Keypair.generate();
    
    // STEP 6: Derive PDAs
    const [marketplacePDA] = await PublicKey.findProgramAddress(
      [Buffer.from("marketplace"), MARKETPLACE_AUTHORITY.toBuffer()],
      PROGRAM_ID
    );
    
    const [propertyPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyData.property_id)],
      PROGRAM_ID
    );
    
    const [ownerNFTAccount] = await PublicKey.findProgramAddress(
      [
        wallet.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        nftMint.publicKey.toBuffer()
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    // STEP 7: Create program interface
    // In a real app, you'd use the actual imported IDL
    const program = new Program(YOUR_ACTUAL_IDL, PROGRAM_ID, provider);
    
    // STEP 8: Build transaction with Anchor
    const tx = await program.methods
      .listProperty(
        propertyData.property_id,
        new BN(propertyData.price),
        propertyData.metadata_uri,
        propertyData.location,
        new BN(propertyData.square_feet),
        propertyData.bedrooms,
        propertyData.bathrooms
      )
      .accounts({
        marketplace: marketplacePDA,
        property: propertyPDA,
        owner: wallet.publicKey,
        propertyNftMint: nftMint.publicKey,
        ownerNftAccount: ownerNFTAccount,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY
      })
      .signers([nftMint]) // Additional signers beyond the wallet
      .transaction();
    
    // STEP 9: Set fresh blockhash and fee payer
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    
    // STEP 10: Partial sign with the NFT mint
    tx.partialSign(nftMint);
    
    // STEP 11: Sign with Phantom wallet
    const signedTx = await wallet.signTransaction(tx);
    
    // STEP 12: Serialize the transaction
    const serializedTransaction = signedTx.serialize().toString('base64');
    
    // STEP 13: Submit to YOUR backend
    const submitResponse = await fetch('http://127.0.0.1:8080/api/transactions/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
      },
      body: JSON.stringify({
        serialized_transaction: serializedTransaction,
        metadata: JSON.stringify(propertyData)
      })
    });
    
    const result = await submitResponse.json();
    console.log('Transaction submitted successfully!');
    console.log('Signature:', result.signature);
    
    // STEP 14: Show success message to user
    alert(`Property listed successfully! Transaction signature: ${result.signature}`);
    
  } catch (error) {
    console.error('Error listing property:', error);
    alert(`Error listing property: ${error.message}`);
  }
}

// In a real React app, you'd call this from a button click handler
// <button onClick={listProperty}>List Property</button> 