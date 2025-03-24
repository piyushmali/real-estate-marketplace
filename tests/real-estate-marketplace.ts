import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RealEstateMarketplace } from "../target/types/real_estate_marketplace";
import { expect } from "chai";
import { PublicKey, ComputeBudgetProgram, LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js";

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
});