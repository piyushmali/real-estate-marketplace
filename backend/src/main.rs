use axum::{routing::{get, post}, Router, Json, middleware, extract::State};
use config::Config;
use diesel::prelude::*;
use std::net::SocketAddr;
use serde_json::json;
use axum::http::{HeaderMap, StatusCode};

mod schema;
mod solana;
mod models;
mod auth;

#[derive(Clone)]
struct AppState {
    settings: Config,
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
    let user_id = auth::validate_token(token).map_err(|_| (
        StatusCode::UNAUTHORIZED,
        "Invalid or expired token".to_string(),
    ))?;
    log::info!("Authenticated user: {} for {:?}", user_id, state.settings.get_string("default.database_url"));
    Ok(next.run(request).await)
}

async fn login() -> Json<serde_json::Value> {
    let token = auth::create_token("user123").unwrap();
    Json(json!({"token": token}))
}

async fn test_solana() -> String {
    let settings = Config::builder()
        .add_source(config::File::with_name("settings").required(true))
        .build()
        .expect("Failed to load settings");
    let solana = solana::SolanaClient::new(
        &settings.get_string("default.solana_rpc_url").unwrap(),
        &settings.get_string("default.program_id").unwrap(),
    )
    .expect("Failed to initialize Solana client");
    let data_len = solana.get_program_account_data_len().unwrap_or(0);
    format!("Program account data length: {}", data_len)
}

async fn list_property(Json(new_property): Json<models::NewProperty>) -> Json<serde_json::Value> {
    let settings = Config::builder()
        .add_source(config::File::with_name("settings").required(true))
        .build()
        .unwrap();
    let db_url = settings.get_string("default.database_url").unwrap();
    let mut conn = PgConnection::establish(&db_url).unwrap();
    let solana = solana::SolanaClient::new(
        &settings.get_string("default.solana_rpc_url").unwrap(),
        &settings.get_string("default.program_id").unwrap(),
    ).unwrap();

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
        is_active: true,
        created_at: now,
        updated_at: now,
        nft_mint: new_property.nft_mint,
    };
    diesel::insert_into(schema::properties::table)
        .values(&property)
        .execute(&mut conn)
        .unwrap();
    Json(json!({"status": "Property listed"}))
}

async fn make_offer(Json(new_offer): Json<models::NewOffer>) -> Json<serde_json::Value> {
    let settings = Config::builder()
        .add_source(config::File::with_name("settings").required(true))
        .build()
        .unwrap();
    let db_url = settings.get_string("default.database_url").unwrap();
    let mut conn = PgConnection::establish(&db_url).unwrap();
    let solana = solana::SolanaClient::new(
        &settings.get_string("default.solana_rpc_url").unwrap(),
        &settings.get_string("default.program_id").unwrap(),
    ).unwrap();

    solana.make_offer(&new_offer.property_id, new_offer.amount).unwrap();
    let now = chrono::Utc::now().timestamp();
    let offer = models::NewOffer {
        property_id: new_offer.property_id,
        buyer_pubkey: new_offer.buyer_pubkey,
        amount: new_offer.amount,
        status: "pending".to_string(),
        created_at: now,
        updated_at: now,
        expiration_time: new_offer.expiration_time,
    };
    diesel::insert_into(schema::offers::table)
        .values(&offer)
        .execute(&mut conn)
        .unwrap();
    Json(json!({"status": "Offer made"}))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var("RUST_LOG", "info");
    }
    env_logger::init();

    let settings = Config::builder()
        .add_source(config::File::with_name("settings").required(true))
        .add_source(config::Environment::with_prefix("REAL_ESTATE_MARKETPLACE"))
        .build()
        .map_err(|e| format!("Failed to load configuration: {}", e))?;
    
    log::info!("Loaded config: {:?}", settings);

    let port = settings.get_int("default.port").unwrap_or_else(|_| {
        log::warn!("Port not found in config, defaulting to 8080");
        8080
    }) as u16;
    let addr = SocketAddr::from(([127, 0, 0, 1], port));

    let db_url = settings.get_string("default.database_url")?;
    let mut conn = PgConnection::establish(&db_url)
        .map_err(|e| format!("Failed to connect to database: {}", e))?;
    let test_query: i32 = diesel::select(diesel::dsl::sql::<diesel::sql_types::Integer>("1"))
        .get_result(&mut conn)?;
    log::info!("Database test query result: {}", test_query);

    let solana = solana::SolanaClient::new(
        &settings.get_string("default.solana_rpc_url")?,
        &settings.get_string("default.program_id")?,
    )?;
    log::info!("Solana program ID: {}", solana.get_program_id());

    log::info!("Starting server on {}", addr);

    let state = AppState { settings };
    let protected_routes = Router::new()
        .route("/properties", post(list_property))
        .route("/offers", post(make_offer))
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