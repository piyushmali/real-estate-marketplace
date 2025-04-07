import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RealEstateMarketplace } from "../target/types/real_estate_marketplace";
import { expect } from "chai";
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
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
  let buyer: anchor.web3.Keypair;

  async function ensureMinimumBalance(pubkey: PublicKey, minBalance: number): Promise<void> {
    const balance = await provider.connection.getBalance(pubkey);
    if (balance < minBalance) {
      throw new Error(
        `Wallet ${pubkey.toBase58()} has insufficient funds: ${balance / LAMPORTS_PER_SOL} SOL. ` +
        `Required: ${minBalance / LAMPORTS_PER_SOL} SOL. Please fund it manually on devnet.`
      );
    }
    console.log(`Wallet ${pubkey.toBase58()} balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  }

  async function createNFTMintAndAccount(owner: PublicKey) {
    const mint = anchor.web3.Keypair.generate();
    await ensureMinimumBalance(provider.wallet.publicKey, LAMPORTS_PER_SOL);
    await token.createMint(provider.connection, authority.payer, owner, null, 0, mint);
    const tokenAccount = await token.createAssociatedTokenAccount(provider.connection, authority.payer, mint.publicKey, owner);
    return { mint: mint.publicKey, tokenAccount };
  }

  before(async () => {
    // Ensure authority has enough SOL for all tests
    await ensureMinimumBalance(authority.publicKey, 5 * LAMPORTS_PER_SOL); // 10 SOL for safety

    // Initialize marketplace PDA
    [marketplacePDA, marketplaceBump] = await PublicKey.findProgramAddress(
      [Buffer.from("marketplace"), authority.publicKey.toBuffer()],
      program.programId
    );

    // Fund buyer
    buyer = anchor.web3.Keypair.generate();
    console.log("Generated buyer public key:", buyer.publicKey.toBase58());
    const transferIx = SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: buyer.publicKey,
      lamports: 2 * LAMPORTS_PER_SOL, // 5 SOL for buyer
    });
    const tx = new anchor.web3.Transaction().add(transferIx);
    await provider.sendAndConfirm(tx, [authority.payer]);
    console.log(`Transferred 2 SOL to buyer: ${buyer.publicKey.toBase58()}`);
    await ensureMinimumBalance(buyer.publicKey, 2 * LAMPORTS_PER_SOL);

    // Initialize marketplace once
    try {
      await program.methods.initializeMarketplace(new anchor.BN(100))
        .accounts({
          marketplace: marketplacePDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      console.log("Marketplace initialized successfully");
    } catch (error) {
      console.log("Marketplace already initialized, proceeding with existing state");
    }
  });

  describe("Marketplace Initialization", () => {
    it("Verify marketplace authority and initial configuration", async () => {
      const marketplaceAccount = await program.account.marketplace.fetch(marketplacePDA);
      expect(marketplaceAccount.authority.toString()).to.equal(authority.publicKey.toString());
      expect(marketplaceAccount.propertiesCount.toNumber()).to.equal(0);
      expect(marketplaceAccount.feePercentage.toNumber()).to.equal(100);
    });
  });

  describe("Property Listing", () => {
    before(async () => {
      const nftAccounts = await createNFTMintAndAccount(authority.publicKey);
      propertyNFTMint = nftAccounts.mint;
      ownerNFTAccount = nftAccounts.tokenAccount;
      [propertyPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from("Property123")],
        program.programId
      );
    });

    it("Successfully list a property with complete details", async () => {
      await program.methods.listProperty(
        "Property123",
        new anchor.BN(1000000),
        "https://example.com/meta/p123.json",
        "123 Blockchain St",
        new anchor.BN(2500),
        3,
        2
      )
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
      .rpc();
    });

    it("Verify NFT and metadata creation during listing", async () => {
      const propertyAccount = await program.account.property.fetch(propertyPDA);
      expect(propertyAccount.nftMint.toString()).to.equal(propertyNFTMint.toString());
      expect(propertyAccount.metadataUri).to.equal("https://example.com/meta/p123.json");
    });
  });

  describe("Property Update", () => {
    it("Update property price by owner", async () => {
      await program.methods.updateProperty(new anchor.BN(1500000), null, null)
        .accounts({
          property: propertyPDA,
          owner: authority.publicKey,
          ownerNftAccount: ownerNFTAccount,
          propertyNftMint: propertyNFTMint
        })
        .rpc();
      const propertyAfter = await program.account.property.fetch(propertyPDA);
      expect(propertyAfter.price.toNumber()).to.equal(1500000);
    });

    it("Modify property status (active/inactive)", async () => {
      await program.methods.updateProperty(null, null, false)
        .accounts({
          property: propertyPDA,
          owner: authority.publicKey,
          ownerNftAccount: ownerNFTAccount,
          propertyNftMint: propertyNFTMint
        })
        .rpc();
      const propertyAfter = await program.account.property.fetch(propertyPDA);
      expect(propertyAfter.isActive).to.be.false;
    });

    it("Prevent unauthorized property updates", async () => {
      const unauthorized = anchor.web3.Keypair.generate();
      try {
        await program.methods.updateProperty(new anchor.BN(2000000), null, null)
          .accounts({
            property: propertyPDA,
            owner: unauthorized.publicKey,
            ownerNftAccount: ownerNFTAccount,
            propertyNftMint: propertyNFTMint
          })
          .signers([unauthorized])
          .rpc();
        expect.fail("Should have failed with unauthorized update");
      } catch (error) {
        expect(error.toString()).to.include("Constraint");
      }
    });
  });

  describe("Offer Creation with Escrow", () => {
    let offerPDA: PublicKey;
    let escrowPDA: PublicKey;
    let initialBuyerBalance: number;

    before(async () => {
      await program.methods.updateProperty(null, null, true)
        .accounts({
          property: propertyPDA,
          owner: authority.publicKey,
          ownerNftAccount: ownerNFTAccount,
          propertyNftMint: propertyNFTMint
        })
        .rpc();
      
      [offerPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("offer"), propertyPDA.toBuffer(), buyer.publicKey.toBuffer()],
        program.programId
      );
      
      [escrowPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("escrow"), propertyPDA.toBuffer(), buyer.publicKey.toBuffer()],
        program.programId
      );
      
      initialBuyerBalance = await provider.connection.getBalance(buyer.publicKey);
    });

    it("Create offer with funds transferred to escrow", async () => {
      const offerAmount = 900000;
      
      await program.methods.makeOffer(
        new anchor.BN(offerAmount),
        new anchor.BN(Math.floor(Date.now() / 1000) + 86400)
      )
      .accounts({
        property: propertyPDA,
        offer: offerPDA,
        escrowAccount: escrowPDA,
        buyer: buyer.publicKey,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY
      })
      .signers([buyer])
      .rpc();
      
      // Verify offer created
      const offerAccount = await program.account.offer.fetch(offerPDA);
      expect(offerAccount.buyer.toString()).to.equal(buyer.publicKey.toString());
      expect(offerAccount.amount.toNumber()).to.equal(offerAmount);
      expect(offerAccount.escrow.toString()).to.equal(escrowPDA.toString());
      
      // Verify escrow account
      const escrowAccount = await program.account.escrowAccount.fetch(escrowPDA);
      expect(escrowAccount.buyer.toString()).to.equal(buyer.publicKey.toString());
      expect(escrowAccount.property.toString()).to.equal(propertyPDA.toString());
      expect(escrowAccount.amount.toNumber()).to.equal(offerAmount);
      expect(escrowAccount.isActive).to.be.true;
      
      // Verify funds transferred
      const finalBuyerBalance = await provider.connection.getBalance(buyer.publicKey);
      const escrowBalance = await provider.connection.getBalance(escrowPDA);
      
      // Account for rent and transaction fees
      expect(initialBuyerBalance - finalBuyerBalance).to.be.greaterThan(offerAmount);
      expect(escrowBalance).to.be.greaterThan(0);
    });

    it("Handle expiration time in offer", async () => {
      const offerAccount = await program.account.offer.fetch(offerPDA);
      expect(offerAccount.expirationTime.toNumber()).to.be.greaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe("Offer Response and Property Transfer", () => {
    let offerPDA: PublicKey;
    let escrowPDA: PublicKey;
    let buyerNFTAccount: PublicKey;
    let propertyPDA: PublicKey;
    let propertyNFTMint: PublicKey;
    let ownerNFTAccount: PublicKey;
    let transactionHistoryPDA: PublicKey;
    
    let sellerInitialBalance: number;
    let buyerInitialBalance: number;
    let authorityInitialBalance: number;

    async function setupPropertyAndOffer(propertyId: string, offerAmount: number, expirationOffset: number) {
      // Create NFT for property
      const nftAccounts = await createNFTMintAndAccount(authority.publicKey);
      propertyNFTMint = nftAccounts.mint;
      ownerNFTAccount = nftAccounts.tokenAccount;
      
      // Create property PDA
      [propertyPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyId)],
        program.programId
      );

      // List property
      await program.methods.listProperty(
        propertyId,
        new anchor.BN(1000000),
        "https://example.com/meta/property.json",
        "456 Blockchain St",
        new anchor.BN(3000),
        4,
        3
      )
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
      .rpc();

      // Create buyer's NFT account for this property
      buyerNFTAccount = await token.getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer,
        propertyNFTMint,
        buyer.publicKey
      ).then(ata => ata.address);

      // Get offer and escrow PDAs
      [offerPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("offer"), propertyPDA.toBuffer(), buyer.publicKey.toBuffer()],
        program.programId
      );
      
      [escrowPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("escrow"), propertyPDA.toBuffer(), buyer.publicKey.toBuffer()],
        program.programId
      );
      
      [transactionHistoryPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("transaction"), propertyPDA.toBuffer(), new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0])],
        program.programId
      );

      // Record initial balances
      sellerInitialBalance = await provider.connection.getBalance(authority.publicKey);
      buyerInitialBalance = await provider.connection.getBalance(buyer.publicKey);
      authorityInitialBalance = await provider.connection.getBalance(authority.publicKey);

      // Make offer with escrow
      await program.methods.makeOffer(
        new anchor.BN(offerAmount),
        new anchor.BN(Math.floor(Date.now() / 1000) + expirationOffset)
      )
      .accounts({
        property: propertyPDA,
        offer: offerPDA,
        escrowAccount: escrowPDA,
        buyer: buyer.publicKey,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY
      })
      .signers([buyer])
      .rpc();
    }

    it("Accept offer and complete property transfer", async () => {
      await setupPropertyAndOffer("PropertyAccept", 800000, 86400);
      
      // Accept the offer which should trigger the property transfer
      await program.methods.respondToOffer(true)
        .accounts({
          marketplace: marketplacePDA,
          property: propertyPDA,
          offer: offerPDA,
          escrowAccount: escrowPDA,
          marketplaceAuthority: authority.publicKey,
          owner: authority.publicKey,
          buyerWallet: buyer.publicKey,
          sellerNftAccount: ownerNFTAccount,
          buyerNftAccount: buyerNFTAccount,
          transactionHistory: transactionHistoryPDA,
          tokenProgram: token.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      
      // Verify offer status
      const offerAccount = await program.account.offer.fetch(offerPDA);
      expect(offerAccount.status).to.deep.equal({ completed: {} });
      
      // Verify property ownership transferred
      const propertyAccount = await program.account.property.fetch(propertyPDA);
      expect(propertyAccount.owner.toString()).to.equal(buyer.publicKey.toString());
      expect(propertyAccount.isActive).to.be.false;
      
      // Verify NFT transferred
      const buyerNFTBalance = await provider.connection.getTokenAccountBalance(buyerNFTAccount);
      const sellerNFTBalance = await provider.connection.getTokenAccountBalance(ownerNFTAccount);
      expect(buyerNFTBalance.value.uiAmount).to.equal(1);
      expect(sellerNFTBalance.value.uiAmount).to.equal(0);
      
      // Verify escrow is inactive
      const escrowAccount = await program.account.escrowAccount.fetch(escrowPDA);
      expect(escrowAccount.isActive).to.be.false;
      
      // Verify funds transferred to seller
      const sellerFinalBalance = await provider.connection.getBalance(authority.publicKey);
      const marketplaceFee = 800000 * 0.01; // 1% fee
      const expectedSellerIncrease = 800000 - marketplaceFee;
      
      // Due to rent and transaction fees, we use an approximate check
      expect(sellerFinalBalance - sellerInitialBalance).to.be.closeTo(expectedSellerIncrease, 10000);
      
      // Verify transaction history
      const txHistory = await program.account.transactionHistory.fetch(transactionHistoryPDA);
      expect(txHistory.buyer.toString()).to.equal(buyer.publicKey.toString());
      expect(txHistory.seller.toString()).to.equal(authority.publicKey.toString());
      expect(txHistory.property.toString()).to.equal(propertyPDA.toString());
      expect(txHistory.price.toNumber()).to.equal(800000);
    });

    it("Reject offer and return funds to buyer", async () => {
      await setupPropertyAndOffer("PropertyReject", 700000, 86400);
      
      const escrowBalanceBefore = await provider.connection.getBalance(escrowPDA);
      const buyerBalanceBefore = await provider.connection.getBalance(buyer.publicKey);
      
      // Reject the offer
      await program.methods.respondToOffer(false)
        .accounts({
          marketplace: marketplacePDA,
          property: propertyPDA,
          offer: offerPDA,
          escrowAccount: escrowPDA,
          marketplaceAuthority: authority.publicKey,
          owner: authority.publicKey,
          buyerWallet: buyer.publicKey,
          sellerNftAccount: ownerNFTAccount,
          buyerNftAccount: buyerNFTAccount,
          transactionHistory: transactionHistoryPDA,
          tokenProgram: token.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      
      // Verify offer status
      const offerAccount = await program.account.offer.fetch(offerPDA);
      expect(offerAccount.status).to.deep.equal({ rejected: {} });
      
      // Verify escrow is inactive
      const escrowAccount = await program.account.escrowAccount.fetch(escrowPDA);
      expect(escrowAccount.isActive).to.be.false;
      
      // Verify property still owned by seller
      const propertyAccount = await program.account.property.fetch(propertyPDA);
      expect(propertyAccount.owner.toString()).to.equal(authority.publicKey.toString());
      
      // Verify funds returned to buyer
      const escrowBalanceAfter = await provider.connection.getBalance(escrowPDA);
      const buyerBalanceAfter = await provider.connection.getBalance(buyer.publicKey);
      
      expect(escrowBalanceAfter).to.be.lessThan(escrowBalanceBefore);
      // Buyer should have received most of their funds back (minus transaction fees)
      expect(buyerBalanceAfter - buyerBalanceBefore).to.be.closeTo(0, 10000); // Allow for small differences due to transaction fees
    });
  });
});