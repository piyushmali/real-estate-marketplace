use actix_web::{web, HttpRequest, HttpResponse};
use base64::{engine::general_purpose, Engine};
use bincode;
use chrono::Utc;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, Signature},
    transaction::{Transaction, VersionedTransaction},
    hash::Hash,
    message::Message,
    instruction::Instruction,
    signer::Signer,
};
use std::str::FromStr;
use uuid::Uuid;
use anyhow::Result;
use tracing::{info, error};

use crate::auth;
use crate::db;
use crate::models::Property;
use crate::schema::properties;

#[derive(Debug, Deserialize)]
pub struct SubmitTransactionRequest {
    pub serialized_transaction: String,
    pub metadata: String,
}

#[derive(Debug, Deserialize)]
pub struct SubmitInstructionsRequest {
    pub instructions: Vec<SerializedInstruction>,
    pub signers: Vec<String>,
    pub metadata: String,
}

#[derive(Debug, Deserialize)]
pub struct SerializedInstruction {
    pub program_id: String,
    pub accounts: Vec<SerializedAccountMeta>,
    pub data: String,
}

#[derive(Debug, Deserialize)]
pub struct SerializedAccountMeta {
    pub pubkey: String,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(Debug, Deserialize)]
pub struct ListPropertyRequest {
    pub property_id: String,
    pub price: u64,
    pub metadata_uri: String,
    pub location: String,
    pub square_feet: u64,
    pub bedrooms: u8,
    pub bathrooms: u8,
}

#[derive(Debug, Serialize)]
pub struct TransactionResponse {
    pub signature: String,
}

#[derive(Debug, Serialize)]
pub struct BlockhashResponse {
    pub blockhash: String,
}

#[derive(Debug, thiserror::Error)]
pub enum TransactionError {
    #[error("RPC error: {0}")]
    RpcError(#[from] solana_client::client_error::ClientError),
    #[error("Serialization error: {0}")]
    SerializationError(#[from] bincode::Error),
    #[error("Database error: {0}")]
    DatabaseError(#[from] diesel::result::Error),
    #[error("Invalid wallet address: {0}")]
    InvalidWallet(String),
    #[error("Failed to decode transaction: {0}")]
    DecodeError(String),
    #[error("Transaction execution failed: {0}")]
    ExecutionError(String),
    #[error("Invalid public key: {0}")]
    InvalidPublicKey(String),
}

pub async fn verify_token(req: &HttpRequest) -> Result<String, HttpResponse> {
    // Extract the authorization header
    let auth_header = match req.headers().get("Authorization") {
        Some(header) => header,
        None => return Err(HttpResponse::Unauthorized().body("No authorization header")),
    };

    // Extract the token from the header
    let auth_str = match auth_header.to_str() {
        Ok(s) => s,
        Err(_) => return Err(HttpResponse::Unauthorized().body("Invalid authorization header")),
    };

    // Check if the header is a bearer token
    if !auth_str.starts_with("Bearer ") {
        return Err(HttpResponse::Unauthorized().body("Invalid token format"));
    }

    // Extract the JWT
    let token = &auth_str[7..];
    
    // Verify and extract wallet address from JWT
    let jwt_secret = std::env::var("JWT_SECRET").expect("JWT_SECRET must be set");
    let validation = jsonwebtoken::Validation::default();
    let token_data = match jsonwebtoken::decode::<auth::Claims>(
        token,
        &jsonwebtoken::DecodingKey::from_secret(jwt_secret.as_bytes()),
        &validation,
    ) {
        Ok(data) => data,
        Err(e) => return Err(HttpResponse::Unauthorized().body(format!("Invalid token: {}", e))),
    };

    Ok(token_data.claims.sub)
}

// New endpoint to get a recent blockhash
pub async fn get_recent_blockhash(req: HttpRequest) -> HttpResponse {
    // Verify authentication token
    let _wallet_address = match verify_token(&req).await {
        Ok(wallet) => wallet,
        Err(resp) => return resp,
    };

    // Get recent blockhash from Solana
    let blockhash = match web::block(move || {
        let rpc_client = RpcClient::new("https://api.devnet.solana.com".to_string());
        let blockhash = rpc_client.get_latest_blockhash()?;
        Ok::<Hash, solana_client::client_error::ClientError>(blockhash)
    }).await {
        Ok(Ok(hash)) => hash,
        Ok(Err(e)) => return HttpResponse::InternalServerError().body(format!("Failed to get blockhash: {}", e)),
        Err(e) => return HttpResponse::InternalServerError().body(format!("Thread pool error: {}", e)),
    };

    HttpResponse::Ok().json(BlockhashResponse {
        blockhash: blockhash.to_string(),
    })
}

pub async fn submit_transaction(
    req: HttpRequest,
    data: web::Json<SubmitTransactionRequest>,
) -> HttpResponse {
    // Verify authentication token
    let wallet_address = match verify_token(&req).await {
        Ok(wallet) => wallet,
        Err(resp) => return resp,
    };

    let _owner = match Pubkey::from_str(&wallet_address) {
        Ok(pubkey) => pubkey,
        Err(_) => return HttpResponse::BadRequest().body("Invalid wallet address"),
    };

    // Decode the base64 serialized transaction
    let tx_bytes = match general_purpose::STANDARD.decode(&data.serialized_transaction) {
        Ok(bytes) => bytes,
        Err(_) => return HttpResponse::BadRequest().body("Invalid serialized transaction"),
    };

    // Deserialize the transaction
    let tx = match bincode::deserialize::<Transaction>(&tx_bytes) {
        Ok(transaction) => transaction,
        Err(e) => return HttpResponse::BadRequest().body(format!("Failed to deserialize transaction: {}", e)),
    };

    // Offload blocking RPC call to a separate thread
    let tx_signature = match web::block(move || {
        let rpc_client = RpcClient::new("https://api.devnet.solana.com".to_string());
        let signature = rpc_client.send_and_confirm_transaction(&tx)?;
        Ok::<Signature, TransactionError>(signature)
    }).await {
        Ok(Ok(sig)) => sig,
        Ok(Err(e)) => return HttpResponse::InternalServerError().body(format!("Transaction failed: {}", e)),
        Err(e) => return HttpResponse::InternalServerError().body(format!("Thread pool error: {}", e)),
    };

    // Parse the property metadata
    let metadata: ListPropertyRequest = match serde_json::from_str(&data.metadata) {
        Ok(meta) => meta,
        Err(e) => return HttpResponse::BadRequest().body(format!("Failed to parse metadata: {}", e)),
    };

    // Store property in database
    let mut conn = match db::establish_connection() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to database: {}", e);
            return HttpResponse::InternalServerError().body("Database connection failed");
        }
    };
    
    let now = Utc::now().naive_utc();
    let new_property = Property {
        id: Uuid::new_v4(),
        property_id: metadata.property_id.clone(),
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

    match diesel::insert_into(properties::table)
        .values(&new_property)
        .execute(&mut conn)
    {
        Ok(_) => {
            info!("Property {} successfully added to database", metadata.property_id);
            HttpResponse::Ok().json(TransactionResponse {
                signature: tx_signature.to_string(),
            })
        }
        Err(e) => {
            error!("Failed to insert property into database: {}", e);
            HttpResponse::InternalServerError().body(format!("Database error: {}", e))
        }
    }
}

// New endpoint to submit transaction instructions
pub async fn submit_instructions(
    req: HttpRequest,
    data: web::Json<SubmitInstructionsRequest>,
) -> HttpResponse {
    // Verify authentication token
    let wallet_address = match verify_token(&req).await {
        Ok(wallet) => wallet,
        Err(resp) => return resp,
    };

    let owner_pubkey = match Pubkey::from_str(&wallet_address) {
        Ok(pubkey) => pubkey,
        Err(_) => return HttpResponse::BadRequest().body("Invalid wallet address"),
    };

    // Parse instructions
    let mut instructions = Vec::new();
    for serialized_instruction in &data.instructions {
        let program_id = match Pubkey::from_str(&serialized_instruction.program_id) {
            Ok(pubkey) => pubkey,
            Err(_) => return HttpResponse::BadRequest().body(format!("Invalid program ID: {}", serialized_instruction.program_id)),
        };

        let mut accounts = Vec::new();
        for account_meta in &serialized_instruction.accounts {
            let pubkey = match Pubkey::from_str(&account_meta.pubkey) {
                Ok(pubkey) => pubkey,
                Err(_) => return HttpResponse::BadRequest().body(format!("Invalid account pubkey: {}", account_meta.pubkey)),
            };

            accounts.push(solana_sdk::instruction::AccountMeta {
                pubkey,
                is_signer: account_meta.is_signer,
                is_writable: account_meta.is_writable,
            });
        }

        let instruction_data = match general_purpose::STANDARD.decode(&serialized_instruction.data) {
            Ok(data) => data,
            Err(_) => return HttpResponse::BadRequest().body(format!("Invalid instruction data")),
        };

        instructions.push(Instruction {
            program_id,
            accounts,
            data: instruction_data,
        });
    }

    // Create keypair for the primary signer
    // In a real implementation, you might load this from secure storage
    // For now, we're generating a random one for testing
    let primary_signer = Keypair::new();

    // Build and send the transaction
    let tx_signature = match web::block(move || {
        let rpc_client = RpcClient::new("https://api.devnet.solana.com".to_string());
        
        // Get a fresh blockhash
        let blockhash = rpc_client.get_latest_blockhash()?;
        
        // Create a transaction from the instructions
        let message = Message::new_with_blockhash(
            &instructions,
            Some(&owner_pubkey),
            &blockhash,
        );
        
        // Vec<&dyn Signer> is the correct type for Transaction::new
        let signers = vec![&primary_signer as &dyn Signer];
        let transaction = Transaction::new(&signers, message, blockhash);
        
        // Send and confirm the transaction
        let signature = rpc_client.send_and_confirm_transaction(&transaction)?;
        Ok::<Signature, TransactionError>(signature)
    }).await {
        Ok(Ok(sig)) => sig,
        Ok(Err(e)) => return HttpResponse::InternalServerError().body(format!("Transaction failed: {}", e)),
        Err(e) => return HttpResponse::InternalServerError().body(format!("Thread pool error: {}", e)),
    };

    // Parse the property metadata
    let metadata: ListPropertyRequest = match serde_json::from_str(&data.metadata) {
        Ok(meta) => meta,
        Err(e) => return HttpResponse::BadRequest().body(format!("Failed to parse metadata: {}", e)),
    };

    // Store property in database
    let mut conn = match db::establish_connection() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to database: {}", e);
            return HttpResponse::InternalServerError().body("Database connection failed");
        }
    };
    
    let now = Utc::now().naive_utc();
    let new_property = Property {
        id: Uuid::new_v4(),
        property_id: metadata.property_id.clone(),
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

    match diesel::insert_into(properties::table)
        .values(&new_property)
        .execute(&mut conn)
    {
        Ok(_) => {
            info!("Property {} successfully added to database", metadata.property_id);
            HttpResponse::Ok().json(TransactionResponse {
                signature: tx_signature.to_string(),
            })
        }
        Err(e) => {
            error!("Failed to insert property into database: {}", e);
            HttpResponse::InternalServerError().body(format!("Database error: {}", e))
        }
    }
} 