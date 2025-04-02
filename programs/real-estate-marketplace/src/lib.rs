#![allow(unused_imports)]
#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, MintTo, Transfer, Mint, TokenAccount, Token},
    metadata::{Metadata, MetadataAccount, CreateMetadataAccountsV3},
};
use mpl_token_metadata::{
    types::{Creator, DataV2},
    ID as METADATA_PROGRAM_ID,
};
use std::mem::size_of;

const MAX_METADATA_LEN: usize = 679;
const MAX_PROPERTY_ID_LEN: usize = 64;
const MAX_CATEGORY_LEN: usize = 32;

declare_id!("DDnkLJvWSt2FufL76mrE6jmXKNk8wiRnmrLGasCrNocn");

#[program]
pub mod real_estate_marketplace {
    use super::*;

    pub fn initialize_marketplace(
        ctx: Context<InitializeMarketplace>,
        marketplace_fee: u64,
        fee_token_mint: Pubkey,
    ) -> Result<()> {
        require!(marketplace_fee <= 10000, ErrorCode::InvalidFeePercentage);
        
        let marketplace = &mut ctx.accounts.marketplace;
        marketplace.authority = ctx.accounts.authority.key();
        marketplace.properties_count = 0;
        marketplace.fee_percentage = marketplace_fee;
        marketplace.fee_token_mint = fee_token_mint;
        marketplace.total_fees = 0;
        
        emit!(MarketplaceInitialized {
            marketplace: marketplace.key(),
            authority: marketplace.authority,
            fee_percentage: marketplace_fee,
            fee_token_mint,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
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
        name: String,
        symbol: String,
        category: String,
    ) -> Result<()> {
        require!(property_id.len() <= MAX_PROPERTY_ID_LEN, ErrorCode::PropertyIdTooLong);
        require!(metadata_uri.len() <= 200, ErrorCode::MetadataUriTooLong);
        require!(location.len() <= 50, ErrorCode::LocationTooLong);
        require!(price > 0, ErrorCode::InvalidPrice);
        require!(category.len() <= MAX_CATEGORY_LEN, ErrorCode::CategoryTooLong);

        let marketplace = &mut ctx.accounts.marketplace;
        let property = &mut ctx.accounts.property;
        let clock = Clock::get()?;

        // Manual validation of token account
        let owner_nft_account = TokenAccount::try_deserialize(&mut &ctx.accounts.owner_nft_account.data.borrow()[..])?;
        require!(
            owner_nft_account.mint == ctx.accounts.property_nft_mint.key(),
            ErrorCode::InvalidTokenAccountMint
        );
        require!(
            owner_nft_account.owner == ctx.accounts.owner.key(),
            ErrorCode::InvalidTokenAccountOwner
        );

        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.property_nft_mint.to_account_info(),
                    to: ctx.accounts.owner_nft_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            1,
        )?;

        let creator = vec![Creator {
            address: ctx.accounts.owner.key(),
            verified: true,
            share: 100,
        }];

        let metadata_data = DataV2 {
            name,
            symbol,
            uri: metadata_uri.clone(),
            seller_fee_basis_points: 0,
            creators: Some(creator),
            collection: None,
            uses: None,
        };

        anchor_spl::metadata::create_metadata_accounts_v3(
            CpiContext::new(
                ctx.accounts.metadata_program.to_account_info(),
                CreateMetadataAccountsV3 {
                    metadata: ctx.accounts.metadata.to_account_info(),
                    mint: ctx.accounts.property_nft_mint.to_account_info(),
                    mint_authority: ctx.accounts.owner.to_account_info(),
                    payer: ctx.accounts.owner.to_account_info(),
                    update_authority: ctx.accounts.owner.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
            ),
            metadata_data,
            false,
            true,
            None,
        )?;

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
        property.category = category;

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
            category: property.category.clone(),
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    pub fn update_property(
        ctx: Context<UpdateProperty>,
        price: Option<u64>,
        metadata_uri: Option<String>,
        is_active: Option<bool>,
        category: Option<String>,
    ) -> Result<()> {
        let property = &mut ctx.accounts.property;
        let clock = Clock::get()?;

        let owner_nft_account = TokenAccount::try_deserialize(&mut &ctx.accounts.owner_nft_account.data.borrow()[..])?;
        require!(
            owner_nft_account.mint == property.nft_mint,
            ErrorCode::InvalidNFTTokenAccount
        );
        require!(
            owner_nft_account.owner == ctx.accounts.owner.key(),
            ErrorCode::InvalidTokenAccountOwner
        );
        require!(
            owner_nft_account.amount == 1,
            ErrorCode::NotNFTOwner
        );

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

        if let Some(new_category) = category {
            require!(
                new_category.len() <= MAX_CATEGORY_LEN,
                ErrorCode::CategoryTooLong
            );
            property.category = new_category;
        }

        property.updated_at = clock.unix_timestamp;

        emit!(PropertyUpdated {
            property: property.key(),
            owner: property.owner,
            price: property.price,
            is_active: property.is_active,
            category: property.category.clone(),
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
            expiration_time,
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
            emit!(OfferExpired {
                offer: offer.key(),
                property: property.key(),
                buyer: offer.buyer,
                seller: property.owner,
                timestamp: clock.unix_timestamp,
            });
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

    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        let marketplace = &mut ctx.accounts.marketplace;
        let clock = Clock::get()?;

        require!(
            marketplace.authority == ctx.accounts.authority.key(),
            ErrorCode::UnauthorizedFeeWithdrawal
        );
        require!(
            amount <= marketplace.total_fees,
            ErrorCode::InsufficientFeeBalance
        );

        let fee_account = TokenAccount::try_deserialize(&mut &ctx.accounts.fee_account.data.borrow()[..])?;
        let authority_token_account = TokenAccount::try_deserialize(&mut &ctx.accounts.authority_token_account.data.borrow()[..])?;
        require!(
            fee_account.mint == marketplace.fee_token_mint,
            ErrorCode::InvalidFeeTokenAccount
        );
        require!(
            authority_token_account.mint == marketplace.fee_token_mint,
            ErrorCode::InvalidFeeTokenAccount
        );

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.fee_account.to_account_info(),
                    to: ctx.accounts.authority_token_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;

        marketplace.total_fees = marketplace
            .total_fees
            .checked_sub(amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        emit!(FeesWithdrawn {
            marketplace: marketplace.key(),
            authority: ctx.accounts.authority.key(),
            amount,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    pub fn execute_sale(ctx: Context<ExecuteSale>) -> Result<()> {
        let property = &mut ctx.accounts.property;
        let offer = &mut ctx.accounts.offer;
        let marketplace = &mut ctx.accounts.marketplace;
        let clock = Clock::get()?;

        require!(
            offer.status == OfferStatus::Accepted,
            ErrorCode::OfferNotAccepted
        );
        require!(
            offer.property == property.key(),
            ErrorCode::OfferPropertyMismatch
        );

        let buyer_token_account = TokenAccount::try_deserialize(&mut &ctx.accounts.buyer_token_account.data.borrow()[..])?;
        let seller_token_account = TokenAccount::try_deserialize(&mut &ctx.accounts.seller_token_account.data.borrow()[..])?;
        let marketplace_fee_account = TokenAccount::try_deserialize(&mut &ctx.accounts.marketplace_fee_account.data.borrow()[..])?;
        let seller_nft_account = TokenAccount::try_deserialize(&mut &ctx.accounts.seller_nft_account.data.borrow()[..])?;
        let buyer_nft_account = TokenAccount::try_deserialize(&mut &ctx.accounts.buyer_nft_account.data.borrow()[..])?;

        require!(
            buyer_token_account.mint == marketplace.fee_token_mint,
            ErrorCode::InvalidPaymentTokenMint
        );
        require!(
            seller_token_account.mint == marketplace.fee_token_mint,
            ErrorCode::InvalidPaymentTokenMint
        );
        require!(
            marketplace_fee_account.mint == marketplace.fee_token_mint,
            ErrorCode::InvalidFeeTokenAccount
        );
        require!(
            seller_nft_account.mint == property.nft_mint,
            ErrorCode::InvalidNFTTokenAccount
        );
        require!(
            buyer_nft_account.mint == property.nft_mint,
            ErrorCode::InvalidNFTTokenAccount
        );
        require!(
            seller_nft_account.amount == 1,
            ErrorCode::NotNFTOwner
        );

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

        marketplace.total_fees = marketplace
            .total_fees
            .checked_add(fee_amount)
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
#[instruction(marketplace_fee: u64, fee_token_mint: Pubkey)]
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
    bathrooms: u8,
    name: String,
    symbol: String,
    category: String
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
    /// CHECK: Validated in instruction logic
    #[account(mut)]
    pub property_nft_mint: UncheckedAccount<'info>,
    /// CHECK: Validated in instruction logic
    #[account(mut)]
    pub owner_nft_account: UncheckedAccount<'info>,
    /// CHECK: Validated by metadata program
    #[account(
        init_if_needed,
        payer = owner,
        space = MAX_METADATA_LEN,
        seeds = [
            b"metadata",
            metadata_program.key().as_ref(),
            property_nft_mint.key().as_ref()
        ],
        bump
    )]
    pub metadata: AccountInfo<'info>,
    pub metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
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
    /// CHECK: Validated in instruction logic
    #[account(mut)]
    pub owner_nft_account: UncheckedAccount<'info>,
    /// CHECK: Validated in instruction logic
    #[account(
        constraint = property.nft_mint == property_nft_mint.key()
    )]
    pub property_nft_mint: UncheckedAccount<'info>,
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
pub struct WithdrawFees<'info> {
    #[account(mut)]
    pub marketplace: Account<'info, Marketplace>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Validated in instruction logic
    #[account(mut)]
    pub fee_account: UncheckedAccount<'info>,
    /// CHECK: Validated in instruction logic
    #[account(mut)]
    pub authority_token_account: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
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
    /// CHECK: Validated in instruction logic
    #[account(mut)]
    pub buyer_token_account: UncheckedAccount<'info>,
    /// CHECK: Validated in instruction logic
    #[account(mut)]
    pub seller_token_account: UncheckedAccount<'info>,
    /// CHECK: Validated in instruction logic
    #[account(mut)]
    pub marketplace_fee_account: UncheckedAccount<'info>,
    /// CHECK: Validated in instruction logic
    #[account(mut)]
    pub seller_nft_account: UncheckedAccount<'info>,
    /// CHECK: Validated in instruction logic
    #[account(mut)]
    pub buyer_nft_account: UncheckedAccount<'info>,
    /// CHECK: Validated in instruction logic
    #[account(
        constraint = property.nft_mint == property_nft_mint.key()
    )]
    pub property_nft_mint: UncheckedAccount<'info>,
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
    pub fee_token_mint: Pubkey,
    pub total_fees: u64,
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
    pub category: String,
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
pub struct MarketplaceInitialized {
    pub marketplace: Pubkey,
    pub authority: Pubkey,
    pub fee_percentage: u64,
    pub fee_token_mint: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PropertyListed {
    pub property: Pubkey,
    pub owner: Pubkey,
    pub property_id: String,
    pub price: u64,
    pub nft_mint: Pubkey,
    pub category: String,
    pub timestamp: i64,
}

#[event]
pub struct PropertyUpdated {
    pub property: Pubkey,
    pub owner: Pubkey,
    pub price: u64,
    pub is_active: bool,
    pub category: String,
    pub timestamp: i64,
}

#[event]
pub struct OfferCreated {
    pub offer: Pubkey,
    pub property: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub expiration_time: i64,
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
pub struct OfferExpired {
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

#[event]
pub struct FeesWithdrawn {
    pub marketplace: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Property ID exceeds maximum length of 64 bytes")]
    PropertyIdTooLong,
    #[msg("Metadata URI exceeds maximum length of 200 bytes")]
    MetadataUriTooLong,
    #[msg("Location exceeds maximum length of 50 bytes")]
    LocationTooLong,
    #[msg("Category exceeds maximum length of 32 bytes")]
    CategoryTooLong,
    #[msg("Price must be greater than zero")]
    InvalidPrice,
    #[msg("Offer amount must be greater than zero")]
    InvalidOfferAmount,
    #[msg("Expiration time must be in the future")]
    InvalidExpirationTime,
    #[msg("Caller is not the property owner")]
    NotPropertyOwner,
    #[msg("Property is not active for transactions")]
    PropertyNotActive,
    #[msg("Cannot make an offer on your own property")]
    CannotOfferOwnProperty,
    #[msg("Offer is not in pending state")]
    OfferNotPending,
    #[msg("Offer has expired and cannot be processed")]
    OfferExpired,
    #[msg("Offer has not been accepted")]
    OfferNotAccepted,
    #[msg("Offer does not match the specified property")]
    OfferPropertyMismatch,
    #[msg("Caller is not the offer buyer")]
    NotOfferBuyer,
    #[msg("Token account mint does not match expected mint")]
    InvalidTokenAccountMint,
    #[msg("Token account owner does not match expected owner")]
    InvalidTokenAccountOwner,
    #[msg("Marketplace fee percentage must be between 0 and 10000")]
    InvalidFeePercentage,
    #[msg("Caller does not own the NFT")]
    NotNFTOwner,
    #[msg("Arithmetic operation resulted in overflow")]
    ArithmeticOverflow,
    #[msg("Unauthorized attempt to withdraw marketplace fees")]
    UnauthorizedFeeWithdrawal,
    #[msg("Insufficient fee balance for withdrawal")]
    InsufficientFeeBalance,
    #[msg("Invalid fee token account mint")]
    InvalidFeeTokenAccount,
    #[msg("Invalid payment token mint")]
    InvalidPaymentTokenMint,
    #[msg("Invalid NFT token account mint")]
    InvalidNFTTokenAccount,
}