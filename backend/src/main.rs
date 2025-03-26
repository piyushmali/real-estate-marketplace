use axum::{routing::get, Router};
use config::Config;
use std::net::SocketAddr;

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

    let port = settings
        .get_int("default.port") // Changed from "port" to "default.port"
        .unwrap_or_else(|_| {
            log::warn!("Port not found in config, defaulting to 8080");
            8080
        }) as u16;
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    log::info!("Starting server on {}", addr);

    let app = Router::new().route("/", get(|| async { "Hello, Real Estate Marketplace!" }));

    axum::serve(tokio::net::TcpListener::bind(addr).await?, app.into_make_service()).await?;

    Ok(())
}