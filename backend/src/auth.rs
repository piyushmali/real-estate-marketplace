use chrono::{Duration, Utc};
use diesel::prelude::*;
use jsonwebtoken::{encode, EncodingKey, Header, decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Signature;
use std::env;
use std::str::FromStr;
use uuid::Uuid;
use actix_web::{HttpRequest, HttpResponse};

use crate::db;
use crate::models::User;
use crate::schema::users;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // Wallet address
    pub exp: usize,  // Expiration time
}

pub fn generate_jwt(wallet_address: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let secret = env::var("JWT_SECRET").expect("JWT_SECRET must be set");
    let expiration = Utc::now()
        .checked_add_signed(Duration::hours(24))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: wallet_address.to_string(),
        exp: expiration,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )
}

pub fn verify_wallet_signature(wallet_address: &str, signature: &str, message: &str) -> bool {
    let pubkey = match Pubkey::from_str(wallet_address) {
        Ok(pubkey) => pubkey,
        Err(_) => return false,
    };

    let signature_bytes = match bs58::decode(signature).into_vec() {
        Ok(bytes) => bytes,
        Err(_) => return false,
    };

    let signature_array: [u8; 64] = match signature_bytes.try_into() {
        Ok(array) => array,
        Err(_) => return false,
    };

    let signature = Signature::from(signature_array);

    signature.verify(&pubkey.to_bytes(), message.as_bytes())
}

pub fn store_user_jwt(wallet_address: &str, jwt: &str) -> Result<(), diesel::result::Error> {
    let conn = &mut db::establish_connection();
    let new_user = User {
        id: Uuid::new_v4(),
        wallet_address: wallet_address.to_string(),
        jwt_token: Some(jwt.to_string()),
    };

    diesel::insert_into(users::table)
        .values(&new_user)
        .on_conflict(users::wallet_address)
        .do_update()
        .set(users::jwt_token.eq(jwt))
        .execute(conn)?;
    Ok(())
}

pub fn verify_token(req: &HttpRequest) -> Result<String, HttpResponse> {
    let auth_header = req.headers().get("Authorization");
    if let Some(header) = auth_header {
        let token = header.to_str().unwrap_or("").replace("Bearer ", "");
        let secret = env::var("JWT_SECRET").expect("JWT_SECRET must be set");
        match decode::<Claims>(
            &token,
            &DecodingKey::from_secret(secret.as_ref()),
            &Validation::default(),
        ) {
            Ok(token_data) => Ok(token_data.claims.sub),
            Err(_) => Err(HttpResponse::Unauthorized().body("Invalid token")),
        }
    } else {
        Err(HttpResponse::Unauthorized().body("Missing Authorization header"))
    }
}