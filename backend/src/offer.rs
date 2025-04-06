use actix_web::{web, HttpRequest, HttpResponse, Responder};
use diesel::prelude::*;
use chrono::{Utc, Duration};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use tracing::{info, error};

use crate::db;
use crate::models::Offer;
use crate::schema::offers::dsl::*;
use crate::transaction::verify_token;

#[derive(Deserialize)]
pub struct CreateOfferRequest {
    pub property_id: String,
    pub amount: i64,
    pub expiration_days: i64,
}

#[derive(Deserialize)]
pub struct UpdateOfferRequest {
    pub status: String,
}

#[derive(Deserialize)]
pub struct OfferResponseRequest {
    pub status: String, // "accepted" or "rejected"
    pub transaction_signature: Option<String>, // Optional transaction signature for blockchain transactions
}

#[derive(Serialize)]
pub struct OfferResponse {
    pub success: bool,
    pub message: String,
    pub offer: Option<Offer>,
}

#[derive(Serialize)]
pub struct OffersResponse {
    pub success: bool,
    pub message: String,
    pub offers: Vec<Offer>,
}

/// Creates a new offer for a property
pub async fn create_offer(
    req: HttpRequest,
    data: web::Json<CreateOfferRequest>,
) -> impl Responder {
    // Verify authentication token
    let wallet_address = match verify_token(&req).await {
        Ok(wallet) => wallet,
        Err(resp) => return resp,
    };

    // Add detailed logging for the wallet address
    info!("Creating offer with authenticated wallet: {}", wallet_address);

    // Extract and log Authorization header for debugging
    if let Some(auth_header) = req.headers().get("Authorization") {
        if let Ok(auth_str) = auth_header.to_str() {
            if auth_str.starts_with("Bearer ") {
                info!("Using Bearer token from header");
            } else {
                error!("Authorization header doesn't start with 'Bearer '");
            }
        } else {
            error!("Failed to convert Authorization header to string");
        }
    } else {
        error!("No Authorization header found in request");
    }

    let mut conn = match db::establish_connection() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to database: {}", e);
            return HttpResponse::InternalServerError().body("Database connection failed");
        }
    };

    info!("Creating new offer for property: {}", data.property_id);

    // Calculate expiration time
    let now = Utc::now().naive_utc();
    let expire_time = now + Duration::days(data.expiration_days);

    let new_offer = Offer {
        id: Uuid::new_v4(),
        property_id: data.property_id.clone(),
        buyer_wallet: wallet_address,
        amount: data.amount,
        status: "pending".to_string(),
        created_at: now,
        updated_at: now,
        expiration_time: expire_time,
    };

    match diesel::insert_into(offers)
        .values(&new_offer)
        .execute(&mut conn)
    {
        Ok(_) => {
            info!("Successfully created offer for property {}", data.property_id);
            HttpResponse::Ok().json(OfferResponse {
                success: true,
                message: "Offer created successfully".to_string(),
                offer: Some(new_offer),
            })
        },
        Err(e) => {
            error!("Failed to create offer: {}", e);
            HttpResponse::InternalServerError().body(format!("Failed to create offer: {}", e))
        }
    }
}

/// Updates an offer's status
pub async fn update_offer(
    req: HttpRequest,
    path: web::Path<String>,
    data: web::Json<UpdateOfferRequest>,
) -> impl Responder {
    // Verify authentication token
    let wallet_address = match verify_token(&req).await {
        Ok(wallet) => wallet,
        Err(resp) => return resp,
    };

    let offer_id_str = path.into_inner();
    
    // Parse the offer ID string into a UUID
    let offer_uuid = match Uuid::parse_str(&offer_id_str) {
        Ok(uuid) => uuid,
        Err(_) => {
            return HttpResponse::BadRequest().body("Invalid offer ID format");
        }
    };
    
    let mut conn = match db::establish_connection() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to database: {}", e);
            return HttpResponse::InternalServerError().body("Database connection failed");
        }
    };

    info!("Updating offer with ID: {}", offer_id_str);

    // First, find the offer and check ownership
    let offer_result = offers
        .filter(id.eq(offer_uuid))
        .first::<Offer>(&mut conn);
    
    let offer = match offer_result {
        Ok(offer) => offer,
        Err(diesel::result::Error::NotFound) => {
            info!("Offer not found");
            return HttpResponse::NotFound().body("Offer not found");
        },
        Err(e) => {
            error!("Failed to fetch offer: {}", e);
            return HttpResponse::InternalServerError().body(format!("Failed to fetch offer: {}", e));
        }
    };

    // Verify ownership
    if offer.buyer_wallet != wallet_address {
        return HttpResponse::Forbidden().body("You don't have permission to update this offer");
    }

    // Update the offer
    let now = Utc::now().naive_utc();
    match diesel::update(offers.find(offer_uuid))
        .set((
            status.eq(&data.status),
            updated_at.eq(now),
        ))
        .execute(&mut conn)
    {
        Ok(_) => {
            info!("Successfully updated offer {}", offer_id_str);
            HttpResponse::Ok().json(OfferResponse {
                success: true,
                message: "Offer updated successfully".to_string(),
                offer: None,
            })
        },
        Err(e) => {
            error!("Failed to update offer: {}", e);
            HttpResponse::InternalServerError().body(format!("Failed to update offer: {}", e))
        }
    }
}

/// Retrieves all offers made by the current user
pub async fn get_user_offers(req: HttpRequest) -> impl Responder {
    // Verify authentication token
    let wallet_address = match verify_token(&req).await {
        Ok(wallet) => wallet,
        Err(resp) => return resp,
    };

    let mut conn = match db::establish_connection() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to database: {}", e);
            return HttpResponse::InternalServerError().body("Database connection failed");
        }
    };

    info!("Fetching offers for user: {}", wallet_address);

    // Query all offers where buyer_wallet matches the authenticated user
    let user_offers = match offers
        .filter(buyer_wallet.eq(&wallet_address))
        .order_by(created_at.desc())
        .load::<Offer>(&mut conn) 
    {
        Ok(result) => result,
        Err(e) => {
            error!("Failed to fetch user offers: {}", e);
            return HttpResponse::InternalServerError().body(format!("Failed to fetch offers: {}", e));
        }
    };

    info!("Found {} offers for user {}", user_offers.len(), wallet_address);

    // Return the offers
    HttpResponse::Ok().json(OffersResponse {
        success: true,
        message: format!("Successfully retrieved {} offers", user_offers.len()),
        offers: user_offers,
    })
}

/// Endpoint for a property owner to respond to an offer (accept or reject)
pub async fn respond_to_offer(
    req: HttpRequest,
    path: web::Path<String>,
    data: web::Json<OfferResponseRequest>,
) -> impl Responder {
    // Verify authentication token
    let wallet_address = match verify_token(&req).await {
        Ok(wallet) => wallet,
        Err(resp) => return resp,
    };

    let offer_id_str = path.into_inner();
    
    // Parse the offer ID string into a UUID
    let offer_uuid = match Uuid::parse_str(&offer_id_str) {
        Ok(uuid) => uuid,
        Err(_) => {
            return HttpResponse::BadRequest().body("Invalid offer ID format");
        }
    };
    
    let mut conn = match db::establish_connection() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to database: {}", e);
            return HttpResponse::InternalServerError().body("Database connection failed");
        }
    };

    info!("Processing offer response for offer ID: {}", offer_id_str);

    // First, find the offer
    let offer_result = offers
        .filter(id.eq(offer_uuid))
        .first::<Offer>(&mut conn);
    
    let offer = match offer_result {
        Ok(offer) => offer,
        Err(diesel::result::Error::NotFound) => {
            info!("Offer not found");
            return HttpResponse::NotFound().body("Offer not found");
        },
        Err(e) => {
            error!("Failed to fetch offer: {}", e);
            return HttpResponse::InternalServerError().body(format!("Failed to fetch offer: {}", e));
        }
    };

    // Find the property to verify ownership
    use crate::schema::properties::dsl::{properties, property_id as prop_id, owner_wallet};
    
    let property_result = properties
        .filter(prop_id.eq(&offer.property_id))
        .first::<crate::models::Property>(&mut conn);
    
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

    // Verify that the request is from the property owner
    if property.owner_wallet != wallet_address {
        return HttpResponse::Forbidden().body("Only the property owner can respond to offers");
    }

    // Verify that the offer status is currently pending
    if offer.status != "pending" {
        return HttpResponse::BadRequest().body("Can only respond to pending offers");
    }

    // Verify that the requested status is valid
    if data.status != "accepted" && data.status != "rejected" {
        return HttpResponse::BadRequest().body("Status must be 'accepted' or 'rejected'");
    }

    // Update the offer status
    let now = Utc::now().naive_utc();
    match diesel::update(offers.find(offer_uuid))
        .set((
            status.eq(&data.status),
            updated_at.eq(now),
        ))
        .execute(&mut conn)
    {
        Ok(_) => {
            info!("Successfully updated offer {} to status {}", offer_id_str, data.status);
            
            // Log transaction signature if present
            if let Some(signature) = &data.transaction_signature {
                info!("Blockchain transaction signature: {}", signature);
            }
            
            HttpResponse::Ok().json(OfferResponse {
                success: true,
                message: format!("Offer {} successfully", &data.status),
                offer: None,
            })
        },
        Err(e) => {
            error!("Failed to update offer: {}", e);
            HttpResponse::InternalServerError().body(format!("Failed to update offer: {}", e))
        }
    }
}

/// Retrieves all offers for a specific property
pub async fn get_property_offers(
    req: HttpRequest,
    path: web::Path<String>,
) -> impl Responder {
    // Verify authentication token
    let wallet_address = match verify_token(&req).await {
        Ok(wallet) => wallet,
        Err(resp) => return resp,
    };

    let property_id_str = path.into_inner();
    
    let mut conn = match db::establish_connection() {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to database: {}", e);
            return HttpResponse::InternalServerError().body("Database connection failed");
        }
    };

    // Verify property ownership (only owners can see offers for their property)
    use crate::schema::properties::dsl::{properties, property_id as prop_id, owner_wallet};
    
    let is_owner = match properties
        .filter(prop_id.eq(&property_id_str))
        .filter(owner_wallet.eq(&wallet_address))
        .first::<crate::models::Property>(&mut conn)
    {
        Ok(_) => true,
        Err(diesel::result::Error::NotFound) => false,
        Err(e) => {
            error!("Failed to check property ownership: {}", e);
            return HttpResponse::InternalServerError().body(format!("Failed to verify ownership: {}", e));
        }
    };

    if !is_owner {
        return HttpResponse::Forbidden().body("Only the property owner can view property offers");
    }

    info!("Fetching offers for property: {}", property_id_str);

    // Query all offers for the specific property
    let property_offers = match offers
        .filter(property_id.eq(&property_id_str))
        .order_by(created_at.desc())
        .load::<Offer>(&mut conn) 
    {
        Ok(result) => result,
        Err(e) => {
            error!("Failed to fetch property offers: {}", e);
            return HttpResponse::InternalServerError().body(format!("Failed to fetch offers: {}", e));
        }
    };

    info!("Found {} offers for property {}", property_offers.len(), property_id_str);

    // Return the offers
    HttpResponse::Ok().json(OffersResponse {
        success: true,
        message: format!("Successfully retrieved {} offers", property_offers.len()),
        offers: property_offers,
    })
} 