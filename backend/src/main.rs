use axum::{routing::get, Router};
use config::Config;
use diesel::prelude::*;
use std::net::SocketAddr;

mod schema;

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

    log::info!("Starting server on {}", addr);

    let app = Router::new().route("/", get(|| async { "Hello, Real Estate Marketplace!" }));

    axum::serve(tokio::net::TcpListener::bind(addr).await?, app.into_make_service()).await?;

    Ok(())
}