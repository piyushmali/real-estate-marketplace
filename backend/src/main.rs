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
struct LoginRequest {
    wallet_address: String,
    signature: String,
    message: String,
}

async fn login(req: web::Json<LoginRequest>) -> impl Responder {
    if auth::verify_wallet_signature(&req.wallet_address, &req.signature, &req.message) {
        match auth::generate_jwt(&req.wallet_address) {
            Ok(token) => {
                if let Err(e) = auth::store_user_jwt(&req.wallet_address, &token) {
                    return HttpResponse::InternalServerError()
                        .body(format!("Failed to store JWT: {}", e));
                }
                HttpResponse::Ok().json(serde_json::json!({"token": token}))
            }
            Err(_) => HttpResponse::InternalServerError().body("Failed to generate JWT"),
        }
    } else {
        HttpResponse::Unauthorized().body("Invalid signature")
    }
}

async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("Server is running!")
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

    info!("Starting server on port {}", port);

    HttpServer::new(|| {
        App::new()
            .route("/health", web::get().to(health_check))
            .route("/auth/login", web::post().to(login))
    })
    .bind(("127.0.0.1", port))?
    .run()
    .await
}