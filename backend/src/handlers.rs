use actix_web::{web, HttpResponse, Responder};
use chrono::Utc;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::establish_connection;
use crate::models::Property;

#[derive(Deserialize)]
pub struct CreatePropertyRequest {
    pub property_id: String,
    pub owner_wallet: String,
    pub price: i64,
    pub metadata_uri: String,
    pub location: String,
    pub square_feet: i64,
    pub bedrooms: i16,
    pub bathrooms: i16,
}

#[derive(Serialize)]
pub struct PropertyResponse {
    pub id: Uuid,
    pub property_id: String,
    pub owner_wallet: String,
    pub price: i64,
    pub metadata_uri: String,
    pub location: String,
    pub square_feet: i64,
    pub bedrooms: i16,
    pub bathrooms: i16,
    pub is_active: bool,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

pub async fn create_property(req: web::Json<CreatePropertyRequest>) -> impl Responder {
    use crate::schema::properties;
    let conn = &mut establish_connection();
    let now = Utc::now().naive_utc();

    let new_property = Property {
        id: Uuid::new_v4(),
        property_id: req.property_id.clone(),
        owner_wallet: req.owner_wallet.clone(),
        price: req.price,
        metadata_uri: req.metadata_uri.clone(),
        location: req.location.clone(),
        square_feet: req.square_feet,
        bedrooms: req.bedrooms,
        bathrooms: req.bathrooms,
        is_active: true,
        created_at: now,
        updated_at: now,
    };

    match diesel::insert_into(properties::table)
        .values(&new_property)
        .execute(conn)
    {
        Ok(_) => HttpResponse::Ok().json(PropertyResponse {
            id: new_property.id,
            property_id: new_property.property_id,
            owner_wallet: new_property.owner_wallet,
            price: new_property.price,
            metadata_uri: new_property.metadata_uri,
            location: new_property.location,
            square_feet: new_property.square_feet,
            bedrooms: new_property.bedrooms,
            bathrooms: new_property.bathrooms,
            is_active: new_property.is_active,
            created_at: new_property.created_at,
            updated_at: new_property.updated_at,
        }),
        Err(e) => HttpResponse::InternalServerError().body(format!("Failed to create property: {}", e)),
    }
        bathrooms: req.bathrooms,
        is_active: true,
        created_at: now,
        updated_at: now,
    };

    match diesel::insert_into(crate::schema::properties::table)
        .values(&new_property)
        .execute(conn)
    {
        Ok(_) => HttpResponse::Ok().json(PropertyResponse {
            id: new_property.id,
            property_id: new_property.property_id,
            owner_wallet: new_property.owner_wallet,
            price: new_property.price,
            metadata_uri: new_property.metadata_uri,
            location: new_property.location,
            square_feet: new_property.square_feet,
            bedrooms: new_property.bedrooms,
            bathrooms: new_property.bathrooms,
            is_active: new_property.is_active,
            created_at: new_property.created_at,
            updated_at: new_property.updated_at,
        }),
        Err(e) => HttpResponse::InternalServerError().body(format!("Failed to create property: {}", e)),
    }
}

pub async fn get_properties() -> impl Responder {
    let conn = &mut establish_connection();

    match crate::schema::properties::table
        .load::<Property>(conn)
    {
        Ok(properties) => {
            let property_responses: Vec<PropertyResponse> = properties
                .into_iter()
                .map(|p| PropertyResponse {
                    id: p.id,
                    property_id: p.property_id,
                    owner_wallet: p.owner_wallet,
                    price: p.price,
                    metadata_uri: p.metadata_uri,
                    location: p.location,
                    square_feet: p.square_feet,
                    bedrooms: p.bedrooms,
                    bathrooms: p.bathrooms,
                    is_active: p.is_active,
                    created_at: p.created_at,
                    updated_at: p.updated_at,
                })
                .collect();
            HttpResponse::Ok().json(property_responses)
        }
        Err(e) => HttpResponse::InternalServerError().body(format!("Failed to fetch properties: {}", e)),
    }
}