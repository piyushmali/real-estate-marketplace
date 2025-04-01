use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use dotenv::dotenv;
use serde::Deserialize;
use std::env;
use tracing::info;
use tracing_subscriber;

mod auth;
mod db;
mod models;
mod schema;

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

    let _conn = db::establish_connection();

    let port = env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse::<u16>()
        .expect("PORT must be a valid u16");

    info!("Starting Real Estate Marketplace server on port {}", port);

    HttpServer::new(|| {
        App::new()
            .route("/health", web::get().to(health_check))
            .route("/api/auth", web::post().to(authenticate))
    })
    .bind(("127.0.0.1", port))?
    .run()
    .await
}