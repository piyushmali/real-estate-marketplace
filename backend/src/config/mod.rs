use dotenv::dotenv;
use std::env;

#[derive(Clone, Debug)] // Added Clone and Debug
pub struct AppConfig {
    pub database_url: String,
    pub solana_rpc_url: String,
    pub program_id: String,
    pub port: u16,
    pub jwt_secret: String,
}

impl AppConfig {
    pub fn load() -> Result<Self, Box<dyn std::error::Error>> {
        dotenv().ok(); // Load .env file if present
        Ok(Self {
            database_url: env::var("DATABASE_URL")?,
            solana_rpc_url: env::var("SOLANA_RPC_URL")?,
            program_id: env::var("PROGRAM_ID")?,
            port: env::var("PORT")?.parse()?,
            jwt_secret: env::var("JWT_SECRET")?,
        })
    }
}