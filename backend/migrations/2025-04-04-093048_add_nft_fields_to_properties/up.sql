-- Your SQL goes here
-- Add NFT fields to properties table
ALTER TABLE properties 
ADD COLUMN nft_mint_address VARCHAR NOT NULL DEFAULT '',
ADD COLUMN nft_token_account VARCHAR NOT NULL DEFAULT '';