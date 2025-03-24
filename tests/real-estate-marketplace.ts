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
});