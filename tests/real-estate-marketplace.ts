import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RealEstateMarketplace } from "../target/types/real_estate_marketplace";
import { expect } from "chai";
import { PublicKey, ComputeBudgetProgram, LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js";
import * as token from "@solana/spl-token";

describe("Real Estate Marketplace", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.RealEstateMarketplace as Program<RealEstateMarketplace>;
  const authority = provider.wallet;
  let marketplacePDA: PublicKey;
  let marketplaceBump: number;

  it("Initialize marketplace", async () => {
    const [marketplace, bump] = await PublicKey.findProgramAddress(
      [Buffer.from("marketplace"), authority.publicKey.toBuffer()],
      program.programId
    );
    marketplacePDA = marketplace;
    marketplaceBump = bump;

    const marketplaceFee = new anchor.BN(100);

    await program.methods
      .initializeMarketplace(marketplaceFee)
      .accounts({
        marketplace: marketplacePDA,
        authority: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const marketplaceAccount = await program.account.marketplace.fetch(marketplacePDA);
    expect(marketplaceAccount.authority.toString()).to.equal(authority.publicKey.toString());
    expect(marketplaceAccount.propertiesCount.toNumber()).to.equal(0);
    expect(marketplaceAccount.feePercentage.toNumber()).to.equal(marketplaceFee.toNumber());
    console.log("✅ Marketplace initialized successfully");
  });

  it("List property", async () => {
    const propertyId = "Property123";
    const price = new anchor.BN(1000000);
    const metadataUri = "https://example.com/meta/p123.json"; // Shortened URI
    const location = "123 Blockchain St, Crypto City";        // Shortened location
    const squareFeet = new anchor.BN(2500);
    const bedrooms = 3;
    const bathrooms = 2;
  
    const [propertyPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyId)],
      program.programId
    );
  
    try {
      // Increased compute budget
      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1000000 // Increased from 400000
      });
  
      const tx = await program.methods
        .listProperty(propertyId, price, metadataUri, location, squareFeet, bedrooms, bathrooms)
        .accounts({
          marketplace: marketplacePDA,
          property: propertyPDA,
          owner: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .preInstructions([computeBudgetIx])
        .rpc({
          skipPreflight: true, // Skip preflight to get more detailed error information
          commitment: "confirmed",
        });
  
      console.log("Transaction signature:", tx);
  
      const propertyAccount = await program.account.property.fetch(propertyPDA);
      expect(propertyAccount.owner.toString()).to.equal(authority.publicKey.toString());
      expect(propertyAccount.propertyId).to.equal(propertyId);
      expect(propertyAccount.price.toNumber()).to.equal(price.toNumber());
      expect(propertyAccount.metadataUri).to.equal(metadataUri);
      expect(propertyAccount.location).to.equal(location);
      expect(propertyAccount.squareFeet.toNumber()).to.equal(squareFeet.toNumber());
      expect(propertyAccount.bedrooms).to.equal(bedrooms);
      expect(propertyAccount.bathrooms).to.equal(bathrooms);
      expect(propertyAccount.isActive).to.be.true;
      expect(propertyAccount.transactionCount.toNumber()).to.equal(0);
      expect(propertyAccount.marketplace.toString()).to.equal(marketplacePDA.toString());
  
      const marketplaceAccount = await program.account.marketplace.fetch(marketplacePDA);
      expect(marketplaceAccount.propertiesCount.toNumber()).to.equal(1);
      console.log("✅ Property listed successfully");
    } catch (error) {
      console.error("Failed to list property:", error);
      // Log more verbose information to diagnose issues
      if (error.logs) {
        console.error("Program logs:", JSON.stringify(error.logs, null, 2));
      }
      throw error;
    }
  });

  // Add this new test case after the existing "List property" test
it("List multiple properties", async () => {
  const properties = [
    {
      propertyId: "Property200",
      price: new anchor.BN(2000000),
      metadataUri: "https://example.com/meta/p200.json",
      location: "200 Blockchain Ave",
      squareFeet: new anchor.BN(3000),
      bedrooms: 4,
      bathrooms: 3
    },
    {
      propertyId: "Property201",
      price: new anchor.BN(1500000),
      metadataUri: "https://example.com/meta/p201.json",
      location: "201 Crypto Lane",
      squareFeet: new anchor.BN(2000),
      bedrooms: 3,
      bathrooms: 2
    },
    {
      propertyId: "Property202",
      price: new anchor.BN(3000000),
      metadataUri: "https://example.com/meta/p202.json",
      location: "202 Token Road",
      squareFeet: new anchor.BN(4000),
      bedrooms: 5,
      bathrooms: 4
    }
  ];

  const propertyPDAs: PublicKey[] = [];

  try {
    // List all properties sequentially
    for (const prop of properties) {
      const [propertyPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(prop.propertyId)],
        program.programId
      );
      propertyPDAs.push(propertyPDA);

      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1000000
      });

      const tx = await program.methods
        .listProperty(
          prop.propertyId,
          prop.price,
          prop.metadataUri,
          prop.location,
          prop.squareFeet,
          prop.bedrooms,
          prop.bathrooms
        )
        .accounts({
          marketplace: marketplacePDA,
          property: propertyPDA,
          owner: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .preInstructions([computeBudgetIx])
        .rpc({
          skipPreflight: true,
          commitment: "confirmed",
        });

      console.log(`Transaction signature for ${prop.propertyId}:`, tx);
    }

    // Verify each property
    for (let i = 0; i < properties.length; i++) {
      const propertyAccount = await program.account.property.fetch(propertyPDAs[i]);
      
      expect(propertyAccount.owner.toString()).to.equal(authority.publicKey.toString());
      expect(propertyAccount.propertyId).to.equal(properties[i].propertyId);
      expect(propertyAccount.price.toNumber()).to.equal(properties[i].price.toNumber());
      expect(propertyAccount.metadataUri).to.equal(properties[i].metadataUri);
      expect(propertyAccount.location).to.equal(properties[i].location);
      expect(propertyAccount.squareFeet.toNumber()).to.equal(properties[i].squareFeet.toNumber());
      expect(propertyAccount.bedrooms).to.equal(properties[i].bedrooms);
      expect(propertyAccount.bathrooms).to.equal(properties[i].bathrooms);
      expect(propertyAccount.isActive).to.be.true;
      expect(propertyAccount.transactionCount.toNumber()).to.equal(0);
      expect(propertyAccount.marketplace.toString()).to.equal(marketplacePDA.toString());
    }

    // Verify marketplace properties count
    const marketplaceAccount = await program.account.marketplace.fetch(marketplacePDA);
    // Adding 1 to account for the property listed in the previous test
    expect(marketplaceAccount.propertiesCount.toNumber()).to.equal(properties.length + 1);

    console.log("✅ Multiple properties listed successfully");
  } catch (error) {
    console.error("Failed to list multiple properties:", error);
    if (error.logs) {
      console.error("Program logs:", JSON.stringify(error.logs, null, 2));
    }
    throw error;
  }
});


  it("Update property price", async () => {
    // First, ensure we have a property to update
    const propertyId = "Property123";
    const initialPrice = new anchor.BN(1000000);
    const newPrice = new anchor.BN(1500000); // 50% price increase
    
    const [propertyPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyId)],
      program.programId
    );
  
    try {
      // Fetch the current property state to confirm initial price
      const propertyBefore = await program.account.property.fetch(propertyPDA);
      expect(propertyBefore.price.toString()).to.equal(initialPrice.toString());
      
      // Add a delay to ensure clock advances
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update only the price
      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 400000
      });
  
      const tx = await program.methods
        .updateProperty(
          newPrice, // Update price
          null,     // Don't update metadata URI
          null      // Don't update active status
        )
        .accounts({
          property: propertyPDA,
          owner: authority.publicKey,
        })
        .preInstructions([computeBudgetIx])
        .rpc({
          commitment: "confirmed",
        });
  
      console.log("Update price transaction signature:", tx);
  
      // Fetch updated property data
      const propertyAfter = await program.account.property.fetch(propertyPDA);
      
      // Verify the update
      expect(propertyAfter.price.toString()).to.equal(newPrice.toString());
      expect(propertyAfter.metadataUri).to.equal(propertyBefore.metadataUri);
      expect(propertyAfter.isActive).to.equal(propertyBefore.isActive);
      
      // Verify timestamp updated
      expect(propertyAfter.updatedAt.toNumber()).to.be.greaterThan(propertyBefore.updatedAt.toNumber());
      
      console.log("✅ Property price updated successfully");
    } catch (error) {
      console.error("Failed to update property price:", error);
      if (error.logs) {
        console.error("Program logs:", JSON.stringify(error.logs, null, 2));
      }
      throw error;
    }
  });
  
  it("Update property metadata URI", async () => {
    const propertyId = "Property123";
    const newMetadataUri = "https://example.com/meta/updated_p123.json";
    
    const [propertyPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyId)],
      program.programId
    );
  
    try {
      // Fetch the current property state
      const propertyBefore = await program.account.property.fetch(propertyPDA);
      
      // Add a delay to ensure clock advances
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update only the metadata URI
      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 400000
      });
  
      const tx = await program.methods
        .updateProperty(
          null,           // Don't update price
          newMetadataUri, // Update metadata URI
          null            // Don't update active status
        )
        .accounts({
          property: propertyPDA,
          owner: authority.publicKey,
        })
        .preInstructions([computeBudgetIx])
        .rpc({
          commitment: "confirmed",
        });
  
      console.log("Update metadata URI transaction signature:", tx);
  
      // Fetch updated property data
      const propertyAfter = await program.account.property.fetch(propertyPDA);
      
      // Verify the update
      expect(propertyAfter.metadataUri).to.equal(newMetadataUri);
      expect(propertyAfter.price.toString()).to.equal(propertyBefore.price.toString());
      expect(propertyAfter.isActive).to.equal(propertyBefore.isActive);
      
      // Verify timestamp updated
      expect(propertyAfter.updatedAt.toNumber()).to.be.greaterThan(propertyBefore.updatedAt.toNumber());
      
      console.log("✅ Property metadata URI updated successfully");
    } catch (error) {
      console.error("Failed to update property metadata URI:", error);
      if (error.logs) {
        console.error("Program logs:", JSON.stringify(error.logs, null, 2));
      }
      throw error;
    }
  });
  it("Update property status", async () => {
    const propertyId = "Property123";
    const newActiveStatus = false; // Deactivate the property
    
    const [propertyPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyId)],
      program.programId
    );
  
    try {
      // Fetch the current property state
      const propertyBefore = await program.account.property.fetch(propertyPDA);
      
      // Add a delay to ensure clock advances
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update only the active status
      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 400000
      });
  
      const tx = await program.methods
        .updateProperty(
          null,             // Don't update price
          null,             // Don't update metadata URI
          newActiveStatus   // Update active status
        )
        .accounts({
          property: propertyPDA,
          owner: authority.publicKey,
        })
        .preInstructions([computeBudgetIx])
        .rpc({
          commitment: "confirmed",
        });
  
      console.log("Update property status transaction signature:", tx);
  
      // Fetch updated property data
      const propertyAfter = await program.account.property.fetch(propertyPDA);
      
      // Verify the update
      expect(propertyAfter.isActive).to.equal(newActiveStatus);
      expect(propertyAfter.price.toString()).to.equal(propertyBefore.price.toString());
      expect(propertyAfter.metadataUri).to.equal(propertyBefore.metadataUri);
      
      // Verify timestamp updated
      expect(propertyAfter.updatedAt.toNumber()).to.be.greaterThan(propertyBefore.updatedAt.toNumber());
      
      console.log("✅ Property status updated successfully");
      
      // Re-activate the property for subsequent tests
      await program.methods
        .updateProperty(
          null,
          null,
          true  // Set active back to true
        )
        .accounts({
          property: propertyPDA,
          owner: authority.publicKey,
        })
        .rpc({
          commitment: "confirmed",
        });
        
    } catch (error) {
      console.error("Failed to update property status:", error);
      if (error.logs) {
        console.error("Program logs:", JSON.stringify(error.logs, null, 2));
      }
      throw error;
    }
  });
  
  it("Make offer on property", async () => {
    const propertyId = "Property123";
    const offerAmount = new anchor.BN(900000); // 90% of listing price
    
    // Create a new keypair for the buyer
    const buyer = anchor.web3.Keypair.generate();
    
    // Airdrop some SOL to the buyer to pay for transaction fees
    const signature = await provider.connection.requestAirdrop(
      buyer.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);
    
    const [propertyPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyId)],
      program.programId
    );
    
    const [offerPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("offer"), propertyPDA.toBuffer(), buyer.publicKey.toBuffer()],
      program.programId
    );
    
    // Current time + 1 day for expiration (in seconds)
    const expirationTime = new anchor.BN(
      Math.floor(Date.now() / 1000) + 86400
    );
    
    try {
      // Make an offer as the buyer
      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 400000
      });
      
      const tx = await program.methods
        .makeOffer(
          offerAmount,
          expirationTime
        )
        .accounts({
          property: propertyPDA,
          offer: offerPDA,
          buyer: buyer.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .preInstructions([computeBudgetIx])
        .signers([buyer])
        .rpc({
          commitment: "confirmed",
        });
      
      console.log("Make offer transaction signature:", tx);
      
      // Fetch the offer data
      const offerAccount = await program.account.offer.fetch(offerPDA);
      
      // Verify the offer details
      expect(offerAccount.buyer.toString()).to.equal(buyer.publicKey.toString());
      expect(offerAccount.property.toString()).to.equal(propertyPDA.toString());
      expect(offerAccount.amount.toString()).to.equal(offerAmount.toString());
      expect(offerAccount.status.pending).to.exist;  // Check if status is Pending
      expect(offerAccount.expirationTime.toString()).to.equal(expirationTime.toString());
      
      console.log("✅ Offer made successfully");
      
    } catch (error) {
      console.error("Failed to make offer:", error);
      if (error.logs) {
        console.error("Program logs:", JSON.stringify(error.logs, null, 2));
      }
      throw error;
    }
  });
  it("Respond to offer - Accept", async () => {
    const propertyId = "Property123";
    
    // Create a new keypair for the buyer
    const buyer = anchor.web3.Keypair.generate();
    
    // Airdrop some SOL to the buyer
    const signature = await provider.connection.requestAirdrop(
      buyer.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);
    
    const [propertyPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyId)],
      program.programId
    );
    
    const [offerPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("offer"), propertyPDA.toBuffer(), buyer.publicKey.toBuffer()],
      program.programId
    );
    
    try {
      // 1. First, make an offer as the buyer
      const offerAmount = new anchor.BN(950000); // 95% of listing price
      const expirationTime = new anchor.BN(
        Math.floor(Date.now() / 1000) + 86400 // +1 day
      );
      
      await program.methods
        .makeOffer(
          offerAmount,
          expirationTime
        )
        .accounts({
          property: propertyPDA,
          offer: offerPDA,
          buyer: buyer.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([buyer])
        .rpc({
          commitment: "confirmed",
        });
      
      console.log("✅ Created offer for accept test");
      
      // 2. Now respond to the offer as the property owner (accept it)
      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 400000
      });
      
      const tx = await program.methods
        .respondToOffer(true) // true = accept
        .accounts({
          property: propertyPDA,
          offer: offerPDA,
          owner: authority.publicKey,
        })
        .preInstructions([computeBudgetIx])
        .rpc({
          commitment: "confirmed",
        });
      
      console.log("Accept offer transaction signature:", tx);
      
      // 3. Verify the offer status is updated to Accepted
      const offerAfter = await program.account.offer.fetch(offerPDA);
      expect(offerAfter.status.accepted).to.exist;
      
      console.log("✅ Offer accepted successfully");
      
    } catch (error) {
      console.error("Failed to accept offer:", error);
      if (error.logs) {
        console.error("Program logs:", JSON.stringify(error.logs, null, 2));
      }
      throw error;
    }
  });
  
  it("Respond to offer - Reject", async () => {
    const propertyId = "Property123";
    
    // Create a new keypair for the buyer
    const buyer = anchor.web3.Keypair.generate();
    
    // Airdrop some SOL to the buyer
    const signature = await provider.connection.requestAirdrop(
      buyer.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);
    
    const [propertyPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyId)],
      program.programId
    );
    
    const [offerPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("offer"), propertyPDA.toBuffer(), buyer.publicKey.toBuffer()],
      program.programId
    );
    
    try {
      // 1. First, make an offer as the buyer
      const offerAmount = new anchor.BN(800000); // 80% of listing price (too low)
      const expirationTime = new anchor.BN(
        Math.floor(Date.now() / 1000) + 86400 // +1 day
      );
      
      await program.methods
        .makeOffer(
          offerAmount,
          expirationTime
        )
        .accounts({
          property: propertyPDA,
          offer: offerPDA,
          buyer: buyer.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([buyer])
        .rpc({
          commitment: "confirmed",
        });
      
      console.log("✅ Created offer for reject test");
      
      // 2. Now respond to the offer as the property owner (reject it)
      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 400000
      });
      
      const tx = await program.methods
        .respondToOffer(false) // false = reject
        .accounts({
          property: propertyPDA,
          offer: offerPDA,
          owner: authority.publicKey,
        })
        .preInstructions([computeBudgetIx])
        .rpc({
          commitment: "confirmed",
        });
      
      console.log("Reject offer transaction signature:", tx);
      
      // 3. Verify the offer status is updated to Rejected
      const offerAfter = await program.account.offer.fetch(offerPDA);
      expect(offerAfter.status.rejected).to.exist;
      
      console.log("✅ Offer rejected successfully");
      
    } catch (error) {
      console.error("Failed to reject offer:", error);
      if (error.logs) {
        console.error("Program logs:", JSON.stringify(error.logs, null, 2));
      }
      throw error;
    }
  });
  it("Execute sale with accepted offer", async () => {
    const propertyId = "Property123";
    
    // Create a new keypair for the buyer
    const buyer = anchor.web3.Keypair.generate();
    
    // Airdrop some SOL to the buyer
    const signature = await provider.connection.requestAirdrop(
      buyer.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);
    
    const [propertyPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyId)],
      program.programId
    );
    
    const [offerPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("offer"), propertyPDA.toBuffer(), buyer.publicKey.toBuffer()],
      program.programId
    );
    
    const [transactionHistoryPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("transaction"), propertyPDA.toBuffer(), new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0])], // transaction_count + 1 = 1
      program.programId
    );
    
    // Create token mint
    const paymentMint = await createMint(provider);
    
    // Create token accounts for buyer, seller and marketplace fee recipient
    const buyerTokenAccount = await createTokenAccount(provider, paymentMint, buyer.publicKey);
    const sellerTokenAccount = await createTokenAccount(provider, paymentMint, authority.publicKey);
    const marketplaceFeeAccount = await createTokenAccount(provider, paymentMint, authority.publicKey);
    
    // Mint tokens to buyer for purchase
    const offerAmount = new anchor.BN(1500000); // 1.5 million
    await mintTo(provider, paymentMint, buyerTokenAccount, offerAmount.toNumber());
    
    try {
      // 1. First, make an offer as the buyer
      const expirationTime = new anchor.BN(
        Math.floor(Date.now() / 1000) + 86400 // +1 day
      );
      
      await program.methods
        .makeOffer(
          offerAmount,
          expirationTime
        )
        .accounts({
          property: propertyPDA,
          offer: offerPDA,
          buyer: buyer.publicKey,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([buyer])
        .rpc({
          commitment: "confirmed",
        });
      
      console.log("✅ Created offer for execute sale test");
      
      // 2. Accept the offer as the property owner
      await program.methods
        .respondToOffer(true) // true = accept
        .accounts({
          property: propertyPDA,
          offer: offerPDA,
          owner: authority.publicKey,
        })
        .rpc({
          commitment: "confirmed",
        });
      
      console.log("✅ Accepted offer for execute sale test");
      
      // 3. Execute the sale
      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1000000
      });
      
      const tx = await program.methods
        .executeSale()
        .accounts({
          marketplace: marketplacePDA,
          property: propertyPDA,
          offer: offerPDA,
          transactionHistory: transactionHistoryPDA,
          buyer: buyer.publicKey,
          seller: authority.publicKey,
          buyerTokenAccount: buyerTokenAccount,
          sellerTokenAccount: sellerTokenAccount,
          marketplaceFeeAccount: marketplaceFeeAccount,
          tokenProgram: token.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .preInstructions([computeBudgetIx])
        .signers([buyer])
        .rpc({
          commitment: "confirmed",
        });
      
      console.log("Execute sale transaction signature:", tx);
      
      // 4. Verify the sale and property transfer
      const propertyAfter = await program.account.property.fetch(propertyPDA);
      const offerAfter = await program.account.offer.fetch(offerPDA);
      const transactionHistory = await program.account.transactionHistory.fetch(transactionHistoryPDA);
      
      // Verify property ownership transferred
      expect(propertyAfter.owner.toString()).to.equal(buyer.publicKey.toString());
      
      // Verify property is no longer active
      expect(propertyAfter.isActive).to.be.false;
      
      // Verify offer status is Completed
      expect(offerAfter.status.completed).to.exist;
      
      // Verify transaction history
      expect(transactionHistory.property.toString()).to.equal(propertyPDA.toString());
      expect(transactionHistory.seller.toString()).to.equal(authority.publicKey.toString());
      expect(transactionHistory.buyer.toString()).to.equal(buyer.publicKey.toString());
      expect(transactionHistory.price.toString()).to.equal(offerAmount.toString());
      expect(transactionHistory.transactionIndex.toNumber()).to.equal(1);
      
      // Verify property transaction count increased
      expect(propertyAfter.transactionCount.toNumber()).to.equal(1);
      
      console.log("✅ Property sale executed successfully");
      
    } catch (error) {
      console.error("Failed to execute sale:", error);
      if (error.logs) {
        console.error("Program logs:", JSON.stringify(error.logs, null, 2));
      }
      throw error;
    }
  });
  
  it("Execute sale with offer not accepted (should fail)", async () => {
    const propertyId = "Property456"; // Different property ID to avoid conflicts
    
    // Create a new keypair for the buyer
    const buyer = anchor.web3.Keypair.generate();
    
    // Airdrop some SOL to the buyer
    const signature = await provider.connection.requestAirdrop(
      buyer.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);
    
    // First, initialize a new property for this test
    const [newMarketplacePDA] = await PublicKey.findProgramAddress(
      [Buffer.from("marketplace"), authority.publicKey.toBuffer()],
      program.programId
    );
    
    const [propertyPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("property"), newMarketplacePDA.toBuffer(), Buffer.from(propertyId)],
      program.programId
    );
    
    // List a new property
    const price = new anchor.BN(2000000);
    const metadataUri = "https://example.com/meta/p456.json";
    const location = "456 Test Street";
    const squareFeet = new anchor.BN(3000);
    const bedrooms = 4;
    const bathrooms = 3;
    
    await program.methods
      .listProperty(propertyId, price, metadataUri, location, squareFeet, bedrooms, bathrooms)
      .accounts({
        marketplace: marketplacePDA,
        property: propertyPDA,
        owner: authority.publicKey,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc({
        commitment: "confirmed",
      });
    
    console.log("✅ Property listed for error test");
    
    const [offerPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("offer"), propertyPDA.toBuffer(), buyer.publicKey.toBuffer()],
      program.programId
    );
    
    const [transactionHistoryPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("transaction"), propertyPDA.toBuffer(), new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0])],
      program.programId
    );
    
    // Create token mint
    const paymentMint = await createMint(provider);
    
    // Create token accounts
    const buyerTokenAccount = await createTokenAccount(provider, paymentMint, buyer.publicKey);
    const sellerTokenAccount = await createTokenAccount(provider, paymentMint, authority.publicKey);
    const marketplaceFeeAccount = await createTokenAccount(provider, paymentMint, authority.publicKey);
    
    // Mint tokens to buyer
    const offerAmount = new anchor.BN(1800000);
    await mintTo(provider, paymentMint, buyerTokenAccount, offerAmount.toNumber());
    
    try {
      // Make an offer as the buyer
      const expirationTime = new anchor.BN(
        Math.floor(Date.now() / 1000) + 86400
      );
      
      await program.methods
        .makeOffer(
          offerAmount,
          expirationTime
        )
        .accounts({
          property: propertyPDA,
          offer: offerPDA,
          buyer: buyer.publicKey,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([buyer])
        .rpc({
          commitment: "confirmed",
        });
      
      console.log("✅ Created offer without accepting it");
      
      // Try to execute sale without accepting the offer first (should fail)
      try {
        await program.methods
          .executeSale()
          .accounts({
            marketplace: marketplacePDA,
            property: propertyPDA,
            offer: offerPDA,
            transactionHistory: transactionHistoryPDA,
            buyer: buyer.publicKey,
            seller: authority.publicKey,
            buyerTokenAccount: buyerTokenAccount,
            sellerTokenAccount: sellerTokenAccount,
            marketplaceFeeAccount: marketplaceFeeAccount,
            tokenProgram: token.TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([buyer])
          .rpc({
            commitment: "confirmed",
          });
        
        // If we reach here, the test failed because the transaction should have been rejected
        assert.fail("Execute sale should have failed, but it succeeded");
      } catch (error) {
        // Expected error
        console.log("✅ Execute sale correctly failed with offer not accepted");
        
        // Verify the error is the one we expect
        expect(error.error.errorCode.code).to.equal("OfferNotAccepted");
      }
      
    } catch (error) {
      console.error("Test setup failed:", error);
      if (error.logs) {
        console.error("Program logs:", JSON.stringify(error.logs, null, 2));
      }
      throw error;
    }
  });
  
  // Helper functions for token operations
  async function createMint(provider) {
    const mint = anchor.web3.Keypair.generate();
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(
      82 // Minimum size for a mint account
    );
  
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: mint.publicKey,
        space: 82,
        lamports,
        programId: token.TOKEN_PROGRAM_ID,
      }),
      token.createInitializeMintInstruction(
        mint.publicKey,
        6, // Decimals
        provider.wallet.publicKey,
        null
      )
    );
  
    await provider.sendAndConfirm(tx, [mint]);
    return mint.publicKey;
  }
  
  async function createTokenAccount(provider, mint, owner) {
    const tokenAccount = anchor.web3.Keypair.generate();
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(
      165 // Minimum size for a token account
    );
  
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: tokenAccount.publicKey,
        space: 165,
        lamports,
        programId: token.TOKEN_PROGRAM_ID,
      }),
      token.createInitializeAccountInstruction(
        tokenAccount.publicKey,
        mint,
        owner
      )
    );
  
    await provider.sendAndConfirm(tx, [tokenAccount]);
    return tokenAccount.publicKey;
  }
  
  async function mintTo(provider, mint, destination, amount) {
    const tx = new Transaction().add(
      token.createMintToInstruction(
        mint,
        destination,
        provider.wallet.publicKey,
        amount,
        []
      )
    );
  
    await provider.sendAndConfirm(tx, []);
  }
});