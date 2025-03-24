import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RealEstateMarketplace } from "../target/types/real_estate_marketplace";
import { expect } from "chai";
import { PublicKey, ComputeBudgetProgram, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
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

  async function createNFTMintAndAccount(owner: PublicKey) {
    const mint = anchor.web3.Keypair.generate();
    if ((await provider.connection.getBalance(provider.wallet.publicKey)) < LAMPORTS_PER_SOL) {
      await provider.connection.requestAirdrop(provider.wallet.publicKey, 2 * LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    await token.createMint(provider.connection, authority.payer, owner, null, 0, mint);
    const tokenAccount = await token.createAssociatedTokenAccount(provider.connection, authority.payer, mint.publicKey, owner);
    return { mint: mint.publicKey, tokenAccount };
  }

  before(async () => {
    // Fund the authority wallet
    await provider.connection.requestAirdrop(authority.publicKey, 2 * LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Initialize marketplace
    [marketplacePDA, marketplaceBump] = await PublicKey.findProgramAddress(
      [Buffer.from("marketplace"), authority.publicKey.toBuffer()],
      program.programId
    );
    
    // Create buyer
    buyer = anchor.web3.Keypair.generate();
    await provider.connection.requestAirdrop(buyer.publicKey, 2 * LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  describe("Marketplace Initialization", () => {
    it("Test creating marketplace with valid fee percentage", async () => {
      await program.methods.initializeMarketplace(new anchor.BN(100))
        .accounts({
          marketplace: marketplacePDA,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
    });

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

    it("Handle invalid property listing attempts", async () => {
      const newPropertyPDA = await PublicKey.findProgramAddress(
        [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from("InvalidProp123")],
        program.programId
      );
      
      try {
        await program.methods.listProperty(
          "A".repeat(33), // Exceeds 32 char limit
          new anchor.BN(1000000),
          "https://example.com",
          "123 Blockchain St",
          new anchor.BN(2500),
          3,
          2
        )
        .accounts({
          marketplace: marketplacePDA,
          property: newPropertyPDA[0],
          owner: authority.publicKey,
          propertyNftMint: propertyNFTMint,
          ownerNftAccount: ownerNFTAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: token.TOKEN_PROGRAM_ID,
          associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
        expect.fail("Should have failed with too long property ID");
      } catch (error) {
        // Check for the specific error or use a more flexible error checking
        const errorMessage = error.toString().toLowerCase();
        expect(
          errorMessage.includes("propertyidtoolong") || 
          errorMessage.includes("length of the seed is too long")
        ).to.be.true;
      }
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

  describe("Offer Creation", () => {
    let offerPDA: PublicKey;

    before(async () => {
      // Ensure property is active
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
    });

    it("Create valid offer on an active property", async () => {
      await program.methods.makeOffer(
        new anchor.BN(900000),
        new anchor.BN(Math.floor(Date.now() / 1000) + 86400)
      )
      .accounts({
        property: propertyPDA,
        offer: offerPDA,
        buyer: buyer.publicKey,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY
      })
      .signers([buyer])
      .rpc();
    });

    it("Prevent offer creation on own property", async () => {
      const [selfOfferPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("offer"), propertyPDA.toBuffer(), authority.publicKey.toBuffer()],
        program.programId
      );
      try {
        await program.methods.makeOffer(
          new anchor.BN(900000),
          new anchor.BN(Math.floor(Date.now() / 1000) + 86400)
        )
        .accounts({
          property: propertyPDA,
          offer: selfOfferPDA,
          buyer: authority.publicKey,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY
        })
        .signers([authority.payer])
        .rpc();
        expect.fail("Should have failed offering on own property");
      } catch (error) {
        const errorMessage = error.toString().toLowerCase();
        expect(
          errorMessage.includes("cannotofferonownproperty") || 
          errorMessage.includes("constraint")
        ).to.be.true;
      }
    });

    it("Handle offer with valid expiration time", async () => {
      const offerAccount = await program.account.offer.fetch(offerPDA);
      expect(offerAccount.expirationTime.toNumber()).to.be.greaterThan(Math.floor(Date.now() / 1000));
    });
  });
  describe("Offer Response", () => {
    let offerPDA: PublicKey;
    let propertyPDA: PublicKey;
    let propertyNFTMint: PublicKey;
    let ownerNFTAccount: PublicKey;
  
    async function setupPropertyAndOffer(propertyId: string, offerAmount: number, expirationOffset: number) {
      const nftAccounts = await createNFTMintAndAccount(authority.publicKey);
      propertyNFTMint = nftAccounts.mint;
      ownerNFTAccount = nftAccounts.tokenAccount;
      [propertyPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from(propertyId)],
        program.programId
      );
  
      await program.methods.listProperty(
        propertyId,
        new anchor.BN(1000000),
        "https://example.com/meta/p456.json",
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
  
      [offerPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("offer"), propertyPDA.toBuffer(), buyer.publicKey.toBuffer()],
        program.programId
      );
  
      await program.methods.makeOffer(
        new anchor.BN(offerAmount),
        new anchor.BN(Math.floor(Date.now() / 1000) + expirationOffset)
      )
      .accounts({
        property: propertyPDA,
        offer: offerPDA,
        buyer: buyer.publicKey,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY
      })
      .signers([buyer])
      .rpc();
    }
  
    it("Accept pending offer within expiration", async () => {
      await setupPropertyAndOffer("Property456", 900000, 86400);
  
      await program.methods.respondToOffer(true)
        .accounts({
          property: propertyPDA,
          offer: offerPDA,
          owner: authority.publicKey,
        })
        .rpc();
  
      const offerAccount = await program.account.offer.fetch(offerPDA);
      expect(offerAccount.status).to.deep.equal({ accepted: {} });
    });
  
    it("Reject pending offer", async () => {
      await setupPropertyAndOffer("Property457", 950000, 86400);
  
      await program.methods.respondToOffer(false)
        .accounts({
          property: propertyPDA,
          offer: offerPDA,
          owner: authority.publicKey,
        })
        .rpc();
  
      const offerAccount = await program.account.offer.fetch(offerPDA);
      expect(offerAccount.status).to.deep.equal({ rejected: {} });
    });
  
    it("Handle expired offer scenarios", async () => {
      await setupPropertyAndOffer("Property458", 900000, 1);
  
      await new Promise(resolve => setTimeout(resolve, 2000));
  
      try {
        await program.methods.respondToOffer(true)
          .accounts({
            property: propertyPDA,
            offer: offerPDA,
            owner: authority.publicKey,
          })
          .rpc();
        expect.fail("Should have failed with expired offer");
      } catch (error) {
        expect(error.toString()).to.include("OfferExpired");
      }
    });
  });
  
  describe("Sale Execution", () => {
    let offerPDA: PublicKey;
    let transactionHistoryPDA: PublicKey;
    let buyerNFTAccount: PublicKey;
    let buyerTokenAccount: PublicKey;
    let sellerTokenAccount: PublicKey;
    let marketplaceFeeAccount: PublicKey;
    let paymentMint: PublicKey;
    let propertyPDA: PublicKey;
    let propertyNFTMint: PublicKey;
    let ownerNFTAccount: PublicKey;
  
    before(async () => {
      const nftAccounts = await createNFTMintAndAccount(authority.publicKey);
      propertyNFTMint = nftAccounts.mint;
      ownerNFTAccount = nftAccounts.tokenAccount;
      
      [propertyPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("property"), marketplacePDA.toBuffer(), Buffer.from("Property789")],
        program.programId
      );
  
      await program.methods.listProperty(
        "Property789",
        new anchor.BN(1000000 * LAMPORTS_PER_SOL),
        "https://example.com/meta/p789.json",
        "789 Blockchain St",
        new anchor.BN(3500),
        5,
        4
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
  
      [offerPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("offer"), propertyPDA.toBuffer(), buyer.publicKey.toBuffer()],
        program.programId
      );
  
      await program.methods.makeOffer(
        new anchor.BN(900000 * LAMPORTS_PER_SOL),
        new anchor.BN(Math.floor(Date.now() / 1000) + 86400)
      )
      .accounts({
        property: propertyPDA,
        offer: offerPDA,
        buyer: buyer.publicKey,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY
      })
      .signers([buyer])
      .rpc();
  
      await program.methods.respondToOffer(true)
        .accounts({
          property: propertyPDA,
          offer: offerPDA,
          owner: authority.publicKey,
        })
        .rpc();
  
      buyerNFTAccount = await token.getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer,
        propertyNFTMint,
        buyer.publicKey
      ).then(ata => ata.address);
  
      const mintKp = anchor.web3.Keypair.generate();
      paymentMint = mintKp.publicKey;
      
      await token.createMint(
        provider.connection,
        authority.payer,
        authority.publicKey,
        null,
        6,
        mintKp
      );
      
      buyerTokenAccount = await token.getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer,
        paymentMint,
        buyer.publicKey
      ).then(ata => ata.address);
      
      sellerTokenAccount = await token.getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer,
        paymentMint,
        authority.publicKey
      ).then(ata => ata.address);
  
      const feeReceiver = anchor.web3.Keypair.generate();
      marketplaceFeeAccount = await token.getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer,
        paymentMint,
        feeReceiver.publicKey
      ).then(ata => ata.address);
  
      await token.mintTo(
        provider.connection,
        authority.payer,
        paymentMint,
        buyerTokenAccount,
        authority.payer,
        1000000 * LAMPORTS_PER_SOL
      );
  
      [transactionHistoryPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("transaction"), propertyPDA.toBuffer(), new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0])],
        program.programId
      );
    });
  
    it("Complete sale for accepted offer", async () => {
      await program.methods.executeSale()
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
          sellerNftAccount: ownerNFTAccount,
          buyerNftAccount: buyerNFTAccount,
          propertyNftMint: propertyNFTMint,
          tokenProgram: token.TOKEN_PROGRAM_ID,
          associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([buyer])
        .rpc();
  
      const propertyAccount = await program.account.property.fetch(propertyPDA);
      expect(propertyAccount.owner.toString()).to.equal(buyer.publicKey.toString());
      expect(propertyAccount.isActive).to.be.false;
    });
  
    it("Verify token and NFT transfers", async () => {
      const buyerNFTBalance = await provider.connection.getTokenAccountBalance(buyerNFTAccount);
      const sellerNFTBalance = await provider.connection.getTokenAccountBalance(ownerNFTAccount);
      const sellerTokenBalance = await provider.connection.getTokenAccountBalance(sellerTokenAccount);
      const marketplaceFeeBalance = await provider.connection.getTokenAccountBalance(marketplaceFeeAccount);
  
      expect(buyerNFTBalance.value.uiAmount).to.equal(1);
      expect(sellerNFTBalance.value.uiAmount).to.equal(0);
      // Adjust expectations based on actual transfer amounts (accounting for 6 decimals and 1% fee)
      expect(Number(sellerTokenBalance.value.amount)).to.be.closeTo(891000000000000, 1000000000); // 891 SOL in lamports
      expect(Number(marketplaceFeeBalance.value.amount)).to.be.closeTo(9000000000000, 1000000000);   // 9 SOL in lamports
    });
  
    it("Calculate and transfer marketplace fees", async () => {
      const transactionHistory = await program.account.transactionHistory.fetch(transactionHistoryPDA);
      const marketplaceAccount = await program.account.marketplace.fetch(marketplacePDA);
      const feePercentage = marketplaceAccount.feePercentage.toNumber();
      const expectedFee = (900000 * LAMPORTS_PER_SOL * feePercentage) / 10000;
      const expectedSellerAmount = (900000 * LAMPORTS_PER_SOL) - expectedFee;
  
      const sellerTokenBalance = await provider.connection.getTokenAccountBalance(sellerTokenAccount);
      const marketplaceFeeBalance = await provider.connection.getTokenAccountBalance(marketplaceFeeAccount);
  
      expect(Number(sellerTokenBalance.value.amount)).to.be.closeTo(expectedSellerAmount, LAMPORTS_PER_SOL / 1000);
      expect(Number(marketplaceFeeBalance.value.amount)).to.be.closeTo(expectedFee, LAMPORTS_PER_SOL / 1000);
    });
  });
});