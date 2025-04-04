const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const { BN } = anchor;
const bs58 = require('bs58');
const fs = require('fs');
const axios = require('axios');

// Hardcoded values for testing - NEVER USE IN PRODUCTION
const SECRET_KEY = "3ZYfJwhSeJc53nynauea3xxAnB6vNAQNKAqBjYuvrjEMKMckSnBUtqMVDmxEsz8qXR3Jm8ZHg5YoRgxNWJZuVgs4";
const JWT_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJIdEdYY3VuYlBVVTU0d01hOVppWGRNWHZ2MWI1cHBUN0RlRkxKV2R0SDdMciIsImV4cCI6MTc0Mzc4ODYzM30._Qk_9RLt32HPXj4puDFEQ1PV1zAEQQLgVStMQ0WGD0w";

// Backend API URL
const API_URL = "http://127.0.0.1:8080";

// Program ID - your actual program ID
const PROGRAM_ID = new PublicKey("BdSKkquiFKRqxbXYC3Jufz9K59xisZ33VNbyaigkStW6");

// Marketplace authority wallet (the wallet that initialized the marketplace)
const MARKETPLACE_AUTHORITY = "13EySfdhQL6b7dxzJnw73C33cRUnX1NjPBWEP1gkU43C";

// Property metadata
const propertyMetadata = {
  property_id: "AnchorTest123",
  price: 1500000,
  metadata_uri: "https://example.com/metadata/anchor123.json",
  location: "123 Anchor St",
  square_feet: 3000,
  bedrooms: 4,
  bathrooms: 3
};

// This is your program's IDL - you should replace this with the actual IDL from your program
// You can get this by running `anchor build` and checking the target/idl directory
const IDL = {
  "version": "0.1.0",
  "name": "real_estate_marketplace",
  "instructions": [
    {
      "name": "initializeMarketplace",
      "accounts": [
        {
          "name": "marketplace",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "feePercentage",
          "type": "u16"
        }
      ]
    },
    {
      "name": "listProperty",
      "accounts": [
        {
          "name": "marketplace",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "property",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "owner",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "propertyNftMint",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "ownerNftAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "propertyId",
          "type": "string"
        },
        {
          "name": "price",
          "type": "u64"
        },
        {
          "name": "metadataUri",
          "type": "string"
        },
        {
          "name": "location",
          "type": "string"
        },
        {
          "name": "squareFeet",
          "type": "u64"
        },
        {
          "name": "bedrooms",
          "type": "u8"
        },
        {
          "name": "bathrooms",
          "type": "u8"
        }
      ]
    }
    // Other instructions omitted for brevity
  ],
  "accounts": [
    {
      "name": "Marketplace",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "publicKey"
          },
          {
            "name": "feePercentage",
            "type": "u16"
          },
          {
            "name": "propertiesCount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Property",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "string"
          },
          {
            "name": "owner",
            "type": "publicKey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "metadataUri",
            "type": "string"
          },
          {
            "name": "nftMint",
            "type": "publicKey"
          },
          {
            "name": "location",
            "type": "string"
          },
          {
            "name": "squareFeet",
            "type": "u64"
          },
          {
            "name": "bedrooms",
            "type": "u8"
          },
          {
            "name": "bathrooms",
            "type": "u8"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "updatedAt",
            "type": "i64"
          },
          {
            "name": "offersCount",
            "type": "u64"
          },
          {
            "name": "transactionCount",
            "type": "u64"
          }
        ]
      }
    }
    // Other account types omitted for brevity
  ]
};

async function anchorListProperty() {
  try {
    // Setup connection
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Load wallet
    console.log('Loading wallet...');
    const secretKey = bs58.decode(SECRET_KEY);
    const signer = Keypair.fromSecretKey(secretKey);
    console.log(`Wallet address: ${signer.publicKey.toString()}`);
    
    // Check balance
    const balance = await connection.getBalance(signer.publicKey);
    console.log(`Balance: ${balance / 1_000_000_000} SOL`);
    
    // Get blockhash from backend
    console.log('Getting fresh blockhash from backend...');
    const blockhashResponse = await axios({
      method: 'get',
      url: `${API_URL}/api/blockhash`,
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`
      }
    });
    const blockhash = blockhashResponse.data.blockhash;
    console.log(`Blockhash from backend: ${blockhash}`);
    
    // Setup wallet and provider for Anchor
    const wallet = new anchor.Wallet(signer);
    const provider = new anchor.AnchorProvider(
      connection, 
      wallet, 
      { commitment: 'confirmed', preflightCommitment: 'confirmed' }
    );
    
    // Create program interface
    const program = new anchor.Program(IDL, PROGRAM_ID, provider);
    
    // Create NFT mint keypair
    console.log('Creating NFT mint keypair...');
    const nftMint = Keypair.generate();
    console.log(`NFT Mint address: ${nftMint.publicKey.toString()}`);
    
    // Derive the marketplace PDA
    console.log('Deriving marketplace PDA...');
    const marketplaceAuthority = new PublicKey(MARKETPLACE_AUTHORITY);
    const [marketplacePDA] = await PublicKey.findProgramAddress(
      [Buffer.from("marketplace"), marketplaceAuthority.toBuffer()],
      PROGRAM_ID
    );
    console.log(`Marketplace PDA: ${marketplacePDA.toString()}`);
    
    // Derive property PDA
    console.log('Deriving property PDA...');
    const [propertyPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyMetadata.property_id)],
      PROGRAM_ID
    );
    console.log(`Property PDA: ${propertyPDA.toString()}`);
    
    // Derive owner NFT account
    console.log('Deriving owner NFT account...');
    const [ownerNFTAccount] = await PublicKey.findProgramAddress(
      [
        signer.publicKey.toBuffer(),
        anchor.utils.token.TOKEN_PROGRAM_ID.toBuffer(),
        nftMint.publicKey.toBuffer(),
      ],
      anchor.utils.token.ASSOCIATED_TOKEN_PROGRAM_ID
    );
    console.log(`Owner NFT Account: ${ownerNFTAccount.toString()}`);
    
    // Build the transaction
    console.log('Building transaction...');
    const tx = await program.methods
      .listProperty(
        propertyMetadata.property_id,
        new BN(propertyMetadata.price),
        propertyMetadata.metadata_uri,
        propertyMetadata.location,
        new BN(propertyMetadata.square_feet),
        propertyMetadata.bedrooms,
        propertyMetadata.bathrooms
      )
      .accounts({
        marketplace: marketplacePDA,
        property: propertyPDA,
        owner: signer.publicKey,
        propertyNftMint: nftMint.publicKey,
        ownerNftAccount: ownerNFTAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([nftMint]) // Add additional signers beyond the wallet
      .transaction();
    
    // Set recent blockhash and fee payer
    tx.recentBlockhash = blockhash;
    tx.feePayer = signer.publicKey;
    
    // Sign the transaction
    console.log('Signing transaction...');
    tx.partialSign(nftMint); // Sign with the NFT mint keypair
    tx.partialSign(signer);  // Sign with the wallet
    
    // Serialize the transaction
    const serializedTransaction = tx.serialize().toString('base64');
    
    // Create request payload
    const requestPayload = {
      serialized_transaction: serializedTransaction,
      metadata: JSON.stringify(propertyMetadata)
    };
    
    // Save payload to file
    fs.writeFileSync('anchor_payload.json', JSON.stringify(requestPayload, null, 2));
    console.log('Request payload saved to anchor_payload.json');
    
    // Submit transaction
    console.log('Submitting transaction to backend...');
    
    const submitResponse = await axios({
      method: 'post',
      url: `${API_URL}/api/transactions/submit`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      data: requestPayload,
      timeout: 30000 // 30-second timeout
    });
    
    console.log('Transaction submitted successfully!');
    console.log('Response:', submitResponse.data);
    console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${submitResponse.data.signature}?cluster=devnet`);
  } catch (error) {
    console.error('Error:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else if (error.idl) {
      console.error('Anchor IDL Error:', error.message);
    } else {
      console.error(error.message);
    }
    
    console.log('\nYou can submit manually with curl:');
    console.log(`curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer ${JWT_TOKEN}" \\
  -d @anchor_payload.json \\
  ${API_URL}/api/transactions/submit`);
  }
}

// Run the script
anchorListProperty(); 