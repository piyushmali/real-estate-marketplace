use serde::{Deserialize, Serialize};
use diesel::prelude::*;
use crate::schema::{properties, offers};

#[derive(Serialize, Deserialize, Queryable)]
#[diesel(table_name = properties)]
pub struct Property {
    pub id: i32,
    pub property_id: String,
    pub owner_pubkey: String,
    pub price: i64,
    pub metadata_uri: String,
    pub location: String,
    pub square_feet: i64,
    pub bedrooms: i16,
    pub bathrooms: i16,
    pub is_active: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub nft_mint: String,
}

#[derive(Serialize, Deserialize, Insertable)]
#[diesel(table_name = properties)]
pub struct NewProperty {
    pub property_id: String,
    pub owner_pubkey: String,
    pub price: i64,
    pub metadata_uri: String,
    pub location: String,
    pub square_feet: i64,
    pub bedrooms: i16,
    pub bathrooms: i16,
    pub nft_mint: String,
}

#[derive(Serialize, Deserialize, Queryable)]
#[diesel(table_name = offers)]
pub struct Offer {
    pub id: i32,
    pub property_id: String,
    pub buyer_pubkey: String,
    pub amount: i64,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub expiration_time: i64,
}

#[derive(Serialize, Deserialize, Insertable)]
#[diesel(table_name = offers)]
pub struct NewOffer {
    pub property_id: String,
    pub buyer_pubkey: String,
    pub amount: i64,
    pub expiration_time: i64,
}

#[derive(Deserialize)]
pub struct OfferResponse {
    pub offer_id: i32,
    pub accept: bool,
}

#[derive(Deserialize)]
pub struct SaleRequest {
    pub property_id: String,
    pub offer_id: i32,
}