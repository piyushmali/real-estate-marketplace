use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Queryable, Insertable, Serialize, Deserialize)]
#[diesel(table_name = crate::schema::users)]
pub struct User {
    pub id: Uuid,
    pub wallet_address: String,
    pub jwt_token: Option<String>,
}

#[derive(Queryable, Insertable, Serialize, Deserialize)]
#[diesel(table_name = crate::schema::properties)]
pub struct Property {
    pub id: Uuid,
    pub property_id: String,
    pub owner_wallet: String,
    pub price: i64,
    pub metadata_uri: String,
    pub location: String,
    pub square_feet: i64,
    pub bedrooms: i16,
    pub bathrooms: i16,
    pub is_active: bool,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(Queryable, Insertable, Serialize, Deserialize)]
#[diesel(table_name = crate::schema::offers)]
pub struct Offer {
    pub id: Uuid,
    pub property_id: String,
    pub buyer_wallet: String,
    pub amount: i64,
    pub status: String,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    pub expiration_time: chrono::NaiveDateTime,
}

#[derive(Queryable, Insertable, Serialize, Deserialize)]
#[diesel(table_name = crate::schema::transactions)]
pub struct Transaction {
    pub id: Uuid,
    pub property_id: String,
    pub seller_wallet: String,
    pub buyer_wallet: String,
    pub price: i64,
    pub timestamp: chrono::NaiveDateTime,
}