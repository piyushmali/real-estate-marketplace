use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use actix_cors::Cors;
use dotenv::dotenv;
use serde::{Deserialize, Serialize};
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

#[derive(Deserialize, Serialize)]
struct AuthRequest {
    public_key: String,
    signature: String,
    timestamp: i64,
}

async fn authenticate(req: web::Json<AuthRequest>) -> impl Responder {
    let message = format!("Timestamp: {}", req.timestamp);
    info!("Authentication request received for wallet: {}", req.public_key);

    if auth::verify_wallet_signature(&req.public_key, &req.signature, &message) {
        match auth::generate_jwt(&req.public_key) {
            Ok(token) => {
                if let Err(e) = auth::store_user_jwt(&req.public_key, &token) {
                    error!("Failed to store JWT: {}", e);
                    return HttpResponse::InternalServerError()
                        .body(format!("Failed to store JWT: {}", e));
                }
                HttpResponse::Ok().json(serde_json::json!({"token": token}))
            }
            Err(e) => {
                error!("Failed to generate JWT: {}", e);
                HttpResponse::InternalServerError().body(format!("Failed to generate JWT: {}", e))
            }
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
    // Load environment variables
    dotenv().ok(); // Ignore errors if .env is missing (Render uses env vars)

    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    // Log environment variables (avoid logging sensitive data in production)
    if let Ok(db_url) = env::var("DATABASE_URL") {
        info!("Loaded DATABASE_URL: [redacted]");
    } else {
        error!("DATABASE_URL not found in environment!");
    }

    if env::var("JWT_SECRET").is_ok() {
        info!("JWT_SECRET loaded successfully");
    } else {
        error!("JWT_SECRET not found in environment!");
    }

    // Test database connection
    match db::establish_connection() {
        Ok(_) => info!("Database connection successful"),
        Err(e) => error!("Database connection failed: {}", e),
    }

    // Get port from environment (Render sets PORT)
    let port = env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse::<u16>()
        .expect("PORT must be a valid u16");

    info!("Starting Real Estate Marketplace server on port {}", port);

    HttpServer::new(|| {
        // Configure CORS for Vercel frontend
        let cors = Cors::default()
            .allowed_origin("https://your-vercel-app.vercel.app") // Replace with your Vercel URL
            .allowed_origin("http://localhost:5173") // For local testing
            .allowed_methods(vec!["GET", "POST", "PATCH"])
            .allowed_headers(vec![
                actix_web::http::header::AUTHORIZATION,
                actix_web::http::header::ACCEPT,
                actix_web::http::header::CONTENT_TYPE,
            ])
            .max_age(3600);

        App::new()
            .wrap(cors)
            .route("/health", web::get().to(health_check))
            .route("/api/auth", web::post().to(authenticate))
            .route("/api/transactions/submit", web::post().to(transaction::submit_transaction))
            .route("/api/blockhash", web::get().to(transaction::get_recent_blockhash))
            .route("/api/instructions/submit", web::post().to(transaction::submit_instructions))
            .route("/api/properties", web::get().to(property::get_properties))
            .route("/api/properties/{property_id}", web::get().to(property::get_property))
            .route("/api/properties/{property_id}/nft-mint", web::get().to(property::get_property_nft_mint))
            .route("/api/transactions/submit-no-update", web::post().to(transaction::submit_transaction_no_update))
            .route("/api/properties/{property_id}/update", web::patch().to(property::update_property))
            .route("/api/offers", web::post().to(offer::create_offer))
            .route("/api/offers/my-offers", web::get().to(offer::get_user_offers))
            .route("/api/offers/{offer_id}", web::patch().to(offer::update_offer))
            .route("/api/offers/{offer_id}/respond", web::post().to(offer::respond_to_offer))
            .route("/api/properties/{property_id}/offers", web::get().to(offer::get_property_offers))
            .route("/api/transactions/record-sale", web::post().to(transaction::record_property_sale))
            .route("/api/transactions", web::get().to(transaction::get_transactions))
            .route("/api/transactions/complete-transfer", web::post().to(transaction::complete_nft_transfer))
            .route("/api/properties/update-ownership", web::post().to(transaction::update_property_ownership))
            .route("/api/offers/create-escrow-account", web::post().to(transaction::create_escrow_token_account))
    })
    .bind(("0.0.0.0", port))? // Bind to 0.0.0.0 for Render
    .run()
    .await
}