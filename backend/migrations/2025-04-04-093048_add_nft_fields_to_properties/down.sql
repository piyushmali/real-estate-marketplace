-- This file should undo anything in `up.sql`
-- Remove NFT fields from properties table
ALTER TABLE properties 
DROP COLUMN nft_mint_address,
DROP COLUMN nft_token_account;