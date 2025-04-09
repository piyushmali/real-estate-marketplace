use actix_web::{web, HttpRequest, HttpResponse, Responder};
use base64::{engine::general_purpose, Engine};
use bincode;
use chrono::Utc;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, Signature},
    transaction::Transaction as SolanaTransaction,
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
    pub nft_mint_address: String,  // New field
    pub nft_token_account: String, // New field 
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

    // Add some debug logging to see what wallet address is being returned
    info!("Token verified for wallet: {}", token_data.claims.sub);
    
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
    let tx = match bincode::deserialize::<SolanaTransaction>(&tx_bytes) {
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
        nft_mint_address: metadata.nft_mint_address,  // New field
        nft_token_account: metadata.nft_token_account, // New field
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

pub async fn submit_transaction_no_update(
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
    let tx = match bincode::deserialize::<SolanaTransaction>(&tx_bytes) {
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

    // Return transaction signature without updating the database
    info!("Transaction submitted successfully without database update");
    HttpResponse::Ok().json(TransactionResponse {
        signature: tx_signature.to_string(),
    })
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
        let transaction = SolanaTransaction::new(&signers, message, blockhash);
        
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
        nft_mint_address: metadata.nft_mint_address,  // New field
        nft_token_account: metadata.nft_token_account, // New field
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

// Define the Transaction struct for database interaction
#[derive(Debug, Serialize, Deserialize, Queryable, Insertable)]
#[diesel(table_name = crate::schema::transactions)]
pub struct DbTransaction {
    pub id: uuid::Uuid,
    pub property_id: String,
    pub seller_wallet: String,
    pub buyer_wallet: String,
    pub price: i64,
    pub timestamp: chrono::NaiveDateTime,
}

// New request struct for recording a property sale
#[derive(Debug, Deserialize)]
pub struct RecordPropertySaleRequest {
    pub property_id: String,
    pub seller_wallet: String,
    pub buyer_wallet: String,
    pub price: i64,
    pub transaction_signature: String,
}

#[derive(Debug, Serialize)]
pub struct PropertySaleResponse {
    pub success: bool,
    pub message: String,
    pub transaction_id: Option<Uuid>,
}

/// Records a completed property sale transaction in the database
pub async fn record_property_sale(
    req: HttpRequest,
    data: web::Json<RecordPropertySaleRequest>,
) -> impl Responder {
    // Verify authentication token
    let wallet_address = match verify_token(&req).await {
        Ok(wallet) => wallet,
        Err(resp) => return resp,
    };

    // Check that the requester is either the buyer or seller
    if wallet_address != data.buyer_wallet && wallet_address != data.seller_wallet {
        return HttpResponse::Forbidden().body("Only the buyer or seller can record this transaction");
    }

    let mut conn = match db::establish_connection() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to database: {}", e);
            return HttpResponse::InternalServerError().body("Database connection failed");
        }
    };

    // Create new transaction record
    let transaction_id = Uuid::new_v4();
    let now = Utc::now().naive_utc();
    
    let new_transaction = DbTransaction {
        id: transaction_id,
        property_id: data.property_id.clone(),
        seller_wallet: data.seller_wallet.clone(),
        buyer_wallet: data.buyer_wallet.clone(),
        price: data.price,
        timestamp: now,
    };

    // Insert transaction into database
    match diesel::insert_into(crate::schema::transactions::table)
        .values(&new_transaction)
        .execute(&mut conn)
    {
        Ok(_) => {
            info!(
                "Property sale recorded: {} sold to {}",
                data.property_id, data.buyer_wallet
            );
            
            // Update property ownership in the properties table
            {
                use crate::schema::properties::dsl::{properties, property_id as prop_id, owner_wallet, is_active, updated_at as prop_updated_at};
                
                match diesel::update(properties.filter(prop_id.eq(&data.property_id)))
                    .set((
                        owner_wallet.eq(&data.buyer_wallet),
                        is_active.eq(false),
                        prop_updated_at.eq(now),
                    ))
                    .execute(&mut conn)
                {
                    Ok(_) => {
                        info!("Property ownership transferred to {}", data.buyer_wallet);
                    },
                    Err(e) => {
                        error!("Failed to update property ownership: {}", e);
                        // Continue anyway since the transaction was recorded
                    }
                }
            }
            
            // Update the status of the accepted offer to 'completed'
            {
                use crate::schema::offers::dsl::{offers, property_id as offer_property_id, buyer_wallet as offer_buyer_wallet, status, updated_at as offer_updated_at};
                
                match diesel::update(offers.filter(
                    offer_property_id.eq(&data.property_id)
                        .and(offer_buyer_wallet.eq(&data.buyer_wallet))
                        .and(status.eq("accepted"))
                ))
                    .set((
                        status.eq("completed"),
                        offer_updated_at.eq(now),
                    ))
                    .execute(&mut conn)
                {
                    Ok(_) => {
                        info!("Offer status updated to completed");
                    },
                    Err(e) => {
                        error!("Failed to update offer status: {}", e);
                        // Continue anyway since the transaction was recorded
                    }
                }
            }
            
            HttpResponse::Ok().json(PropertySaleResponse {
                success: true,
                message: "Property sale transaction recorded successfully".to_string(),
                transaction_id: Some(transaction_id),
            })
        },
        Err(e) => {
            error!("Failed to record property sale: {}", e);
            HttpResponse::InternalServerError().json(PropertySaleResponse {
                success: false,
                message: format!("Failed to record property sale: {}", e),
                transaction_id: None,
            })
        }
    }
}

#[derive(Debug, Serialize)]
pub struct TransactionsResponse {
    pub success: bool,
    pub message: String,
    pub transactions: Vec<DbTransaction>,
}

/// Retrieves the transaction history
pub async fn get_transactions(req: HttpRequest) -> impl Responder {
    // Verify authentication token
    let _wallet_address = match verify_token(&req).await {
        Ok(wallet) => wallet,
        Err(resp) => return resp,
    };

    let mut conn = match db::establish_connection() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to database: {}", e);
            return HttpResponse::InternalServerError().body("Database connection failed");
        }
    };

    // Fetch all transactions ordered by timestamp (most recent first)
    let transactions_result = crate::schema::transactions::table
        .order_by(crate::schema::transactions::timestamp.desc())
        .load::<DbTransaction>(&mut conn);

    match transactions_result {
        Ok(transactions) => {
            info!("Successfully retrieved {} transactions", transactions.len());
            HttpResponse::Ok().json(TransactionsResponse {
                success: true,
                message: format!("Successfully retrieved {} transactions", transactions.len()),
                transactions,
            })
        },
        Err(e) => {
            error!("Failed to fetch transactions: {}", e);
            HttpResponse::InternalServerError().json(TransactionsResponse {
                success: false,
                message: format!("Failed to fetch transactions: {}", e),
                transactions: vec![],
            })
        }
    }
}

// Add after the get_transactions function
#[derive(Debug, Deserialize)]
pub struct CompleteNFTTransferRequest {
    pub transaction_signature: String,
    pub property_id: String,
    pub nft_mint: String,
    pub seller_wallet: String,
    pub buyer_wallet: String,
    pub offer_id: String,
    pub amount: f64,
}

#[derive(Debug, Serialize)]
pub struct CompleteNFTTransferResponse {
    pub success: bool,
    pub message: String,
    pub nft_transaction_signature: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEscrowTokenAccountRequest {
    pub offer_id: String,
    pub property_id: String,
    pub nft_mint_address: String,
    pub buyer_wallet: Option<String>,  // Optional field to provide buyer wallet directly
}

#[derive(Debug, Serialize)]
pub struct CreateEscrowTokenAccountResponse {
    pub success: bool,
    pub message: String,
    pub escrow_token_account: Option<String>,
}

/// Handles the NFT transfer using admin authority after SOL payment has been completed
pub async fn complete_nft_transfer(
    req: HttpRequest,
    data: web::Json<CompleteNFTTransferRequest>,
) -> impl Responder {
    // Verify authentication token
    let wallet_address = match verify_token(&req).await {
        Ok(wallet) => wallet,
        Err(resp) => return resp,
    };

    // Verify that the requester is the buyer
    if wallet_address != data.buyer_wallet {
        return HttpResponse::Forbidden().body("Only the buyer can request NFT transfer completion");
    }

    info!(
        "Processing NFT transfer completion for property {} from {} to {}", 
        data.property_id, data.seller_wallet, data.buyer_wallet
    );

    // In a real implementation, this would:
    // 1. Load the admin keypair from secure storage
    // 2. Create a Token Program transfer instruction to move the NFT 
    // 3. Sign and submit that transaction

    // For now, we'll log information and return success as a placeholder
    // The actual NFT transfer would be implemented in a secure way in production

    info!("NFT transfer from {} to {} would be executed here", data.seller_wallet, data.buyer_wallet);
    info!("Property ID: {}, NFT Mint: {}", data.property_id, data.nft_mint);
    info!("Original transaction signature: {}", data.transaction_signature);

    // Here you would use the admin keypair to sign and submit the NFT transfer transaction
    
    HttpResponse::Ok().json(CompleteNFTTransferResponse {
        success: true,
        message: "NFT transfer request processed successfully. In production, this would transfer the NFT.".to_string(),
        nft_transaction_signature: Some("simulated_nft_tx_signature".to_string()),
    })
}

#[derive(Debug, Deserialize)]
pub struct UpdatePropertyOwnershipRequest {
    pub property_id: String, 
    pub new_owner: String,
    pub offer_id: String,
    pub transaction_signature: String,
}

#[derive(Debug, Serialize)]
pub struct UpdatePropertyOwnershipResponse {
    pub success: bool,
    pub message: String,
}

/// Updates property ownership in the database after sale completion
pub async fn update_property_ownership(
    req: HttpRequest,
    data: web::Json<UpdatePropertyOwnershipRequest>,
) -> impl Responder {
    // Verify authentication token
    let wallet_address = match verify_token(&req).await {
        Ok(wallet) => wallet,
        Err(resp) => return resp,
    };

    // Verify that the requester is the new owner
    if wallet_address != data.new_owner {
        return HttpResponse::Forbidden().body("Only the new owner can update property ownership");
    }

    // Parse offer_id string to UUID
    let offer_uuid = match Uuid::parse_str(&data.offer_id) {
        Ok(uuid) => uuid,
        Err(e) => {
            error!("Invalid offer UUID format: {}", e);
            return HttpResponse::BadRequest().json(UpdatePropertyOwnershipResponse {
                success: false,
                message: format!("Invalid offer ID format: {}", e),
            });
        }
    };

    let mut conn = match db::establish_connection() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to database: {}", e);
            return HttpResponse::InternalServerError().body("Database connection failed");
        }
    };

    let now = Utc::now().naive_utc();
    
    // Update property ownership in the properties table
    let property_update_result = {
        use crate::schema::properties::dsl::{properties, property_id as prop_id, owner_wallet, updated_at as prop_updated_at};
        
        diesel::update(properties.filter(prop_id.eq(&data.property_id)))
            .set((
                owner_wallet.eq(&data.new_owner),
                prop_updated_at.eq(now),
            ))
            .execute(&mut conn)
    };

    match property_update_result {
        Ok(_) => {
            info!("Property ownership transferred to {}", data.new_owner);
            
            // Update the status of the associated offer to 'completed'
            let offer_update_result = {
                use crate::schema::offers::dsl::{offers, id as offer_id, status, updated_at as offer_updated_at};
                
                // Use the parsed UUID instead of the string
                diesel::update(offers.filter(offer_id.eq(offer_uuid)))
                    .set((
                        status.eq("completed"),
                        offer_updated_at.eq(now),
                    ))
                    .execute(&mut conn)
            };

            match offer_update_result {
                Ok(_) => {
                    info!("Offer status updated to completed");
                    HttpResponse::Ok().json(UpdatePropertyOwnershipResponse {
                        success: true,
                        message: "Property ownership updated successfully".to_string(),
                    })
                },
                Err(e) => {
                    error!("Failed to update offer status: {}", e);
                    // Continue anyway since the property ownership was updated
                    HttpResponse::Ok().json(UpdatePropertyOwnershipResponse {
                        success: true,
                        message: "Property ownership updated but offer status update failed".to_string(),
                    })
                }
            }
        },
        Err(e) => {
            error!("Failed to update property ownership: {}", e);
            HttpResponse::InternalServerError().json(UpdatePropertyOwnershipResponse {
                success: false,
                message: format!("Failed to update property ownership: {}", e),
            })
        }
    }
}

// Add this function before update_property_ownership
pub async fn create_escrow_token_account(
    req: HttpRequest,
    data: web::Json<CreateEscrowTokenAccountRequest>,
) -> impl Responder {
    // Verify authentication token
    let _wallet_address = match verify_token(&req).await {
        Ok(wallet) => wallet,
        Err(resp) => return resp,
    };

    info!("Creating escrow token account for offer ID: {}", &data.offer_id);

    let marketplace_program_id = match Pubkey::from_str("E7v7RResymJU5XvvPA9uwxGSEEsdSE6XvaP7BTV2GGoQ") {
        Ok(pubkey) => pubkey,
        Err(_) => return HttpResponse::BadRequest().body("Invalid program ID"),
    };

    let nft_mint = match Pubkey::from_str(&data.nft_mint_address) {
        Ok(pubkey) => pubkey,
        Err(_) => return HttpResponse::BadRequest().body("Invalid NFT mint address"),
    };

    // Derive the offer PDA
    let property_pubkey = match get_property_pubkey(&data.property_id, &marketplace_program_id) {
        Ok(pubkey) => pubkey,
        Err(e) => return HttpResponse::BadRequest().body(format!("Error deriving property PDA: {}", e)),
    };

    // Get the offer from database to find the buyer's wallet
    let mut conn = match db::establish_connection() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to database: {}", e);
            return HttpResponse::InternalServerError().body("Database connection failed");
        }
    };

    // Parse offer_id string to UUID
    let offer_uuid = match Uuid::parse_str(&data.offer_id) {
        Ok(uuid) => uuid,
        Err(e) => {
            error!("Invalid offer UUID format: {}", e);
            return HttpResponse::BadRequest().body(format!("Invalid offer ID format: {}", e));
        }
    };

    // Get the offer from the database
    use crate::schema::offers::dsl::{offers, id, buyer_wallet as offer_buyer_wallet};
    let offer_result = offers
        .filter(id.eq(offer_uuid))
        .select(offer_buyer_wallet)
        .first::<String>(&mut conn);

    let buyer_wallet_address = match offer_result {
        Ok(wallet) => wallet,
        Err(e) => {
            error!("Error fetching offer buyer wallet: {}", e);
            return HttpResponse::InternalServerError().body(format!("Error fetching offer: {}", e));
        }
    };

    let buyer_pubkey = if let Some(buyer_wallet) = &data.buyer_wallet {
        match Pubkey::from_str(buyer_wallet) {
            Ok(pubkey) => pubkey,
            Err(_) => return HttpResponse::BadRequest().body("Invalid buyer wallet address in request"),
        }
    } else {
        match Pubkey::from_str(&buyer_wallet_address) {
            Ok(pubkey) => pubkey,
            Err(_) => return HttpResponse::BadRequest().body("Invalid buyer wallet address"),
        }
    };

    let (offer_pda, _) = Pubkey::find_program_address(
        &[
            b"offer", 
            property_pubkey.as_ref(), 
            buyer_pubkey.as_ref()
        ],
        &marketplace_program_id,
    );

    // Derive the escrow PDA
    let (escrow_pda, _) = Pubkey::find_program_address(
        &[b"escrow", offer_pda.as_ref()],
        &marketplace_program_id,
    );

    // Offload blocking RPC call to a separate thread
    let escrow_token_account = match web::block(move || {
        // Create a connection to Solana devnet
        let rpc_client = RpcClient::new("https://api.devnet.solana.com".to_string());
        
        // Get the admin keypair from environment (this should be securely managed)
        let admin_keypair_base58 = std::env::var("ADMIN_KEYPAIR").expect("ADMIN_KEYPAIR must be set");
        let admin_keypair_bytes = bs58::decode(&admin_keypair_base58).into_vec().unwrap();
        let admin_keypair = Keypair::from_bytes(&admin_keypair_bytes).unwrap();
        
        // Create Associated Token Account for escrow
        // Import spl token libraries here to avoid conflicts
        use spl_associated_token_account::{
            get_associated_token_address_with_program_id,
            instruction::create_associated_token_account,
        };
        use spl_token::id as token_program_id;
        
        // Calculate the escrow's token account address
        let escrow_token_account = get_associated_token_address_with_program_id(
            &escrow_pda,
            &nft_mint,
            &token_program_id()
        );
        
        // Check if the token account already exists
        if let Ok(_) = rpc_client.get_account(&escrow_token_account) {
            // Account already exists, return it
            info!("Escrow token account already exists: {}", escrow_token_account);
            return Ok::<Pubkey, anyhow::Error>(escrow_token_account);
        }
        
        // Create instruction to make the token account
        let create_ata_ix = create_associated_token_account(
            &admin_keypair.pubkey(),  // Fee payer
            &escrow_pda,              // Account owner (escrow PDA)
            &nft_mint,                // Token mint
            &token_program_id(),      // Token program ID
        );
        
        // Create transaction
        let recent_blockhash = rpc_client.get_latest_blockhash()?;
        let message = Message::new(&[create_ata_ix], Some(&admin_keypair.pubkey()));
        let mut tx = SolanaTransaction::new(&[&admin_keypair], message, recent_blockhash);
        
        // Send and confirm transaction
        let signature = rpc_client.send_and_confirm_transaction(&tx)?;
        info!("Created escrow token account: {} with signature: {}", escrow_token_account, signature);
        
        Ok::<Pubkey, anyhow::Error>(escrow_token_account)
    }).await {
        Ok(Ok(account)) => account,
        Ok(Err(e)) => {
            error!("Error creating escrow token account: {}", e);
            return HttpResponse::InternalServerError().json(CreateEscrowTokenAccountResponse {
                success: false,
                message: format!("Failed to create escrow token account: {}", e),
                escrow_token_account: None,
            });
        },
        Err(e) => {
            error!("Thread pool error: {}", e);
            return HttpResponse::InternalServerError().json(CreateEscrowTokenAccountResponse {
                success: false,
                message: format!("Thread pool error: {}", e),
                escrow_token_account: None,
            });
        },
    };

    HttpResponse::Ok().json(CreateEscrowTokenAccountResponse {
        success: true,
        message: "Escrow token account created successfully".to_string(),
        escrow_token_account: Some(escrow_token_account.to_string()),
    })
}

// Create a new function that gets the marketplace PDA and the marketplace account's authority
fn get_marketplace_info(program_id: &Pubkey) -> Result<(Pubkey, Pubkey), anyhow::Error> {
    // First try with the connected wallet we observed
    let authority = match Pubkey::from_str("A9xYe8XDnCRyPdy7B75B5PT7JP9ktLtxi6xMBVa7C4Xd") {
        Ok(pubkey) => pubkey,
        Err(_) => return Err(anyhow::anyhow!("Invalid authority public key")),
    };
    
    let (marketplace_pda, _) = Pubkey::find_program_address(
        &[b"marketplace", authority.as_ref()],
        program_id,
    );
    
    // In a production environment, we would query the blockchain to get the marketplace account
    // and extract the authority from it.
    
    Ok((marketplace_pda, authority))
}

// Helper function to derive property PDA
fn get_property_pubkey(property_id: &str, program_id: &Pubkey) -> Result<Pubkey, anyhow::Error> {
    let (marketplace_pda, _) = get_marketplace_info(program_id)?;
    
    let (property_pda, _) = Pubkey::find_program_address(
        &[b"property", marketplace_pda.as_ref(), property_id.as_bytes()],
        program_id,
    );
    
    Ok(property_pda)
} 