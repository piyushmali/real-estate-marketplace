use axum::{routing::{get, post}, Router, Json, middleware, extract::State};
use diesel::prelude::*;
use std::net::SocketAddr;
use serde_json::json;
use axum::http::{HeaderMap, StatusCode};

mod auth;
mod config;
mod models;
mod schema;
mod solana;

#[derive(Clone)]
struct AppState {
    config: config::AppConfig,
}

async fn authenticate(
    headers: HeaderMap,
    State(state): State<AppState>,
    request: axum::http::Request<axum::body::Body>,
    next: middleware::Next,
) -> Result<axum::response::Response, (StatusCode, String)> {
    let auth_header = headers.get("Authorization").ok_or((
        StatusCode::UNAUTHORIZED,
        "Missing Authorization header".to_string(),
    ))?;
    let token = auth_header.to_str().unwrap().strip_prefix("Bearer ").ok_or((
        StatusCode::UNAUTHORIZED,
        "Invalid Authorization header format".to_string(),
    ))?;
    let user_id = auth::validate_token(token, &state.config.jwt_secret).map_err(|_| (
        StatusCode::UNAUTHORIZED,
        "Invalid or expired token".to_string(),
    ))?;
    log::info!("Authenticated user: {} for {:?}", user_id, state.config.database_url);
    Ok(next.run(request).await)
}

async fn login() -> Json<serde_json::Value> {
    let config = config::AppConfig::load().unwrap();
    let token = auth::create_token("user123", &config.jwt_secret).unwrap();
    Json(json!({"token": token}))
}

async fn test_solana() -> String {
    let config = config::AppConfig::load().unwrap();
    let solana = solana::SolanaClient::new(&config.solana_rpc_url, &config.program_id)
        .expect("Failed to initialize Solana client");
    let data_len = solana.get_program_account_data_len().unwrap_or(0);
    format!("Program account data length: {}", data_len)
}

async fn list_property(Json(new_property): Json<models::NewProperty>) -> Json<serde_json::Value> {
    let config = config::AppConfig::load().unwrap();
    let mut conn = PgConnection::establish(&config.database_url).unwrap();
    let solana = solana::SolanaClient::new(&config.solana_rpc_url, &config.program_id).unwrap();

    solana.list_property(&new_property.property_id).unwrap();
    let now = chrono::Utc::now().timestamp();
    let property = models::NewProperty {
        property_id: new_property.property_id,
        owner_pubkey: new_property.owner_pubkey,
        price: new_property.price,
        metadata_uri: new_property.metadata_uri,
        location: new_property.location,
        square_feet: new_property.square_feet,
        bedrooms: new_property.bedrooms,
        bathrooms: new_property.bathrooms,
        nft_mint: new_property.nft_mint,
    };
    diesel::insert_into(schema::properties::table)
        .values((
            &property,
            schema::properties::is_active.eq(true),
            schema::properties::created_at.eq(now),
            schema::properties::updated_at.eq(now),
        ))
        .execute(&mut conn)
        .unwrap();
    Json(json!({"status": "Property listed"}))
}

async fn make_offer(Json(new_offer): Json<models::NewOffer>) -> Json<serde_json::Value> {
    let config = config::AppConfig::load().unwrap();
    let mut conn = PgConnection::establish(&config.database_url).unwrap();
    let solana = solana::SolanaClient::new(&config.solana_rpc_url, &config.program_id).unwrap();

    solana.make_offer(&new_offer.property_id, new_offer.amount).unwrap();
    let now = chrono::Utc::now().timestamp();
    let offer = models::NewOffer {
        property_id: new_offer.property_id,
        buyer_pubkey: new_offer.buyer_pubkey,
        amount: new_offer.amount,
        expiration_time: new_offer.expiration_time,
    };
    diesel::insert_into(schema::offers::table)
        .values((
            &offer,
            schema::offers::status.eq("pending"),
            schema::offers::created_at.eq(now),
            schema::offers::updated_at.eq(now),
        ))
        .execute(&mut conn)
        .unwrap();
    Json(json!({"status": "Offer made"}))
}

async fn respond_to_offer(Json(response): Json<models::OfferResponse>) -> Json<serde_json::Value> {
    let config = config::AppConfig::load().unwrap();
    let mut conn = PgConnection::establish(&config.database_url).unwrap();
    let solana = solana::SolanaClient::new(&config.solana_rpc_url, &config.program_id).unwrap();

    let status = if response.accept { "accepted" } else { "rejected" };
    let now = chrono::Utc::now().timestamp();
    solana.respond_to_offer(response.offer_id, response.accept).unwrap();
    diesel::update(schema::offers::table.filter(schema::offers::id.eq(response.offer_id)))
        .set((
            schema::offers::status.eq(status),
            schema::offers::updated_at.eq(now),
        ))
        .execute(&mut conn)
        .unwrap();
    Json(json!({"status": format!("Offer {}", status)}))
}

async fn finalize_sale(Json(sale): Json<models::SaleRequest>) -> Json<serde_json::Value> {
    let config = config::AppConfig::load().unwrap();
    let mut conn = PgConnection::establish(&config.database_url).unwrap();
    let solana = solana::SolanaClient::new(&config.solana_rpc_url, &config.program_id).unwrap();

    let now = chrono::Utc::now().timestamp();
    solana.finalize_sale(&sale.property_id, sale.offer_id).unwrap();
    diesel::update(schema::properties::table.filter(schema::properties::property_id.eq(&sale.property_id)))
        .set((
            schema::properties::is_active.eq(false),
            schema::properties::updated_at.eq(now),
        ))
        .execute(&mut conn)
        .unwrap();
    diesel::update(schema::offers::table.filter(schema::offers::id.eq(sale.offer_id)))
        .set((
            schema::offers::status.eq("completed"),
            schema::offers::updated_at.eq(now),
        ))
        .execute(&mut conn)
        .unwrap();
    Json(json!({"status": "Sale finalized"}))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var("RUST_LOG", "info");
    }
    env_logger::init();

    let config = config::AppConfig::load()?;
    log::info!("Loaded config: {:?}", config);

    let addr = SocketAddr::from(([127, 0, 0, 1], config.port));

    let mut conn = PgConnection::establish(&config.database_url)
        .map_err(|e| format!("Failed to connect to database: {}", e))?;
    let test_query: i32 = diesel::select(diesel::dsl::sql::<diesel::sql_types::Integer>("1"))
        .get_result(&mut conn)?;
    log::info!("Database test query result: {}", test_query);

    let solana = solana::SolanaClient::new(&config.solana_rpc_url, &config.program_id)?;
    log::info!("Solana program ID: {}", solana.get_program_id());

    log::info!("Starting server on {}", addr);

    let state = AppState { config };
    let protected_routes = Router::new()
        .route("/properties", post(list_property))
        .route("/offers", post(make_offer))
        .route("/respond-offer", post(respond_to_offer))
        .route("/finalize-sale", post(finalize_sale))
        .layer(middleware::from_fn_with_state(state.clone(), authenticate));

    let app = Router::new()
        .route("/", get(|| async { "Hello, Real Estate Marketplace!" }))
        .route("/test-solana", get(test_solana))
        .route("/login", get(login))
        .merge(protected_routes)
        .with_state(state);

    axum::serve(tokio::net::TcpListener::bind(addr).await?, app.into_make_service()).await?;

    Ok(())
}