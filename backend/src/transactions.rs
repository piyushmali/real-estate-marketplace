use actix_web::{web, HttpResponse, HttpRequest};
use anchor_client::{Client, Cluster};
use serde::{Deserialize, Serialize};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{Keypair, Signer};
use solana_sdk::transaction::Transaction;
use solana_sdk::instruction::{Instruction, AccountMeta};
use std::str::FromStr;
use std::rc::Rc;
use chrono::Utc;
use diesel::prelude::*;
use uuid::Uuid;
use base64::{engine::general_purpose, Engine as _};
use bincode;
use thiserror::Error;

use crate::auth;
use crate::db;
use crate::models::Property;
use crate::schema::properties;

#[derive(Deserialize, Serialize)]
pub struct ListPropertyRequest {
    property_id: String,
    price: u64,
    metadata_uri: String,
    location: String,
    square_feet: u64,
    bedrooms: u8,
    bathrooms: u8,
}

#[derive(Serialize)]
pub struct PreparedTransaction {
    serialized_transaction: String,
    transaction_type: String,
    metadata: String,
}

#[derive(Deserialize)]
pub struct SubmitTransactionRequest {
    signature: String,
    serialized_transaction: String,
    metadata: String,
}

// Custom error type to handle multiple error sources
#[derive(Error, Debug)]
enum TransactionError {
    #[error("Solana RPC error: {0}")]
    Solana(#[from] solana_client::client_error::ClientError),
    #[error("Serialization error: {0}")]
    Bincode(#[from] bincode::Error),
}

pub async fn prepare_list_property(
    req: HttpRequest,
    data: web::Json<ListPropertyRequest>,
) -> impl actix_web::Responder {
    let wallet_address = match auth::verify_token(&req) {
        Ok(wallet) => wallet,
        Err(resp) => return resp,
    };

    let owner = match Pubkey::from_str(&wallet_address) {
        Ok(pubkey) => pubkey,
        Err(_) => return HttpResponse::BadRequest().body("Invalid wallet address"),
    };

    let payer = Rc::new(Keypair::new());
    let client = Client::new(Cluster::Devnet, payer.clone());
    let program_id = Pubkey::from_str("DDnkLJvWSt2FufL76mrE6jmXKNk8wiRnmrLGasCrNocn").unwrap();

    let (marketplace_pda, _) = Pubkey::find_program_address(
        &[b"marketplace", owner.as_ref()],
        &program_id,
    );

    let (property_pda, _) = Pubkey::find_program_address(
        &[b"property", marketplace_pda.as_ref(), data.property_id.as_bytes()],
        &program_id,
    );

    let property_nft_mint = Keypair::new().pubkey();
    let owner_nft_account = Pubkey::find_program_address(
        &[owner.as_ref(), property_nft_mint.as_ref()],
        &Pubkey::from_str("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL").unwrap(),
    ).0;

    let discriminator = [254, 101, 42, 174, 220, 160, 42, 82];
    let mut instruction_data = Vec::new();
    instruction_data.extend_from_slice(&discriminator);
    instruction_data.extend_from_slice(data.property_id.as_bytes());
    instruction_data.push(0);
    instruction_data.extend_from_slice(&data.price.to_le_bytes());
    instruction_data.extend_from_slice(data.metadata_uri.as_bytes());
    instruction_data.push(0);
    instruction_data.extend_from_slice(data.location.as_bytes());
    instruction_data.push(0);
    instruction_data.extend_from_slice(&data.square_feet.to_le_bytes());
    instruction_data.push(data.bedrooms);
    instruction_data.push(data.bathrooms);

    let instruction = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(marketplace_pda, false),
            AccountMeta::new(property_pda, false),
            AccountMeta::new(owner, true),
            AccountMeta::new(property_nft_mint, false),
            AccountMeta::new(owner_nft_account, false),
            AccountMeta::new_readonly(Pubkey::from_str("11111111111111111111111111111111").unwrap(), false),
            AccountMeta::new_readonly(Pubkey::from_str("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").unwrap(), false),
            AccountMeta::new_readonly(Pubkey::from_str("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL").unwrap(), false),
            AccountMeta::new_readonly(solana_sdk::sysvar::rent::ID, false),
        ],
        data: instruction_data,
    };

    // Offload blocking RPC call to a separate thread
    let serialized_tx = match web::block(move || {
        let rpc_client = solana_client::rpc_client::RpcClient::new("https://api.devnet.solana.com".to_string());
        let latest_blockhash = rpc_client.get_latest_blockhash()?;
        let tx = Transaction::new_unsigned(solana_sdk::message::Message::new_with_blockhash(
            &[instruction],
            Some(&owner),
            &latest_blockhash,
        ));
        let bytes = bincode::serialize(&tx)?; // This now works with TransactionError
        Ok::<String, TransactionError>(general_purpose::STANDARD.encode(bytes))
    }).await {
        Ok(Ok(serialized)) => serialized,
        Ok(Err(e)) => return HttpResponse::InternalServerError().body(format!("Failed to prepare transaction: {}", e)),
        Err(e) => return HttpResponse::InternalServerError().body(format!("Thread pool error: {}", e)),
    };

    let metadata = serde_json::to_string(&data.0).unwrap();

    HttpResponse::Ok().json(PreparedTransaction {
        serialized_transaction: serialized_tx,
        transaction_type: "list_property".to_string(),
        metadata,
    })
}

pub async fn submit_transaction(
    req: HttpRequest,
    data: web::Json<SubmitTransactionRequest>,
) -> impl actix_web::Responder {
    let wallet_address = match auth::verify_token(&req) {
        Ok(wallet) => wallet,
        Err(resp) => return resp,
    };

    let _owner = match Pubkey::from_str(&wallet_address) {
        Ok(pubkey) => pubkey,
        Err(_) => return HttpResponse::BadRequest().body("Invalid wallet address"),
    };

    let tx_bytes = match general_purpose::STANDARD.decode(&data.serialized_transaction) {
        Ok(bytes) => bytes,
        Err(_) => return HttpResponse::BadRequest().body("Invalid serialized transaction"),
    };

    let mut tx = match bincode::deserialize::<Transaction>(&tx_bytes) {
        Ok(transaction) => transaction,
        Err(e) => return HttpResponse::BadRequest().body(format!("Failed to deserialize transaction: {}", e)),
    };

    // Offload blocking RPC call to a separate thread
    let signature = match web::block(move || {
        let rpc_client = solana_client::rpc_client::RpcClient::new("https://api.devnet.solana.com".to_string());
        let latest_blockhash = rpc_client.get_latest_blockhash()?;
        tx.message.recent_blockhash = latest_blockhash;
        let sig = rpc_client.send_and_confirm_transaction(&tx)?;
        Ok::<solana_sdk::signature::Signature, TransactionError>(sig)
    }).await {
        Ok(Ok(sig)) => sig,
        Ok(Err(e)) => return HttpResponse::InternalServerError().body(format!("Transaction failed: {}", e)),
        Err(e) => return HttpResponse::InternalServerError().body(format!("Thread pool error: {}", e)),
    };

    let metadata: ListPropertyRequest = match serde_json::from_str(&data.metadata) {
        Ok(meta) => meta,
        Err(e) => return HttpResponse::BadRequest().body(format!("Failed to parse metadata: {}", e)),
    };

    let conn = &mut db::establish_connection();
    let now = Utc::now().naive_utc();
    let new_property = Property {
        id: Uuid::new_v4(),
        property_id: metadata.property_id,
        owner_wallet: wallet_address,
        price: metadata.price as i64,
        metadata_uri: metadata.metadata_uri,
        location: metadata.location,
        square_feet: metadata.square_feet as i64,
        bedrooms: metadata.bedrooms as i16,
        bathrooms: metadata.bathrooms as i16,
        is_active: true,
        created_at: now,
        updated_at: now,
    };

    if let Err(e) = diesel::insert_into(properties::table)
        .values(&new_property)
        .execute(conn)
    {
        return HttpResponse::InternalServerError().body(format!("Failed to store property: {}", e));
    }

    HttpResponse::Ok().json(serde_json::json!({"signature": signature.to_string()}))
}