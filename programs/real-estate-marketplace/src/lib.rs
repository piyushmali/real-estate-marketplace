#![allow(unused_imports)]
#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, MintTo, Transfer, Mint, TokenAccount, Token},
};
use std::mem::size_of;

declare_id!("E7v7RResymJU5XvvPA9uwxGSEEsdSE6XvaP7BTV2GGoQ");

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

        // Mint NFT for the property
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

        msg!("DEBUG: Starting update_property for property ID: {}", property.property_id);
        msg!("DEBUG: Current property owner: {}", property.owner.to_string());
        msg!("DEBUG: Transaction signer: {}", ctx.accounts.owner.key().to_string());
        msg!("DEBUG: NFT mint from property: {}", property.nft_mint.to_string());
        msg!("DEBUG: NFT mint from transaction: {}", ctx.accounts.property_nft_mint.key().to_string());
        msg!("DEBUG: Token account provided: {}", ctx.accounts.owner_nft_account.key().to_string());

        // Log ownership constraint check
        if property.owner != ctx.accounts.owner.key() {
            msg!("ERROR: Property owner mismatch!");
            msg!("DEBUG: Property owner: {}", property.owner.to_string());
            msg!("DEBUG: Signer: {}", ctx.accounts.owner.key().to_string());
            return Err(ErrorCode::NotPropertyOwner.into());
        }
        msg!("DEBUG: Owner check passed");

        // Log NFT mint constraint check
        if property.nft_mint != ctx.accounts.property_nft_mint.key() {
            msg!("ERROR: NFT mint mismatch!");
            msg!("DEBUG: Property NFT mint: {}", property.nft_mint.to_string());
            msg!("DEBUG: Transaction NFT mint: {}", ctx.accounts.property_nft_mint.key().to_string());
            return Err(ErrorCode::InvalidNFTMint.into());
        }
        msg!("DEBUG: NFT mint check passed");

        // Deserialize the token account to check ownership
        msg!("DEBUG: Attempting to deserialize token account");
        let owner_nft_account = match TokenAccount::try_deserialize(&mut &ctx.accounts.owner_nft_account.data.borrow()[..]) {
            Ok(account) => account,
            Err(err) => {
                msg!("ERROR: Failed to deserialize token account: {:?}", err);
                return Err(ErrorCode::InvalidTokenAccount.into());
            }
        };
        
        msg!("DEBUG: Token account deserialized successfully");
        msg!("DEBUG: Token account owner: {}", owner_nft_account.owner.to_string());
        msg!("DEBUG: Token account mint: {}", owner_nft_account.mint.to_string());
        msg!("DEBUG: Token account amount: {}", owner_nft_account.amount);

        // Modified the check to use >= instead of == to allow multiple tokens
        if owner_nft_account.amount < 1 {
            msg!("ERROR: Token account has insufficient tokens");
            msg!("DEBUG: Token amount: {}", owner_nft_account.amount);
            return Err(ErrorCode::NotNFTOwner.into());
        }
        msg!("DEBUG: Token amount check passed");

        if let Some(new_price) = price {
            require!(new_price > 0, ErrorCode::InvalidPrice);
            property.price = new_price;
            msg!("DEBUG: Updated price to: {}", new_price);
        }

        if let Some(new_metadata_uri) = metadata_uri {
            require!(
                new_metadata_uri.len() <= 200,
                ErrorCode::MetadataUriTooLong
            );
            property.metadata_uri = new_metadata_uri.clone();
            msg!("DEBUG: Updated metadata_uri to: {}", new_metadata_uri);
        }

        if let Some(new_is_active) = is_active {
            property.is_active = new_is_active;
            msg!("DEBUG: Updated is_active to: {}", new_is_active);
        }

        property.updated_at = clock.unix_timestamp;
        msg!("DEBUG: Property updated successfully");

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
        let escrow = &mut ctx.accounts.escrow_account;
        let clock = Clock::get()?;

        require!(property.is_active, ErrorCode::PropertyNotActive);
        require!(offer_amount > 0, ErrorCode::InvalidOfferAmount);
        require!(
            expiration_time > clock.unix_timestamp,
            ErrorCode::InvalidExpirationTime
        );

        // Transfer SOL from buyer to escrow PDA
        let transfer_instruction = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.buyer.key(),
            &escrow.key(),
            offer_amount,
        );

        anchor_lang::solana_program::program::invoke(
            &transfer_instruction,
            &[
                ctx.accounts.buyer.to_account_info(),
                escrow.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Initialize offer account
        offer.buyer = ctx.accounts.buyer.key();
        offer.property = property.key();
        offer.amount = offer_amount;
        offer.status = OfferStatus::Pending;
        offer.created_at = clock.unix_timestamp;
        offer.updated_at = clock.unix_timestamp;
        offer.expiration_time = expiration_time;
        offer.escrow = escrow.key();

        // Initialize escrow account data
        escrow.buyer = ctx.accounts.buyer.key();
        escrow.property = property.key();
        escrow.amount = offer_amount;
        escrow.created_at = clock.unix_timestamp;
        escrow.is_active = true;

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
        let escrow = &mut ctx.accounts.escrow_account;
        let clock = Clock::get()?;

        require!(
            offer.status == OfferStatus::Pending,
            ErrorCode::OfferNotPending
        );
        
        require!(
            escrow.is_active,
            ErrorCode::EscrowNotActive
        );

        if offer.expiration_time <= clock.unix_timestamp {
            offer.status = OfferStatus::Expired;
            offer.updated_at = clock.unix_timestamp;
            
            // Return funds to buyer if offer expired
            let bump = ctx.bumps.escrow_account;
            let property_key = property.key();
            let buyer_key = offer.buyer;
            let seeds = &[
                b"escrow", 
                property_key.as_ref(), 
                buyer_key.as_ref(),
                &[bump]
            ];
            let signer = &[&seeds[..]];
            
            let transfer_instruction = anchor_lang::solana_program::system_instruction::transfer(
                &escrow.key(),
                &offer.buyer,
                escrow.amount,
            );
            
            anchor_lang::solana_program::program::invoke_signed(
                &transfer_instruction,
                &[
                    escrow.to_account_info(),
                    ctx.accounts.buyer_wallet.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                signer,
            )?;
            
            escrow.is_active = false;
            
            return Err(ErrorCode::OfferExpired.into());
        }

        if accept {
            // Calculate marketplace fee
            let marketplace = &ctx.accounts.marketplace;
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
            
            // Transfer funds from escrow to seller and marketplace
            let bump = ctx.bumps.escrow_account;
            let property_key = property.key();
            let buyer_key = offer.buyer;
            let seeds = &[
                b"escrow", 
                property_key.as_ref(), 
                buyer_key.as_ref(),
                &[bump]
            ];
            let signer = &[&seeds[..]];
            
            // Transfer seller amount
            let transfer_to_seller_instruction = anchor_lang::solana_program::system_instruction::transfer(
                &escrow.key(),
                &ctx.accounts.owner.key(),
                seller_amount,
            );
            
            anchor_lang::solana_program::program::invoke_signed(
                &transfer_to_seller_instruction,
                &[
                    escrow.to_account_info(),
                    ctx.accounts.owner.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                signer,
            )?;
            
            // Transfer marketplace fee
            if fee_amount > 0 {
                let transfer_fee_instruction = anchor_lang::solana_program::system_instruction::transfer(
                    &escrow.key(),
                    &ctx.accounts.marketplace_authority.key(),
                    fee_amount,
                );
                
                anchor_lang::solana_program::program::invoke_signed(
                    &transfer_fee_instruction,
                    &[
                        escrow.to_account_info(),
                        ctx.accounts.marketplace_authority.to_account_info(),
                        ctx.accounts.system_program.to_account_info(),
                    ],
                    signer,
                )?;
            }
            
            // Transfer NFT from seller to buyer
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.seller_nft_account.to_account_info(),
                        to: ctx.accounts.buyer_nft_account.to_account_info(),
                        authority: ctx.accounts.owner.to_account_info(),
                    },
                ),
                1,
            )?;
            
            // Update property owner and status
            let previous_owner = property.owner;
            property.owner = offer.buyer;
            property.price = offer.amount;
            property.is_active = false;
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
            
            offer.status = OfferStatus::Completed;
            escrow.is_active = false;
            
            emit!(PropertySold {
                property: property.key(),
                transaction_history: transaction_history.key(),
                previous_owner,
                new_owner: property.owner,
                price: offer.amount,
                nft_mint: property.nft_mint,
                timestamp: clock.unix_timestamp,
            });
            
            emit!(OfferAccepted {
                offer: offer.key(),
                property: property.key(),
                buyer: offer.buyer,
                seller: previous_owner,
                amount: offer.amount,
                timestamp: clock.unix_timestamp,
            });
        } else {
            offer.status = OfferStatus::Rejected;
            
            // Return funds to buyer
            let bump = ctx.bumps.escrow_account;
            let property_key = property.key();
            let buyer_key = offer.buyer;
            let seeds = &[
                b"escrow", 
                property_key.as_ref(), 
                buyer_key.as_ref(),
                &[bump]
            ];
            let signer = &[&seeds[..]];
            
            let transfer_instruction = anchor_lang::solana_program::system_instruction::transfer(
                &escrow.key(),
                &offer.buyer,
                escrow.amount,
            );
            
            anchor_lang::solana_program::program::invoke_signed(
                &transfer_instruction,
                &[
                    escrow.to_account_info(),
                    ctx.accounts.buyer_wallet.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                signer,
            )?;
            
            escrow.is_active = false;
            
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
        space = 8 + size_of::<Property>() + 
                32 + // property_id max length
                100 + // metadata_uri max length
                50, // location max length
        seeds = [b"property", marketplace.key().as_ref(), property_id.as_bytes()],
        bump
    )]
    pub property: Account<'info, Property>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: This is the NFT mint account, initialized by the token program
    #[account(
        mut,
        constraint = property_nft_mint.owner == &token::ID
    )]
    pub property_nft_mint: AccountInfo<'info>,
    /// CHECK: This is the owner's NFT token account, managed by the associated token program
    #[account(mut)]
    pub owner_nft_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UpdateProperty<'info> {
    #[account(
        mut,
        constraint = property.owner == *owner.key @ ErrorCode::NotPropertyOwner
    )]
    pub property: Account<'info, Property>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: This is the owner's NFT token account
    #[account(
        mut,
        constraint = owner_nft_account.owner == &token::ID @ ErrorCode::InvalidTokenAccount
    )]
    pub owner_nft_account: AccountInfo<'info>,
    /// CHECK: This is the NFT mint account
    #[account(
        constraint = property.nft_mint == *property_nft_mint.key @ ErrorCode::InvalidNFTMint
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
    
    #[account(
        init,
        payer = buyer,
        space = 8 + size_of::<EscrowAccount>(),
        seeds = [b"escrow", property.key().as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct RespondToOffer<'info> {
    #[account(mut)]
    pub marketplace: Account<'info, Marketplace>,
    
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
    
    #[account(
        mut,
        seeds = [b"escrow", property.key().as_ref(), offer.buyer.as_ref()],
        bump,
        constraint = escrow_account.property == property.key()
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    
    /// CHECK: This is the marketplace authority
    #[account(
        mut,
        constraint = marketplace.authority == marketplace_authority.key()
    )]
    pub marketplace_authority: AccountInfo<'info>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    /// CHECK: This is the buyer's wallet
    #[account(
        mut,
        constraint = offer.buyer == *buyer_wallet.key
    )]
    pub buyer_wallet: AccountInfo<'info>,
    
    /// CHECK: This is the seller's NFT token account
    #[account(mut)]
    pub seller_nft_account: AccountInfo<'info>,
    
    /// CHECK: This is the buyer's NFT token account
    #[account(mut)]
    pub buyer_nft_account: AccountInfo<'info>,
    
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + size_of::<TransactionHistory>(),
        seeds = [
            b"transaction",
            property.key().as_ref(),
            &property.transaction_count.checked_add(1).ok_or(ErrorCode::ArithmeticOverflow)?.to_le_bytes()
        ],
        bump
    )]
    pub transaction_history: Account<'info, TransactionHistory>,
    
    pub token_program: Program<'info, Token>,
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
    pub escrow: Pubkey,  // New field to store escrow PDA
}

#[account]
pub struct EscrowAccount {
    pub buyer: Pubkey,
    pub property: Pubkey,
    pub amount: u64,
    pub created_at: i64,
    pub is_active: bool,
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
    #[msg("Escrow account not active")]
    EscrowNotActive,
}