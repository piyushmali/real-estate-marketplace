use actix_web::{web, HttpResponse, Responder};
use diesel::prelude::*;
use tracing::{info, error};
use crate::db;
use crate::models::Property;
use crate::schema::properties::dsl::*;

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