import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RealEstateMarketplace } from "../target/types/real_estate_marketplace";
import { expect } from "chai";
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import * as token from "@solana/spl-token";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

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
  let metadataPDA: PublicKey;
  let buyer: anchor.web3.Keypair;
  let feeTokenMint: PublicKey;
  let marketplaceFeeAccount: PublicKey; // Moved to higher scope

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
    const tokenAccount = await token.createAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      mint.publicKey,
      owner
    );
    return { mint: mint.publicKey, tokenAccount };
  }

  async function createFeeTokenMint() {
    const mint = anchor.web3.Keypair.generate();
    await token.createMint(provider.connection, authority.payer, authority.publicKey, null, 6, mint);
    return mint.publicKey;
  }

  before(async () => {
    await ensureMinimumBalance(authority.publicKey, 10 * LAMPORTS_PER_SOL);

    [marketplacePDA, marketplaceBump] = await PublicKey.findProgramAddress(
      [Buffer.from("marketplace"), authority.publicKey.toBuffer()],
      program.programId
    );

    buyer = anchor.web3.Keypair.generate();
    const transferIx = SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: buyer.publicKey,
      lamports: 5 * LAMPORTS_PER_SOL,
    });
    const tx = new anchor.web3.Transaction().add(transferIx);
    await provider.sendAndConfirm(tx);
    await ensureMinimumBalance(buyer.publicKey, 2 * LAMPORTS_PER_SOL);

    feeTokenMint = await createFeeTokenMint();
    
    // Initialize marketplaceFeeAccount here
    marketplaceFeeAccount = await token.getOrCreateAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      feeTokenMint,
      authority.publicKey
    ).then(ata => ata.address);

    try {
      await program.methods
        .initializeMarketplace(new anchor.BN(100), feeTokenMint)
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
      expect(marketplaceAccount.feeTokenMint.toString()).to.equal(feeTokenMint.toString());
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
      [metadataPDA] = await PublicKey.findProgramAddress(
        [
          Buffer.from("metadata"),
          new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
          propertyNFTMint.toBuffer(),
        ],
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
      );
    });

    it("Successfully list a property with complete details", async () => {
      await program.methods
        .listProperty(
          "Property123",
          new anchor.BN(1000000),
          "https://example.com/meta/p123.json",
          "123 Blockchain St",
          new anchor.BN(2500),
          3,
          2,
          "Luxury Home",
          "LH",
          "Residential"
        )
        .accounts({
          marketplace: marketplacePDA,
          property: propertyPDA,
          owner: authority.publicKey,
          propertyNftMint: propertyNFTMint,
          ownerNftAccount: ownerNFTAccount,
          metadata: metadataPDA,
          metadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      const propertyAccount = await program.account.property.fetch(propertyPDA);
      expect(propertyAccount.propertyId).to.equal("Property123");
      expect(propertyAccount.price.toNumber()).to.equal(1000000);
      expect(propertyAccount.category).to.equal("Residential");
    });

    it("Verify NFT and metadata creation during listing", async () => {
      const propertyAccount = await program.account.property.fetch(propertyPDA);
      expect(propertyAccount.nftMint.toString()).to.equal(propertyNFTMint.toString());
      expect(propertyAccount.metadataUri).to.equal("https://example.com/meta/p123.json");
    });
  });

  describe("Property Update", () => {
    it("Update property price and category by owner", async () => {
      await program.methods
        .updateProperty(new anchor.BN(1500000), null, null, "Luxury Residential")
        .accounts({
          property: propertyPDA,
          owner: authority.publicKey,
          ownerNftAccount: ownerNFTAccount,
          propertyNftMint: propertyNFTMint,
        })
        .rpc();
      const propertyAfter = await program.account.property.fetch(propertyPDA);
      expect(propertyAfter.price.toNumber()).to.equal(1500000);
      expect(propertyAfter.category).to.equal("Luxury Residential");
    });

    it("Modify property status", async () => {
      await program.methods
        .updateProperty(null, null, false, null)
        .accounts({
          property: propertyPDA,
          owner: authority.publicKey,
          ownerNftAccount: ownerNFTAccount,
          propertyNftMint: propertyNFTMint,
        })
        .rpc();
      const propertyAfter = await program.account.property.fetch(propertyPDA);
      expect(propertyAfter.isActive).to.be.false;
    });
  });

  describe("Offer Creation", () => {
    let offerPDA: PublicKey;

    before(async () => {
      await program.methods
        .updateProperty(null, null, true, null)
        .accounts({
          property: propertyPDA,
          owner: authority.publicKey,
          ownerNftAccount: ownerNFTAccount,
          propertyNftMint: propertyNFTMint,
        })
        .rpc();
      [offerPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("offer"), propertyPDA.toBuffer(), buyer.publicKey.toBuffer()],
        program.programId
      );
    });

    it("Create valid offer on an active property", async () => {
      const expirationTime = Math.floor(Date.now() / 1000) + 86400;
      await program.methods
        .makeOffer(new anchor.BN(900000), new anchor.BN(expirationTime))
        .accounts({
          property: propertyPDA,
          offer: offerPDA,
          buyer: buyer.publicKey,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([buyer])
        .rpc();

      const offerAccount = await program.account.offer.fetch(offerPDA);
      expect(offerAccount.amount.toNumber()).to.equal(900000);
      expect(offerAccount.status).to.deep.equal({ pending: {} });
    });
  });

  describe("Offer Response", () => {
    let offerPDA: PublicKey;
    let newPropertyPDA: PublicKey;
    let newPropertyNFTMint: PublicKey;
    let newOwnerNFTAccount: PublicKey;
    let newMetadataPDA: PublicKey;

    async function setupPropertyAndOffer(propertyId: string) {
      const nftAccounts = await createNFTMintAndAccount(authority.publicKey);
      newPropertyNFTMint = nftAccounts.mint;
      newOwnerNFTAccount = nftAccounts.tokenAccount;
      [newPropertyPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyId)],
        program.programId
      );
      [newMetadataPDA] = await PublicKey.findProgramAddress(
        [
          Buffer.from("metadata"),
          new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
          newPropertyNFTMint.toBuffer(),
        ],
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
      );

      await program.methods
        .listProperty(
          propertyId,
          new anchor.BN(1000000),
          "https://example.com/meta/p456.json",
          "456 Blockchain St",
          new anchor.BN(3000),
          4,
          3,
          "Test Home",
          "TH",
          "Residential"
        )
        .accounts({
          marketplace: marketplacePDA,
          property: newPropertyPDA,
          owner: authority.publicKey,
          propertyNftMint: newPropertyNFTMint,
          ownerNftAccount: newOwnerNFTAccount,
          metadata: newMetadataPDA,
          metadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      [offerPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("offer"), newPropertyPDA.toBuffer(), buyer.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .makeOffer(new anchor.BN(900000), new anchor.BN(Math.floor(Date.now() / 1000) + 86400))
        .accounts({
          property: newPropertyPDA,
          offer: offerPDA,
          buyer: buyer.publicKey,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([buyer])
        .rpc();
    }

    it("Accept pending offer", async () => {
      await setupPropertyAndOffer("Property456");
      await program.methods
        .respondToOffer(true)
        .accounts({
          property: newPropertyPDA,
          offer: offerPDA,
          owner: authority.publicKey,
        })
        .rpc();
      const offerAccount = await program.account.offer.fetch(offerPDA);
      expect(offerAccount.status).to.deep.equal({ accepted: {} });
    });
  });

  describe("Sale Execution", () => {
    let offerPDA: PublicKey;
    let transactionHistoryPDA: PublicKey;
    let buyerNFTAccount: PublicKey;
    let buyerTokenAccount: PublicKey;
    let sellerTokenAccount: PublicKey;
    let salePropertyPDA: PublicKey;
    let salePropertyNFTMint: PublicKey;
    let saleOwnerNFTAccount: PublicKey;
    let saleMetadataPDA: PublicKey;

    before(async () => {
      const nftAccounts = await createNFTMintAndAccount(authority.publicKey);
      salePropertyNFTMint = nftAccounts.mint;
      saleOwnerNFTAccount = nftAccounts.tokenAccount;
      [salePropertyPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from("Property789")],
        program.programId
      );
      [saleMetadataPDA] = await PublicKey.findProgramAddress(
        [
          Buffer.from("metadata"),
          new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
          salePropertyNFTMint.toBuffer(),
        ],
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
      );

      await program.methods
        .listProperty(
          "Property789",
          new anchor.BN(1000000),
          "https://example.com/meta/p789.json",
          "789 Blockchain St",
          new anchor.BN(3500),
          5,
          4,
          "Premium Home",
          "PH",
          "Residential"
        )
        .accounts({
          marketplace: marketplacePDA,
          property: salePropertyPDA,
          owner: authority.publicKey,
          propertyNftMint: salePropertyNFTMint,
          ownerNftAccount: saleOwnerNFTAccount,
          metadata: saleMetadataPDA,
          metadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      [offerPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("offer"), salePropertyPDA.toBuffer(), buyer.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .makeOffer(new anchor.BN(900000), new anchor.BN(Math.floor(Date.now() / 1000) + 86400))
        .accounts({
          property: salePropertyPDA,
          offer: offerPDA,
          buyer: buyer.publicKey,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([buyer])
        .rpc();

      await program.methods
        .respondToOffer(true)
        .accounts({
          property: salePropertyPDA,
          offer: offerPDA,
          owner: authority.publicKey,
        })
        .rpc();

      buyerNFTAccount = await token.getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer,
        salePropertyNFTMint,
        buyer.publicKey
      ).then(ata => ata.address);

      buyerTokenAccount = await token.getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer,
        feeTokenMint,
        buyer.publicKey
      ).then(ata => ata.address);

      sellerTokenAccount = await token.getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer,
        feeTokenMint,
        authority.publicKey
      ).then(ata => ata.address);

      await token.mintTo(
        provider.connection,
        authority.payer,
        feeTokenMint,
        buyerTokenAccount,
        authority.payer,
        1000000 * 1000000 // 6 decimals
      );

      [transactionHistoryPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("transaction"), salePropertyPDA.toBuffer(), new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0])],
        program.programId
      );
    });

    it("Complete sale for accepted offer", async () => {
      await program.methods
        .executeSale()
        .accounts({
          marketplace: marketplacePDA,
          property: salePropertyPDA,
          offer: offerPDA,
          transactionHistory: transactionHistoryPDA,
          buyer: buyer.publicKey,
          seller: authority.publicKey,
          buyerTokenAccount: buyerTokenAccount,
          sellerTokenAccount: sellerTokenAccount,
          marketplaceFeeAccount: marketplaceFeeAccount,
          sellerNftAccount: saleOwnerNFTAccount,
          buyerNftAccount: buyerNFTAccount,
          propertyNftMint: salePropertyNFTMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([buyer])
        .rpc();

      const propertyAccount = await program.account.property.fetch(salePropertyPDA);
      expect(propertyAccount.owner.toString()).to.equal(buyer.publicKey.toString());
      expect(propertyAccount.isActive).to.be.false;
    });

    it("Verify token and NFT transfers", async () => {
      const buyerNFTBalance = await provider.connection.getTokenAccountBalance(buyerNFTAccount);
      const sellerNFTBalance = await provider.connection.getTokenAccountBalance(saleOwnerNFTAccount);
      const sellerTokenBalance = await provider.connection.getTokenAccountBalance(sellerTokenAccount);
      const marketplaceFeeBalance = await provider.connection.getTokenAccountBalance(marketplaceFeeAccount);

      expect(buyerNFTBalance.value.uiAmount).to.equal(1);
      expect(sellerNFTBalance.value.uiAmount).to.equal(0);
      expect(Number(sellerTokenBalance.value.amount)).to.be.closeTo(891000 * 1000000, 1000000);
      expect(Number(marketplaceFeeBalance.value.amount)).to.be.closeTo(9000 * 1000000, 1000000);
    });
  });

  describe("Fee Withdrawal", () => {
    let authorityTokenAccount: PublicKey;

    before(async () => {
      authorityTokenAccount = await token.getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer,
        feeTokenMint,
        authority.publicKey
      ).then(ata => ata.address);
    });

    it("Withdraw marketplace fees", async () => {
      const initialBalance = await provider.connection.getTokenAccountBalance(authorityTokenAccount);
      
      await program.methods
        .withdrawFees(new anchor.BN(5000 * 1000000))
        .accounts({
          marketplace: marketplacePDA,
          authority: authority.publicKey,
          feeAccount: marketplaceFeeAccount,
          authorityTokenAccount: authorityTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const finalBalance = await provider.connection.getTokenAccountBalance(authorityTokenAccount);
      expect(Number(finalBalance.value.amount) - Number(initialBalance.value.amount)).to.equal(5000 * 1000000);
    });
  });
});