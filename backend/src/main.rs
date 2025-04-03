use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use actix_cors::Cors; 
use dotenv::dotenv;
use serde::Deserialize;
use std::env;
use tracing::info;
use tracing_subscriber;

mod auth;
mod db;
mod handlers;
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

    let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let address = format!("127.0.0.1:{}", port);
    info!("Server running at http://{}", address);

    let _conn = db::establish_connection();

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
            .route("/api/properties", web::get().to(handlers::get_properties))
            .route("/api/properties", web::post().to(handlers::create_property))
    })
    .bind(("127.0.0.1", port))?
    .run()
    .await
}