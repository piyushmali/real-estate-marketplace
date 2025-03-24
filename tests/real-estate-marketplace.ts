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
  let propertyPDA: PublicKey;
  let propertyNFTMint: PublicKey;
  let ownerNFTAccount: PublicKey;

  async function createNFTMintAndAccount(owner: PublicKey) {
    const mint = anchor.web3.Keypair.generate();
    
    const balance = await provider.connection.getBalance(provider.wallet.publicKey);
    if (balance < LAMPORTS_PER_SOL) {
      await provider.connection.requestAirdrop(provider.wallet.publicKey, 2 * LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await token.createMint(
      provider.connection,
      authority.payer,
      owner,
      null,
      0,
      mint
    );

    const tokenAccount = await token.createAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      mint.publicKey,
      owner
    );

    return { mint: mint.publicKey, tokenAccount };
  }

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
        systemProgram: SystemProgram.programId,
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
    const metadataUri = "https://example.com/meta/p123.json";
    const location = "123 Blockchain St";
    const squareFeet = new anchor.BN(2500);
    const bedrooms = 3;
    const bathrooms = 2;

    [propertyPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyId)],
      program.programId
    );

    const nftAccounts = await createNFTMintAndAccount(authority.publicKey);
    propertyNFTMint = nftAccounts.mint;
    ownerNFTAccount = nftAccounts.tokenAccount;

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 1000000
    });

    const tx = await program.methods
      .listProperty(propertyId, price, metadataUri, location, squareFeet, bedrooms, bathrooms)
      .accounts({
        marketplace: marketplacePDA,
        property: propertyPDA,
        owner: authority.publicKey,
        propertyNftMint: propertyNFTMint,
        ownerNftAccount: ownerNFTAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .preInstructions([computeBudgetIx])
      .rpc({
        skipPreflight: true,
        commitment: "confirmed",
      });

    console.log("Transaction signature:", tx);

    const propertyAccount = await program.account.property.fetch(propertyPDA);
    expect(propertyAccount.owner.toString()).to.equal(authority.publicKey.toString());
    expect(propertyAccount.propertyId).to.equal(propertyId);
    expect(propertyAccount.price.toNumber()).to.equal(price.toNumber());
    expect(propertyAccount.isActive).to.be.true;
    console.log("✅ Property listed successfully");
  });

  it("Update property price", async () => {
    const newPrice = new anchor.BN(1500000);

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400000
    });

    const tx = await program.methods
      .updateProperty(newPrice, null, null)
      .accounts({
        property: propertyPDA,
        owner: authority.publicKey,
        ownerNftAccount: ownerNFTAccount,
        propertyNftMint: propertyNFTMint,
      })
      .preInstructions([computeBudgetIx])
      .rpc({
        commitment: "confirmed",
      });

    console.log("Update price transaction signature:", tx);
    const propertyAfter = await program.account.property.fetch(propertyPDA);
    expect(propertyAfter.price.toString()).to.equal(newPrice.toString());
    console.log("✅ Property price updated successfully");
  });

  it("Make offer on property", async () => {
    const offerAmount = new anchor.BN(900000);
    const buyer = anchor.web3.Keypair.generate();
    
    const signature = await provider.connection.requestAirdrop(buyer.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(signature);

    const [offerPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("offer"), propertyPDA.toBuffer(), buyer.publicKey.toBuffer()],
      program.programId
    );

    const expirationTime = new anchor.BN(Math.floor(Date.now() / 1000) + 86400);

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400000
    });

    const tx = await program.methods
      .makeOffer(offerAmount, expirationTime)
      .accounts({
        property: propertyPDA,
        offer: offerPDA,
        buyer: buyer.publicKey,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .preInstructions([computeBudgetIx])
      .signers([buyer])
      .rpc({
        commitment: "confirmed",
      });

    console.log("Make offer transaction signature:", tx);
    const offerAccount = await program.account.offer.fetch(offerPDA);
    expect(offerAccount.buyer.toString()).to.equal(buyer.publicKey.toString());
    expect(offerAccount.status).to.deep.equal({ pending: {} });
    console.log("✅ Offer made successfully");
  });

  it("Execute sale with accepted offer", async () => {
    const buyer = anchor.web3.Keypair.generate();
    
    // Fund buyer with enough SOL
    const buyerSignature = await provider.connection.requestAirdrop(buyer.publicKey, 5 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(buyerSignature);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for airdrop confirmation

    const [offerPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("offer"), propertyPDA.toBuffer(), buyer.publicKey.toBuffer()],
      program.programId
    );

    const [transactionHistoryPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("transaction"), propertyPDA.toBuffer(), new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0])],
      program.programId
    );

    // Create payment token mint
    const paymentMint = await token.createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );

    // Create token accounts with proper ownership
    const buyerTokenAccount = await token.getOrCreateAssociatedTokenAccount(
      provider.connection,
      buyer,
      paymentMint,
      buyer.publicKey
    );

    const sellerTokenAccount = await token.getOrCreateAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      paymentMint,
      authority.publicKey
    );

    const marketplaceFeeAccount = await token.getOrCreateAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      paymentMint,
      authority.publicKey
    );

    const buyerNFTAccount = await token.getOrCreateAssociatedTokenAccount(
      provider.connection,
      buyer,
      propertyNFTMint,
      buyer.publicKey
    );

    const offerAmount = new anchor.BN(1500000);
    // Mint tokens to buyer
    await token.mintTo(
      provider.connection,
      authority.payer,
      paymentMint,
      buyerTokenAccount.address,
      authority.payer,
      offerAmount.toNumber()
    );

    const expirationTime = new anchor.BN(Math.floor(Date.now() / 1000) + 86400);

    // Make offer
    await program.methods
      .makeOffer(offerAmount, expirationTime)
      .accounts({
        property: propertyPDA,
        offer: offerPDA,
        buyer: buyer.publicKey,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([buyer])
      .rpc();

    // Accept offer
    await program.methods
      .respondToOffer(true)
      .accounts({
        property: propertyPDA,
        offer: offerPDA,
        owner: authority.publicKey,
      })
      .rpc();

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 1000000
    });

    try {
      const tx = await program.methods
        .executeSale()
        .accounts({
          marketplace: marketplacePDA,
          property: propertyPDA,
          offer: offerPDA,
          transactionHistory: transactionHistoryPDA,
          buyer: buyer.publicKey,
          seller: authority.publicKey,
          buyerTokenAccount: buyerTokenAccount.address,
          sellerTokenAccount: sellerTokenAccount.address,
          marketplaceFeeAccount: marketplaceFeeAccount.address,
          sellerNftAccount: ownerNFTAccount,
          buyerNftAccount: buyerNFTAccount.address,
          propertyNftMint: propertyNFTMint,
          tokenProgram: token.TOKEN_PROGRAM_ID,
          associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .preInstructions([computeBudgetIx])
        .signers([buyer])
        .rpc({
          skipPreflight: true,
          commitment: "confirmed",
        });

      console.log("Execute sale transaction signature:", tx);

      const propertyAfter = await program.account.property.fetch(propertyPDA);
      expect(propertyAfter.owner.toString()).to.equal(buyer.publicKey.toString());
      expect(propertyAfter.isActive).to.be.false;
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
});