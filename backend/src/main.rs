// ================================================================================
// IMPORTANT: RUST VERSION COMPATIBILITY ISSUE
// Your current Rust version (1.78.0) is not compatible with dependencies:
//   - base64ct@1.7.3 requires rustc 1.81
//   - litemap@0.7.5 requires rustc 1.81
//   - pq-sys@0.7.1 requires rustc 1.82.0
//   - zerofrom@0.1.6 requires rustc 1.81
//
// To resolve this:
// 1. Upgrade your Rust version:
//    rustup update stable
// 2. Or downgrade dependencies (not recommended for long-term):
//    cargo update <package>@<version> --precise <compatible-version>
// ================================================================================

use actix_web::{self, web, App, HttpResponse, HttpServer, Responder};
use actix_cors::Cors; 
use dotenv::dotenv;
use serde::{self, Deserialize};
use std::env;
use tracing::{info, error};
use tracing_subscriber;

mod auth;
mod db;
mod models;
mod schema;
mod transaction;
mod property;
mod offer;

#[derive(Deserialize)]
struct AuthRequest {
    public_key: String,
    signature: String,
    timestamp: i64,
}

async fn authenticate(req: web::Json<AuthRequest>) -> impl Responder {
    let message = format!("Timestamp: {}", req.timestamp);
    
    // Add debug logging
    info!("Authentication request received for wallet: {}", req.public_key);
    
    if auth::verify_wallet_signature(&req.public_key, &req.signature, &message) {
        match auth::generate_jwt(&req.public_key) {
            Ok(token) => {
                if let Err(e) = auth::store_user_jwt(&req.public_key, &token) {
                    return HttpResponse::InternalServerError()
                        .body(format!("Failed to store JWT: {}", e));
                }
                HttpResponse::Ok().json(serde_json::json!({"token": token}))
            }
            Err(e) => HttpResponse::InternalServerError().body(format!("Failed to generate JWT: {}", e)),
        }
    } else {
        HttpResponse::Unauthorized().body("Invalid signature")
    }
}

async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("Real Estate Marketplace server is running!")
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    // TODO: There are proc-macro issues that need to be resolved properly by running:
    // 1. Ensure you have the correct Rust version (at least 1.81 or higher as required by dependencies)
    // 2. Run 'cargo clean' and 'cargo update' to refresh dependencies
    // 3. There may be a conflict with the proc-macro imports for Deserialize and actix_web::main
    // 4. If the issues persist, try alternative ways of running an actix app without actix_web::main macro
    //    or explicitly import all serde attributes without the derive feature.
    
    // Load environment variables from .env file - make sure this happens first
    if let Err(e) = dotenv() {
        eprintln!("Failed to load .env file: {}", e);
    }
    
    // Print out loaded environment variables for debugging (never do this in production!)
    if let Ok(db_url) = env::var("DATABASE_URL") {
        info!("Loaded DATABASE_URL: {}", db_url);
    } else {
        error!("DATABASE_URL not found in environment!");
    }
    
    if let Ok(_) = env::var("JWT_SECRET") {
        info!("JWT_SECRET loaded successfully");
    } else {
        error!("JWT_SECRET not found in environment!");
    }
    
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    // Test database connection on startup
    match db::establish_connection() {
        Ok(_) => info!("Database connection successful"),
        Err(e) => {
            error!("Database connection failed: {}", e);
            // Continue running the server even if the DB connection fails initially
        }
    }

    let port = env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse::<u16>()
        .expect("PORT must be a valid u16");

    info!("Starting Real Estate Marketplace server on port {}", port);

    HttpServer::new(|| {
        // Configure CORS
        let cors = Cors::default()
            .allow_any_origin()  // In production, you might want to specify specific origins
            .allowed_methods(vec!["GET", "POST", "PATCH"])
            .allowed_headers(vec![
                actix_web::http::header::AUTHORIZATION,
                actix_web::http::header::ACCEPT,
                actix_web::http::header::CONTENT_TYPE,
            ])
            .max_age(3600);

        App::new()
            .wrap(cors)  // Add CORS middleware
            .route("/health", web::get().to(health_check))
            .route("/api/auth", web::post().to(authenticate))
            .route("/api/transactions/submit", web::post().to(transaction::submit_transaction))
            .route("/api/blockhash", web::get().to(transaction::get_recent_blockhash))
            .route("/api/instructions/submit", web::post().to(transaction::submit_instructions))
            .route("/api/properties", web::get().to(property::get_properties))
            .route("/api/properties/{property_id}", web::get().to(property::get_property))
            // New endpoints
            .route("/api/properties/{property_id}/nft-mint", web::get().to(property::get_property_nft_mint))
            .route("/api/transactions/submit-no-update", web::post().to(transaction::submit_transaction_no_update))
            .route("/api/properties/{property_id}/update", web::patch().to(property::update_property))
            // Offer endpoints
            .route("/api/offers", web::post().to(offer::create_offer))
            .route("/api/offers/my-offers", web::get().to(offer::get_user_offers))
            .route("/api/offers/{offer_id}", web::patch().to(offer::update_offer))
            .route("/api/offers/{offer_id}/respond", web::post().to(offer::respond_to_offer))
            .route("/api/properties/{property_id}/offers", web::get().to(offer::get_property_offers))
            // New endpoint for recording property sales
            .route("/api/transactions/record-sale", web::post().to(transaction::record_property_sale))
            // New endpoint for fetching transaction history
            .route("/api/transactions", web::get().to(transaction::get_transactions))
            // New endpoints for our workaround solution
            .route("/api/transactions/complete-transfer", web::post().to(transaction::complete_nft_transfer))
            .route("/api/properties/update-ownership", web::post().to(transaction::update_property_ownership))
    })
    .bind(("127.0.0.1", port))?
    .run()
    .await
}