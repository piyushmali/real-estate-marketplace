use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use actix_cors::Cors; 
use dotenv::dotenv;
use serde::Deserialize;
use std::env;
use tracing::{info, error};
use tracing_subscriber;

mod auth;
mod db;
mod models;
mod schema;
mod transaction;
mod property;

#[derive(Deserialize)]
struct AuthRequest {
    public_key: String,
    signature: String,
    timestamp: i64,
}

async fn authenticate(req: web::Json<AuthRequest>) -> impl Responder {
    let message = format!("Timestamp: {}", req.timestamp);
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

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();
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
            .allowed_methods(vec!["GET", "POST"])
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
    })
    .bind(("127.0.0.1", port))?
    .run()
    .await
}