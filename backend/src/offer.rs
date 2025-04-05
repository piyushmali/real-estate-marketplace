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

#[derive(Serialize)]
pub struct OfferResponse {
    pub success: bool,
    pub message: String,
    pub offer: Option<Offer>,
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