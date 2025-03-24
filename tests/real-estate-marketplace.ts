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
});