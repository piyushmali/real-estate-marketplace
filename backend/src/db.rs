use diesel::pg::PgConnection;
use diesel::prelude::*;
use dotenv::dotenv;
use std::env;
use tracing::{info, error};

pub fn establish_connection() -> Result<PgConnection, ConnectionError> {
    // Try to load .env again to ensure environment variables are available
    dotenv().ok();
    
    match env::var("DATABASE_URL") {
        Ok(database_url) => {
            info!("Attempting to connect to database with URL: {}", database_url);
            match PgConnection::establish(&database_url) {
                Ok(conn) => {
                    info!("Database connection established successfully");
                    Ok(conn)
                },
                Err(e) => {
                    error!("Failed to establish database connection: {}", e);
                    Err(e)
                }
            }
        },
        Err(e) => {
            error!("DATABASE_URL environment variable not found: {}", e);
            Err(ConnectionError::BadConnection("DATABASE_URL environment variable not set".to_string()))
        }
    }
}