#![allow(unused_imports)]
#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Transfer};
use std::mem::size_of;

declare_id!("EcPni58apii69R7PstXNThzv44dTYdprEV1HzkjT3DbE");

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
        msg!("Starting ListProperty");
        
        // Strictly validate string lengths
        require!(property_id.len() <= 32, ErrorCode::PropertyIdTooLong);
        require!(metadata_uri.len() <= 100, ErrorCode::MetadataUriTooLong); // Reduced from 200
        require!(location.len() <= 50, ErrorCode::LocationTooLong);         // Reduced from 100
        require!(price > 0, ErrorCode::InvalidPrice);
    
        let marketplace = &mut ctx.accounts.marketplace;
        let property = &mut ctx.accounts.property;
        let clock = Clock::get()?;
    
        msg!("Initializing property account");
        property.owner = ctx.accounts.owner.key();
        property.property_id = property_id.clone();
        property.price = price;
        property.metadata_uri = metadata_uri.clone();
        property.location = location.clone();
        property.square_feet = square_feet;
        property.bedrooms = bedrooms;
        property.bathrooms = bathrooms;
        property.is_active = true;
        property.created_at = clock.unix_timestamp;
        property.updated_at = clock.unix_timestamp;
        property.transaction_count = 0;
        property.marketplace = marketplace.key();
    
        msg!("Updating marketplace properties count");
        marketplace.properties_count = marketplace
            .properties_count
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
    
        emit!(PropertyListed {
            property: property.key(),
            owner: property.owner,
            property_id,
            price: property.price,
            timestamp: clock.unix_timestamp,
        });
    
        msg!("ListProperty completed");
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

        if let Some(new_price) = price {
            require!(new_price > 0, ErrorCode::InvalidPrice);
            property.price = new_price;
        }

        if let Some(new_metadata_uri) = &metadata_uri {
            require!(
                new_metadata_uri.len() <= 200,
                ErrorCode::MetadataUriTooLong
            );
            property.metadata_uri = new_metadata_uri.clone();
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

        // Calculate marketplace fee with checked operations
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

        // Transfer tokens from buyer to seller and marketplace
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

        // Update property ownership and transaction history
        let previous_owner = property.owner;
        property.owner = offer.buyer;
        property.price = offer.amount;
        property.is_active = false; // Deactivate property after sale
        property.updated_at = clock.unix_timestamp;
        property.transaction_count = property
            .transaction_count
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        // Create transaction history
        let transaction_history = &mut ctx.accounts.transaction_history;
        transaction_history.property = property.key();
        transaction_history.seller = previous_owner;
        transaction_history.buyer = offer.buyer;
        transaction_history.price = offer.amount;
        transaction_history.timestamp = clock.unix_timestamp;
        transaction_history.transaction_index = property.transaction_count;

        // Update offer status
        offer.status = OfferStatus::Completed;
        offer.updated_at = clock.unix_timestamp;

        emit!(PropertySold {
            property: property.key(),
            transaction_history: transaction_history.key(),
            previous_owner,
            new_owner: property.owner,
            price: offer.amount,
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
#[instruction(property_id: String, price: u64, metadata_uri: String, location: String, square_feet: u64, bedrooms: u8, bathrooms: u8)]
pub struct ListProperty<'info> {
    #[account(mut)]
    pub marketplace: Account<'info, Marketplace>,
    #[account(
        init,
        payer = owner,
        space = 8 +     // discriminator
               32 +     // marketplace Pubkey
               32 +     // owner Pubkey
               4 + 32 + // property_id String (max 32 bytes)
               8 +      // price u64
               4 + 100 + // metadata_uri String (max 100 bytes)
               4 + 50 +  // location String (max 50 bytes)
               8 +      // square_feet u64
               1 +      // bedrooms u8
               1 +      // bathrooms u8
               1 +      // is_active bool
               8 +      // created_at i64
               8 +      // updated_at i64
               8,       // transaction_count u64
        seeds = [b"property", marketplace.key().as_ref(), property_id.as_bytes()],
        bump
    )]
    pub property: Account<'info, Property>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
#[derive(Accounts)]
pub struct UpdateProperty<'info> {
    #[account(
        mut,
        constraint = property.owner == owner.key() @ ErrorCode::NotPropertyOwner
    )]
    pub property: Account<'info, Property>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct MakeOffer<'info> {
    #[account(
        constraint = property.is_active @ ErrorCode::PropertyNotActive,
        constraint = property.owner != buyer.key() @ ErrorCode::CannotOfferOwnProperty
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
        constraint = property.owner == owner.key() @ ErrorCode::NotPropertyOwner
    )]
    pub property: Account<'info, Property>,
    #[account(
        mut,
        constraint = offer.property == property.key() @ ErrorCode::OfferPropertyMismatch
    )]
    pub offer: Account<'info, Offer>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteSale<'info> {
    #[account(mut)]
    pub marketplace: Account<'info, Marketplace>,
    #[account(
        mut,
        constraint = property.is_active @ ErrorCode::PropertyNotActive
    )]
    pub property: Account<'info, Property>,
    #[account(
        mut,
        constraint = offer.property == property.key() @ ErrorCode::OfferPropertyMismatch,
        constraint = offer.status == OfferStatus::Accepted @ ErrorCode::OfferNotAccepted,
        constraint = offer.buyer == buyer.key() @ ErrorCode::NotOfferBuyer
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
    /// CHECK: This is the property owner who will receive the payment, validated by constraint
    #[account(
        constraint = property.owner == seller.key() @ ErrorCode::NotPropertyOwner
    )]
    pub seller: AccountInfo<'info>,
    /// CHECK: This is the buyer's token account, validated by token program transfer
    #[account(mut)]
    pub buyer_token_account: AccountInfo<'info>,
    /// CHECK: This is the seller's token account, validated by token program transfer
    #[account(mut)]
    pub seller_token_account: AccountInfo<'info>,
    /// CHECK: This is the marketplace fee account, validated by token program transfer
    #[account(mut)]
    pub marketplace_fee_account: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
pub struct Marketplace {
    pub authority: Pubkey,
    pub properties_count: u64,
    pub fee_percentage: u64, // Basis points (100 = 1%)
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
}