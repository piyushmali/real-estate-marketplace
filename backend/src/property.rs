use actix_web::{web, HttpRequest, HttpResponse, Responder};
use diesel::prelude::*;
use tracing::{info, error};
use crate::db;
use crate::models::Property;
use crate::schema::properties::dsl::*;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use crate::transaction::verify_token;
use diesel::AsChangeset;

/// Fetches all active properties from the database
pub async fn get_properties() -> impl Responder {
    let mut conn = match db::establish_connection() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to database: {}", e);
            return HttpResponse::InternalServerError().body("Database connection failed");
        }
    };

    info!("Fetching all active properties");
    
    let result = properties
        .filter(is_active.eq(true))
        .order_by(created_at.desc())
        .load::<Property>(&mut conn);
    
    match result {
        Ok(props) => {
            info!("Successfully fetched {} properties", props.len());
            HttpResponse::Ok().json(props)
        },
        Err(e) => {
            error!("Failed to fetch properties: {}", e);
            HttpResponse::InternalServerError().body(format!("Failed to fetch properties: {}", e))
        }
    }
}

/// Fetches a specific property by its ID
pub async fn get_property(path: web::Path<String>) -> impl Responder {
    let property_id_param = path.into_inner();
    
    let mut conn = match db::establish_connection() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to database: {}", e);
            return HttpResponse::InternalServerError().body("Database connection failed");
        }
    };

    info!("Fetching property with ID: {}", property_id_param);
    
    let result = properties
        .filter(property_id.eq(property_id_param))
        .filter(is_active.eq(true))
        .first::<Property>(&mut conn);
    
    match result {
        Ok(prop) => {
            info!("Successfully fetched property");
            HttpResponse::Ok().json(prop)
        },
        Err(diesel::result::Error::NotFound) => {
            info!("Property not found");
            HttpResponse::NotFound().body("Property not found")
        },
        Err(e) => {
            error!("Failed to fetch property: {}", e);
            HttpResponse::InternalServerError().body(format!("Failed to fetch property: {}", e))
        }
    }
}

// Add a new response type just for NFT mint information
#[derive(Serialize)]
pub struct NftMintResponse {
    pub property_id: String,
    pub nft_mint_address: String,
    pub owner_wallet: String,
}

/// Fetches just the NFT mint address for a property
pub async fn get_property_nft_mint(path: web::Path<String>) -> impl Responder {
    let property_id_param = path.into_inner();
    
    let mut conn = match db::establish_connection() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to database: {}", e);
            return HttpResponse::InternalServerError().body("Database connection failed");
        }
    };

    info!("Fetching NFT mint for property ID: {}", property_id_param);
    
    let result = properties
        .filter(property_id.eq(property_id_param))
        .select((property_id, nft_mint_address, owner_wallet))
        .first::<(String, String, String)>(&mut conn);
    
    match result {
        Ok((prop_id, mint, owner)) => {
            info!("Successfully fetched NFT mint address");
            HttpResponse::Ok().json(NftMintResponse {
                property_id: prop_id,
                nft_mint_address: mint,
                owner_wallet: owner,
            })
        },
        Err(diesel::result::Error::NotFound) => {
            info!("Property not found");
            HttpResponse::NotFound().body("Property not found")
        },
        Err(e) => {
            error!("Failed to fetch property NFT mint: {}", e);
            HttpResponse::InternalServerError().body(format!("Failed to fetch property NFT mint: {}", e))
        }
    }
}

#[derive(Deserialize)]
pub struct UpdatePropertyRequest {
    pub metadata_uri: Option<String>,
    pub price: Option<i64>,
    pub is_active: Option<bool>,
}

#[derive(Serialize)]
pub struct UpdatePropertyResponse {
    pub success: bool,
    pub message: String,
}

/// Updates a property's metadata_uri, price, and is_active status
pub async fn update_property(
    req: HttpRequest,
    path: web::Path<String>,
    data: web::Json<UpdatePropertyRequest>,
) -> impl Responder {
    // Verify authentication token
    let wallet_address = match verify_token(&req).await {
        Ok(wallet) => wallet,
        Err(resp) => return resp,
    };

    let property_id_param = path.into_inner();
    
    let mut conn = match db::establish_connection() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to database: {}", e);
            return HttpResponse::InternalServerError().body("Database connection failed");
        }
    };

    info!("Updating property with ID: {}", property_id_param);
    
    // First, find the property and check ownership
    let property_result = properties
        .filter(property_id.eq(&property_id_param))
        .first::<Property>(&mut conn);
    
    let property = match property_result {
        Ok(prop) => prop,
        Err(diesel::result::Error::NotFound) => {
            info!("Property not found");
            return HttpResponse::NotFound().body("Property not found");
        },
        Err(e) => {
            error!("Failed to fetch property: {}", e);
            return HttpResponse::InternalServerError().body(format!("Failed to fetch property: {}", e));
        }
    };
    
    // Verify ownership
    if property.owner_wallet != wallet_address {
        return HttpResponse::Forbidden().body("You don't have permission to update this property");
    }
    
    // Check if we have any changes to make
    let mut has_changes = false;
    
    // Create a struct to collect the changes
    #[derive(AsChangeset)]
    #[diesel(table_name = crate::schema::properties)]
    struct PropertyChanges {
        metadata_uri: Option<String>,
        price: Option<i64>,
        is_active: Option<bool>,
        updated_at: chrono::NaiveDateTime,
    }
    
    // Initialize with the update timestamp
    let now = Utc::now().naive_utc();
    let mut changes = PropertyChanges {
        metadata_uri: None,
        price: None,
        is_active: None,
        updated_at: now,
    };
    
    // Set the fields that have changed
    if let Some(new_metadata_uri) = data.metadata_uri.clone() {
        changes.metadata_uri = Some(new_metadata_uri);
        has_changes = true;
    }
    
    if let Some(new_price) = data.price {
        changes.price = Some(new_price);
        has_changes = true;
    }
    
    if let Some(new_is_active) = data.is_active {
        changes.is_active = Some(new_is_active);
        has_changes = true;
    }
    
    if !has_changes {
        // No changes to make
        return HttpResponse::Ok().json(UpdatePropertyResponse {
            success: true,
            message: "No changes requested".to_string(),
        });
    }
    
    // Execute the update with the changes
    match diesel::update(properties.filter(property_id.eq(&property_id_param)))
        .set(&changes)
        .execute(&mut conn) 
    {
        Ok(_) => {
            info!("Successfully updated property {}", property_id_param);
            HttpResponse::Ok().json(UpdatePropertyResponse {
                success: true,
                message: "Property updated successfully".to_string(),
            })
        },
        Err(e) => {
            error!("Failed to update property: {}", e);
            HttpResponse::InternalServerError().body(format!("Failed to update property: {}", e))
        }
    }
} 