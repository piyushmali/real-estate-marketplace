use axum::{routing::{get, post}, Router, Json, middleware, extract::State};
use diesel::prelude::*;
use diesel::r2d2::{self, ConnectionManager};
use std::net::SocketAddr;
use serde_json::json;
use axum::http::{HeaderMap, StatusCode};
use tokio::task;

mod auth;
mod config;
mod models;
mod schema;
mod solana;

type Pool = r2d2::Pool<ConnectionManager<PgConnection>>;

#[derive(Clone)]
struct AppState {
    config: config::AppConfig,
    db_pool: Pool,
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

async fn login(State(state): State<AppState>) -> Json<serde_json::Value> {
    let token = auth::create_token("user123", &state.config.jwt_secret).unwrap();
    Json(json!({"token": token}))
}

#[axum::debug_handler]
async fn list_property(
    State(state): State<AppState>,
    Json(new_property): Json<models::NewProperty>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    log::info!("Listing property: {:?}", new_property);
    let new_property_clone = new_property.clone();
    
    let _db_result = task::spawn_blocking({
        let pool = state.db_pool.clone();
        move || {
            let mut conn = pool.get()
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database pool error: {}", e)))?;
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
    log::info!("Making offer: {:?}", new_offer);
    let new_offer_clone = new_offer.clone();
    
    let _db_result = task::spawn_blocking({
        let pool = state.db_pool.clone();
        move || {
            let mut conn = pool.get()
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database pool error: {}", e)))?;
            let now = chrono::Utc::now().timestamp();
            log::info!("Inserting offer: {:?}", new_offer);
            diesel::insert_into(schema::offers::table)
                .values((
                    &new_offer,
                    schema::offers::status.eq("pending"),
                    schema::offers::created_at.eq(now),
                    schema::offers::updated_at.eq(now),
                ))
                .execute(&mut conn)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;
            log::info!("Offer inserted successfully");
            Ok(())
        }
    })
    .await
    .map_err(|e| {
        log::error!("Task spawn error: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Task error: {}", e))
    })??;

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
            log::info!("Calling Solana make_offer");
            let tx_response = solana.make_offer(
                &new_offer_clone.property_id,
                new_offer_clone.amount,
                new_offer_clone.expiration_time,
                &new_offer_clone.buyer_pubkey,
            )
            .map_err(|e| {
                log::error!("Solana make_offer error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, format!("Solana error: {}", e))
            })?;
            log::info!("Offer prepared: {:?}", tx_response);
            Ok(tx_response)
        }
    })
    .await
    .map_err(|e| {
        log::error!("Solana task spawn error: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Task error: {}", e))
    })??;

    Ok(Json(json!({
        "status": "Offer prepared",
        "transaction": solana_result.transaction,
        "message": solana_result.message,
    })))
}

#[axum::debug_handler]
async fn respond_to_offer(
    State(state): State<AppState>,
    Json(response): Json<models::OfferResponse>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    log::info!("Responding to offer: {:?}", response);
    
    let offer = task::spawn_blocking({
        let pool = state.db_pool.clone();
        move || {
            let mut conn = pool.get()
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database pool error: {}", e)))?;
            let offer: models::Offer = schema::offers::table
                .filter(schema::offers::id.eq(response.offer_id))
                .first(&mut conn)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;
            let status = if response.accept { "accepted" } else { "rejected" };
            let now = chrono::Utc::now().timestamp();
            log::info!("Updating offer status to '{}'", status);
            diesel::update(schema::offers::table.filter(schema::offers::id.eq(response.offer_id)))
                .set((
                    schema::offers::status.eq(status),
                    schema::offers::updated_at.eq(now),
                ))
                .execute(&mut conn)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;
            log::info!("Offer updated successfully");
            Ok(offer)
        }
    })
    .await
    .map_err(|e| {
        log::error!("Task spawn error: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Task error: {}", e))
    })??;

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
            log::info!("Calling Solana respond_to_offer");
            let tx_response = solana.respond_to_offer(response.offer_id, response.accept, &offer.buyer_pubkey)
                .map_err(|e| {
                    log::error!("Solana respond_to_offer error: {}", e);
                    (StatusCode::INTERNAL_SERVER_ERROR, format!("Solana error: {}", e))
                })?;
            log::info!("Offer response prepared: {:?}", tx_response);
            Ok(tx_response)
        }
    })
    .await
    .map_err(|e| {
        log::error!("Solana task spawn error: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Task error: {}", e))
    })??;

    let status = if response.accept { "accepted" } else { "rejected" };
    Ok(Json(json!({
        "status": format!("Offer {} prepared", status),
        "transaction": solana_result.transaction,
        "message": solana_result.message,
    })))
}

#[axum::debug_handler]
async fn finalize_sale(
    State(state): State<AppState>,
    Json(sale): Json<models::SaleRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    log::info!("Finalizing sale: {:?}", sale);
    let property_id_clone = sale.property_id.clone();
    
    let (offer, property) = task::spawn_blocking({
        let pool = state.db_pool.clone();
        move || {
            let mut conn = pool.get()
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database pool error: {}", e)))?;
            let offer: models::Offer = schema::offers::table
                .filter(schema::offers::id.eq(sale.offer_id))
                .first(&mut conn)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;
            let property: models::Property = schema::properties::table
                .filter(schema::properties::property_id.eq(&sale.property_id))
                .first(&mut conn)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;
            let now = chrono::Utc::now().timestamp();
            log::info!("Updating property and offer for sale");
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
            log::info!("Sale updates completed successfully");
            Ok((offer, property))
        }
    })
    .await
    .map_err(|e| {
        log::error!("Task spawn error: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Task error: {}", e))
    })??;

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
            log::info!("Calling Solana finalize_sale");
            let tx_response = solana.finalize_sale(
                &property_id_clone,
                sale.offer_id,
                &offer.buyer_pubkey,
                &property.owner_pubkey,
            )
            .map_err(|e| {
                log::error!("Solana finalize_sale error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, format!("Solana error: {}", e))
            })?;
            log::info!("Sale prepared: {:?}", tx_response);
            Ok(tx_response)
        }
    })
    .await
    .map_err(|e| {
        log::error!("Solana task spawn error: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Task error: {}", e))
    })??;

    Ok(Json(json!({
        "status": "Sale prepared",
        "transaction": solana_result.transaction,
        "message": solana_result.message,
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

    let manager = ConnectionManager::<PgConnection>::new(&config.database_url);
    let pool = r2d2::Pool::builder()
        .max_size(15)
        .build(manager)
        .map_err(|e| format!("Failed to create pool: {}", e))?;

    let db_test: i32 = task::spawn_blocking({
        let pool = pool.clone();
        move || {
            let mut conn = pool.get()
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

    let addr = SocketAddr::from(([127, 0, 0, 1], config.port));
    log::info!("Starting server on {}", addr);

    let state = AppState { config, db_pool: pool };
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