#![allow(unused_imports)]
#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::Token;
use mpl_token_metadata::{
    instructions::{
        CreateV1,
        CreateV1InstructionArgs,
    },
    types::{
        Creator, 
        TokenStandard, 
        CollectionDetails, 
        PrintSupply, 
        Collection,
        Uses,
    },
};
use std::mem::size_of;

declare_id!("EcPni58apii69R7PstXNThzv44dTYdprEV1HzkjT3DbE");

const METAPLEX_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    0x6d, 0x65, 0x74, 0x61, 0x51, 0x62, 0x69, 0x78, 0x6d, 0x68, 0x64, 0x72, 0x62, 0x78, 0x63, 0x32,
    0x34, 0x63, 0x61, 0x64, 0x74, 0x63, 0x71, 0x32, 0x63, 0x64, 0x79, 0x6a, 0x63, 0x6c, 0x79, 0x33,
]);

#[program]
pub mod real_estate_marketplace {
    use super::*;

    pub fn initialize_marketplace(
        ctx: Context<InitializeMarketplace>,
        marketplace_fee: u64,
    ) -> Result<()> {
        require!(marketplace_fee <= 10000, ErrorCode::InvalidFeePercentage);
        
        let marketplace = &mut ctx.accounts.marketplace;
        marketplace.authority = ctx.accounts.authority.key();
        marketplace.properties_count = 0;
        marketplace.fee_percentage = marketplace_fee;
        Ok(())
    }

    pub fn list_property(
        ctx: Context<ListProperty>,
        property_id: String,
        price: u64,
        metadata_uri: String,
        location: String,
        square_feet: u64,
        bedrooms: u8,
        bathrooms: u8,
    ) -> Result<()> {
        require!(property_id.len() <= 32, ErrorCode::PropertyIdTooLong);
        require!(metadata_uri.len() <= 100, ErrorCode::MetadataUriTooLong);
        require!(location.len() <= 50, ErrorCode::LocationTooLong);
        require!(price > 0, ErrorCode::InvalidPrice);

        let marketplace = &mut ctx.accounts.marketplace;
        let property = &mut ctx.accounts.property;
        let clock = Clock::get()?;

        // Create Metaplex metadata
        let creators = vec![Creator {
            address: ctx.accounts.owner.key(),
            verified: true,
            share: 100,
        }];
        
        let metadata_args = CreateV1InstructionArgs {
            name: format!("Property #{}", property_id),
            symbol: "PROP".to_string(),
            uri: metadata_uri.clone(),
            creators: Some(creators),
            seller_fee_basis_points: 0,
            is_mutable: true,
            token_standard: TokenStandard::NonFungible,
            collection: None,
            collection_details: Some(CollectionDetails::V1 { size: 0 }),
            decimals: Some(0),
            print_supply: Some(PrintSupply::Unlimited),
            primary_sale_happened: false,
            rule_set: None,
            uses: None,
        };
        
        let create_metadata_ix = CreateV1 {
            authority: ctx.accounts.owner.key(),
            mint: (ctx.accounts.property_nft_mint.key(), true),
            metadata: ctx.accounts.metadata.key(),
            master_edition: Some(ctx.accounts.metadata.key()),
            system_program: ctx.accounts.system_program.key(),
            sysvar_instructions: ctx.accounts.rent.key(),
            spl_token_program: Some(ctx.accounts.token_program.key()),
            payer: ctx.accounts.owner.key(),
            update_authority: (ctx.accounts.owner.key(), true),
        };
        
        // Invoke Metaplex metadata creation
        anchor_lang::solana_program::program::invoke(
            &create_metadata_ix.instruction(metadata_args),
            &[
                ctx.accounts.metadata.to_account_info(),
                ctx.accounts.property_nft_mint.to_account_info(),
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.token_metadata_program.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
        )?;

        // Initialize property account
        property.owner = ctx.accounts.owner.key();
        property.property_id = property_id;
        property.price = price;
        property.metadata_uri = metadata_uri;
        property.location = location;
        property.square_feet = square_feet;
        property.bedrooms = bedrooms;
        property.bathrooms = bathrooms;
        property.is_active = true;
        property.created_at = clock.unix_timestamp;
        property.updated_at = clock.unix_timestamp;
        property.transaction_count = 0;
        property.marketplace = marketplace.key();
        property.nft_mint = ctx.accounts.property_nft_mint.key();

        marketplace.properties_count = marketplace
            .properties_count
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        emit!(PropertyListed {
            property: property.key(),
            owner: property.owner,
            property_id: property.property_id.clone(),
            price: property.price,
            nft_mint: property.nft_mint,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }


    pub fn update_property(
        ctx: Context<UpdateProperty>,
        price: Option<u64>,
        metadata_uri: Option<String>,
        is_active: Option<bool>,
    ) -> Result<()> {
        let property = &mut ctx.accounts.property;
        let clock = Clock::get()?;

        let owner_nft_account = TokenAccount::try_deserialize(&mut &ctx.accounts.owner_nft_account.data.borrow()[..])?;
        require!(owner_nft_account.amount == 1, ErrorCode::NotNFTOwner);

        if let Some(new_price) = price {
            require!(new_price > 0, ErrorCode::InvalidPrice);
            property.price = new_price;
        }

        if let Some(new_metadata_uri) = metadata_uri {
            require!(
                new_metadata_uri.len() <= 200,
                ErrorCode::MetadataUriTooLong
            );
            property.metadata_uri = new_metadata_uri;
        }

        if let Some(new_is_active) = is_active {
            property.is_active = new_is_active;
        }

        property.updated_at = clock.unix_timestamp;

        emit!(PropertyUpdated {
            property: property.key(),
            owner: property.owner,
            price: property.price,
            is_active: property.is_active,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    pub fn make_offer(
        ctx: Context<MakeOffer>,
        offer_amount: u64,
        expiration_time: i64,
    ) -> Result<()> {
        let property = &ctx.accounts.property;
        let offer = &mut ctx.accounts.offer;
        let clock = Clock::get()?;

        require!(property.is_active, ErrorCode::PropertyNotActive);
        require!(offer_amount > 0, ErrorCode::InvalidOfferAmount);
        require!(
            expiration_time > clock.unix_timestamp,
            ErrorCode::InvalidExpirationTime
        );

        offer.buyer = ctx.accounts.buyer.key();
        offer.property = property.key();
        offer.amount = offer_amount;
        offer.status = OfferStatus::Pending;
        offer.created_at = clock.unix_timestamp;
        offer.updated_at = clock.unix_timestamp;
        offer.expiration_time = expiration_time;

        emit!(OfferCreated {
            offer: offer.key(),
            property: property.key(),
            buyer: offer.buyer,
            amount: offer_amount,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    pub fn respond_to_offer(ctx: Context<RespondToOffer>, accept: bool) -> Result<()> {
        let property = &mut ctx.accounts.property;
        let offer = &mut ctx.accounts.offer;
        let clock = Clock::get()?;

        require!(
            offer.status == OfferStatus::Pending,
            ErrorCode::OfferNotPending
        );

        if offer.expiration_time <= clock.unix_timestamp {
            offer.status = OfferStatus::Expired;
            offer.updated_at = clock.unix_timestamp;
            return Err(ErrorCode::OfferExpired.into());
        }

        if accept {
            offer.status = OfferStatus::Accepted;
            emit!(OfferAccepted {
                offer: offer.key(),
                property: property.key(),
                buyer: offer.buyer,
                seller: property.owner,
                amount: offer.amount,
                timestamp: clock.unix_timestamp,
            });
        } else {
            offer.status = OfferStatus::Rejected;
            emit!(OfferRejected {
                offer: offer.key(),
                property: property.key(),
                buyer: offer.buyer,
                seller: property.owner,
                timestamp: clock.unix_timestamp,
            });
        }

        offer.updated_at = clock.unix_timestamp;

        Ok(())
    }

    pub fn execute_sale(ctx: Context<ExecuteSale>) -> Result<()> {
        let property = &mut ctx.accounts.property;
        let offer = &mut ctx.accounts.offer;
        let marketplace = &ctx.accounts.marketplace;
        let clock = Clock::get()?;

        require!(
            offer.status == OfferStatus::Accepted,
            ErrorCode::OfferNotAccepted
        );
        require!(
            offer.property == property.key(),
            ErrorCode::OfferPropertyMismatch
        );

        let seller_nft_account = TokenAccount::try_deserialize(&mut &ctx.accounts.seller_nft_account.data.borrow()[..])?;
        require!(seller_nft_account.amount == 1, ErrorCode::NotNFTOwner);

        let fee_amount = offer
            .amount
            .checked_mul(marketplace.fee_percentage)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        let seller_amount = offer
            .amount
            .checked_sub(fee_amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_token_account.to_account_info(),
                    to: ctx.accounts.seller_token_account.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            seller_amount,
        )?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_token_account.to_account_info(),
                    to: ctx.accounts.marketplace_fee_account.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            fee_amount,
        )?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.seller_nft_account.to_account_info(),
                    to: ctx.accounts.buyer_nft_account.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            1,
        )?;

        let previous_owner = property.owner;
        property.owner = offer.buyer;
        property.price = offer.amount;
        property.is_active = false;
        property.updated_at = clock.unix_timestamp;
        property.transaction_count = property
            .transaction_count
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        let transaction_history = &mut ctx.accounts.transaction_history;
        transaction_history.property = property.key();
        transaction_history.seller = previous_owner;
        transaction_history.buyer = offer.buyer;
        transaction_history.price = offer.amount;
        transaction_history.timestamp = clock.unix_timestamp;
        transaction_history.transaction_index = property.transaction_count;

        offer.status = OfferStatus::Completed;
        offer.updated_at = clock.unix_timestamp;

        emit!(PropertySold {
            property: property.key(),
            transaction_history: transaction_history.key(),
            previous_owner,
            new_owner: property.owner,
            price: offer.amount,
            nft_mint: property.nft_mint,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(marketplace_fee: u64)]
pub struct InitializeMarketplace<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + size_of::<Marketplace>(),
        seeds = [b"marketplace", authority.key().as_ref()],
        bump
    )]
    pub marketplace: Account<'info, Marketplace>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(
    property_id: String,
    price: u64,
    metadata_uri: String,
    location: String,
    square_feet: u64,
    bedrooms: u8,
    bathrooms: u8
)]
pub struct ListProperty<'info> {
    #[account(mut)]
    pub marketplace: Account<'info, Marketplace>,
    #[account(
        init,
        payer = owner,
        space = 8 + size_of::<Property>(),
        seeds = [b"property", marketplace.key().as_ref(), property_id.as_bytes()],
        bump
    )]
    pub property: Account<'info, Property>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: This is the NFT mint account
    #[account(
        init,
        payer = owner,
        mint::decimals = 0,
        mint::authority = owner,
        seeds = [b"nft_mint", property_id.as_bytes()],
        bump
    )]
    pub property_nft_mint: UncheckedAccount<'info>,
    /// CHECK: This is the owner's NFT token account
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = property_nft_mint,
        associated_token::authority = owner
    )]
    pub owner_nft_account: UncheckedAccount<'info>,
    /// CHECK: This is the metadata account for the NFT
    #[account(
        mut,
        seeds = [
            b"metadata",
            METAPLEX_PROGRAM_ID.as_ref(),
            property_nft_mint.key.as_ref()
        ],
        bump,
        seeds::program = METAPLEX_PROGRAM_ID
    )]
    pub metadata: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK: This is the Metaplex token metadata program
    #[account(address = METAPLEX_PROGRAM_ID)]
    pub token_metadata_program: UncheckedAccount<'info>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UpdateProperty<'info> {
    #[account(
        mut,
        constraint = property.owner == *owner.key
    )]
    pub property: Account<'info, Property>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: This is the owner's NFT token account
    #[account(
        mut,
        constraint = owner_nft_account.owner == &token::ID
    )]
    pub owner_nft_account: AccountInfo<'info>,
    /// CHECK: This is the NFT mint account
    #[account(
        constraint = property.nft_mint == *property_nft_mint.key
    )]
    pub property_nft_mint: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct MakeOffer<'info> {
    #[account(
        constraint = property.is_active,
        constraint = property.owner != *buyer.key
    )]
    pub property: Account<'info, Property>,
    #[account(
        init,
        payer = buyer,
        space = 8 + size_of::<Offer>(),
        seeds = [b"offer", property.key().as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub offer: Account<'info, Offer>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct RespondToOffer<'info> {
    #[account(
        mut,
        constraint = property.owner == *owner.key
    )]
    pub property: Account<'info, Property>,
    #[account(
        mut,
        constraint = offer.property == property.key()
    )]
    pub offer: Account<'info, Offer>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteSale<'info> {
    #[account(mut)]
    pub marketplace: Account<'info, Marketplace>,
    #[account(mut)]
    pub property: Account<'info, Property>,
    #[account(
        mut,
        constraint = offer.property == property.key(),
        constraint = offer.status == OfferStatus::Accepted,
        constraint = offer.buyer == *buyer.key
    )]
    pub offer: Account<'info, Offer>,
    #[account(
        init,
        payer = buyer,
        space = 8 + size_of::<TransactionHistory>(),
        seeds = [
            b"transaction",
            property.key().as_ref(),
            &property.transaction_count.checked_add(1).ok_or(ErrorCode::ArithmeticOverflow)?.to_le_bytes()
        ],
        bump
    )]
    pub transaction_history: Account<'info, TransactionHistory>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        constraint = property.owner == *seller.key
    )]
    pub seller: Signer<'info>,
    /// CHECK: This is the buyer's token account for payment
    #[account(mut)]
    pub buyer_token_account: AccountInfo<'info>,
    /// CHECK: This is the seller's token account for payment
    #[account(mut)]
    pub seller_token_account: AccountInfo<'info>,
    /// CHECK: This is the marketplace fee token account
    #[account(mut)]
    pub marketplace_fee_account: AccountInfo<'info>,
    /// CHECK: This is the seller's NFT token account
    #[account(mut)]
    pub seller_nft_account: AccountInfo<'info>,
    /// CHECK: This is the buyer's NFT token account
    #[account(mut)]
    pub buyer_nft_account: AccountInfo<'info>,
    /// CHECK: This is the NFT mint account
    #[account(
        constraint = property.nft_mint == *property_nft_mint.key
    )]
    pub property_nft_mint: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
pub struct Marketplace {
    pub authority: Pubkey,
    pub properties_count: u64,
    pub fee_percentage: u64,
}

#[account]
pub struct Property {
    pub marketplace: Pubkey,
    pub owner: Pubkey,
    pub property_id: String,
    pub price: u64,
    pub metadata_uri: String,
    pub location: String,
    pub square_feet: u64,
    pub bedrooms: u8,
    pub bathrooms: u8,
    pub is_active: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub transaction_count: u64,
    pub nft_mint: Pubkey,
}

#[account]
pub struct Offer {
    pub buyer: Pubkey,
    pub property: Pubkey,
    pub amount: u64,
    pub status: OfferStatus,
    pub created_at: i64,
    pub updated_at: i64,
    pub expiration_time: i64,
}

#[account]
pub struct TransactionHistory {
    pub property: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub price: u64,
    pub timestamp: i64,
    pub transaction_index: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum OfferStatus {
    Pending,
    Accepted,
    Rejected,
    Completed,
    Expired,
}

#[event]
pub struct PropertyListed {
    pub property: Pubkey,
    pub owner: Pubkey,
    pub property_id: String,
    pub price: u64,
    pub nft_mint: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PropertyUpdated {
    pub property: Pubkey,
    pub owner: Pubkey,
    pub price: u64,
    pub is_active: bool,
    pub timestamp: i64,
}

#[event]
pub struct OfferCreated {
    pub offer: Pubkey,
    pub property: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct OfferAccepted {
    pub offer: Pubkey,
    pub property: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct OfferRejected {
    pub offer: Pubkey,
    pub property: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PropertySold {
    pub property: Pubkey,
    pub transaction_history: Pubkey,
    pub previous_owner: Pubkey,
    pub new_owner: Pubkey,
    pub price: u64,
    pub nft_mint: Pubkey,
    pub timestamp: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Property ID too long")]
    PropertyIdTooLong,
    #[msg("Metadata URI too long")]
    MetadataUriTooLong,
    #[msg("Location too long")]
    LocationTooLong,
    #[msg("Invalid price")]
    InvalidPrice,
    #[msg("Invalid offer amount")]
    InvalidOfferAmount,
    #[msg("Invalid expiration time")]
    InvalidExpirationTime,
    #[msg("Not property owner")]
    NotPropertyOwner,
    #[msg("Property not active")]
    PropertyNotActive,
    #[msg("Cannot offer on own property")]
    CannotOfferOwnProperty,
    #[msg("Offer not pending")]
    OfferNotPending,
    #[msg("Offer expired")]
    OfferExpired,
    #[msg("Offer not accepted")]
    OfferNotAccepted,
    #[msg("Offer property mismatch")]
    OfferPropertyMismatch,
    #[msg("Not offer buyer")]
    NotOfferBuyer,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    #[msg("Invalid marketplace fee account")]
    InvalidMarketplaceFeeAccount,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Invalid fee percentage")]
    InvalidFeePercentage,
    #[msg("Not NFT owner")]
    NotNFTOwner,
    #[msg("Invalid NFT mint")]
    InvalidNFTMint,
}