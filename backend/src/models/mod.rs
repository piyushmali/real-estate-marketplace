use serde::{Deserialize, Serialize};
use diesel::prelude::*;

#[derive(Debug, Serialize, Deserialize, Insertable, Clone)]
#[diesel(table_name = crate::schema::properties)]
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

#[derive(Debug, Serialize, Deserialize, Queryable)]
#[diesel(table_name = crate::schema::properties)]
pub struct Property {
    pub id: i32,              // Int4
    pub property_id: String,  // Varchar
    pub owner_pubkey: String, // Varchar
    pub price: i64,           // Int8
    pub metadata_uri: String, // Varchar
    pub location: String,     // Varchar
    pub square_feet: i64,     // Int8
    pub bedrooms: i16,        // Int2
    pub bathrooms: i16,       // Int2
    pub is_active: bool,      // Bool
    pub created_at: i64,      // Int8
    pub updated_at: i64,      // Int8
    pub nft_mint: String,     // Varchar
}

#[derive(Debug, Serialize, Deserialize, Insertable, Clone)]
#[diesel(table_name = crate::schema::offers)]
pub struct NewOffer {
    pub property_id: String,
    pub buyer_pubkey: String,
    pub amount: i64,
    pub expiration_time: i64,
}

#[derive(Debug, Serialize, Deserialize, Queryable)]
#[diesel(table_name = crate::schema::offers)]
pub struct Offer {
    pub id: i32,             // Int4
    pub property_id: String, // Varchar
    pub buyer_pubkey: String,// Varchar
    pub amount: i64,         // Int8
    pub status: String,      // Varchar
    pub created_at: i64,     // Int8
    pub updated_at: i64,     // Int8
    pub expiration_time: i64,// Int8
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OfferResponse {
    pub offer_id: i32,
    pub accept: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaleRequest {
    pub property_id: String,
    pub offer_id: i32,
}