use axum::{routing::{get, post}, Router, Json, middleware, extract::State};
use diesel::prelude::*;
use std::net::SocketAddr;
use serde_json::json;
use axum::http::{HeaderMap, StatusCode};
use tokio::task;

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

#[axum::debug_handler]
async fn list_property(
    State(state): State<AppState>,
    Json(new_property): Json<models::NewProperty>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    log::info!("Listing property: {:?}", new_property);
    let new_property_clone = new_property.clone();
    
    // First, handle database insertion
    let _db_result = task::spawn_blocking({
        let database_url = state.config.database_url.clone();
        move || {
            log::info!("Connecting to database: {}", database_url);
            let mut conn = PgConnection::establish(&database_url)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database connection error: {}", e)))?;
            let now = chrono::Utc::now().timestamp();
            log::info!("Inserting property: {:?}", new_property);
            diesel::insert_into(schema::properties::table)
                .values((
                    &new_property,
                    schema::properties::is_active.eq(true),
                    schema::properties::created_at.eq(now),
                    schema::properties::updated_at.eq(now),
                ))
                .execute(&mut conn)
                .map_err(|e| {
                    if let diesel::result::Error::DatabaseError(diesel::result::DatabaseErrorKind::UniqueViolation, _info) = e {
                        (StatusCode::CONFLICT, format!("Property ID '{}' already exists", new_property.property_id))
                    } else {
                        (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e))
                    }
                })?;
            log::info!("Property inserted successfully");
            Ok(())
        }
    })
    .await
    .map_err(|e| {
        log::error!("Task spawn error: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Task error: {}", e))
    })??;

    // Handle Solana transaction in a blocking task
    let solana_result = task::spawn_blocking({
        let solana_rpc_url = state.config.solana_rpc_url.clone();
        let program_id = state.config.program_id.clone();
        move || {
            log::info!("Initializing Solana client");
            let solana = solana::SolanaClient::new(&solana_rpc_url, &program_id)
                .map_err(|e| {
                    log::error!("Solana client init error: {}", e);
                    (StatusCode::INTERNAL_SERVER_ERROR, format!("Solana error: {}", e))
                })?;
            
            log::info!("Calling Solana list_property");
            let tx_response = solana.list_property(&new_property_clone, &new_property_clone.owner_pubkey)
                .map_err(|e| {
                    log::error!("Solana list_property error: {}", e);
                    (StatusCode::INTERNAL_SERVER_ERROR, format!("Solana error: {}", e))
                })?;

            log::info!("Property listing prepared: {:?}", tx_response);
            Ok(tx_response)
        }
    })
    .await
    .map_err(|e| {
        log::error!("Solana task spawn error: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Task error: {}", e))
    })??;

    Ok(Json(json!({
        "status": "Property listing prepared",
        "transaction": solana_result.transaction,
        "message": solana_result.message,
    })))
}

#[axum::debug_handler]
async fn make_offer(
    State(state): State<AppState>,
    Json(new_offer): Json<models::NewOffer>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let new_offer_clone = new_offer.clone();
    let _db_result = task::spawn_blocking({
        let database_url = state.config.database_url.clone();
        move || {
            let mut conn = PgConnection::establish(&database_url)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;
            let now = chrono::Utc::now().timestamp();
            diesel::insert_into(schema::offers::table)
                .values((
                    &new_offer,
                    schema::offers::status.eq("pending"),
                    schema::offers::created_at.eq(now),
                    schema::offers::updated_at.eq(now),
                ))
                .execute(&mut conn)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;
            Ok(())
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task error: {}", e)))??;

    let solana = solana::SolanaClient::new(&state.config.solana_rpc_url, &state.config.program_id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Solana error: {}", e)))?;
    let tx_response = solana.make_offer(
        &new_offer_clone.property_id,
        new_offer_clone.amount,
        new_offer_clone.expiration_time,
        &new_offer_clone.buyer_pubkey,
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Solana error: {}", e)))?;

    Ok(Json(json!({
        "status": "Offer prepared",
        "transaction": tx_response.transaction,
        "message": tx_response.message,
    })))
}

#[axum::debug_handler]
async fn respond_to_offer(
    State(state): State<AppState>,
    Json(response): Json<models::OfferResponse>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let offer = task::spawn_blocking({
        let database_url = state.config.database_url.clone();
        move || {
            let mut conn = PgConnection::establish(&database_url)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;
            let offer: models::Offer = schema::offers::table
                .filter(schema::offers::id.eq(response.offer_id))
                .first(&mut conn)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;
            let status = if response.accept { "accepted" } else { "rejected" };
            let now = chrono::Utc::now().timestamp();
            diesel::update(schema::offers::table.filter(schema::offers::id.eq(response.offer_id)))
                .set((
                    schema::offers::status.eq(status),
                    schema::offers::updated_at.eq(now),
                ))
                .execute(&mut conn)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;
            Ok(offer)
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task error: {}", e)))??;

    let solana = solana::SolanaClient::new(&state.config.solana_rpc_url, &state.config.program_id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Solana error: {}", e)))?;
    let tx_response = solana.respond_to_offer(response.offer_id, response.accept, &offer.buyer_pubkey)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Solana error: {}", e)))?;

    let status = if response.accept { "accepted" } else { "rejected" };
    Ok(Json(json!({
        "status": format!("Offer {} prepared", status),
        "transaction": tx_response.transaction,
        "message": tx_response.message,
    })))
}

#[axum::debug_handler]
async fn finalize_sale(
    State(state): State<AppState>,
    Json(sale): Json<models::SaleRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let property_id_clone = sale.property_id.clone();
    let (offer, property) = task::spawn_blocking({
        let database_url = state.config.database_url.clone();
        move || {
            let mut conn = PgConnection::establish(&database_url)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;
            let offer: models::Offer = schema::offers::table
                .filter(schema::offers::id.eq(sale.offer_id))
                .first(&mut conn)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;
            let property: models::Property = schema::properties::table
                .filter(schema::properties::property_id.eq(&sale.property_id))
                .first(&mut conn)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;
            let now = chrono::Utc::now().timestamp();
            diesel::update(schema::properties::table.filter(schema::properties::property_id.eq(&sale.property_id)))
                .set((
                    schema::properties::is_active.eq(false),
                    schema::properties::updated_at.eq(now),
                ))
                .execute(&mut conn)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;
            diesel::update(schema::offers::table.filter(schema::offers::id.eq(sale.offer_id)))
                .set((
                    schema::offers::status.eq("completed"),
                    schema::offers::updated_at.eq(now),
                ))
                .execute(&mut conn)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;
            Ok((offer, property))
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task error: {}", e)))??;

    let solana = solana::SolanaClient::new(&state.config.solana_rpc_url, &state.config.program_id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Solana error: {}", e)))?;
    let tx_response = solana.finalize_sale(
        &property_id_clone,
        sale.offer_id,
        &offer.buyer_pubkey,
        &property.owner_pubkey,
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Solana error: {}", e)))?;

    Ok(Json(json!({
        "status": "Sale prepared",
        "transaction": tx_response.transaction,
        "message": tx_response.message,
    })))
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

    let db_test: i32 = task::spawn_blocking({
        let database_url = config.database_url.clone();
        move || {
            let mut conn = PgConnection::establish(&database_url)
                .map_err(|e| diesel::result::Error::DatabaseError(
                    diesel::result::DatabaseErrorKind::UnableToSendCommand,
                    Box::new(e.to_string())
                ))?;
            diesel::select(diesel::dsl::sql::<diesel::sql_types::Integer>("1"))
                .get_result(&mut conn)
        }
    })
    .await??;
    log::info!("Database test query result: {}", db_test);

    let solana = solana::SolanaClient::new(&config.solana_rpc_url, &config.program_id)
        .map_err(|e| format!("Failed to initialize Solana client: {}", e))?;
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
        .route("/login", get(login))
        .merge(protected_routes)
        .with_state(state);

    axum::serve(tokio::net::TcpListener::bind(addr).await?, app.into_make_service()).await?;

    Ok(())
}