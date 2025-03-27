// @generated automatically by Diesel CLI.

diesel::table! {
    offers (id) {
        id -> Int4,
        #[max_length = 32]
        property_id -> Varchar,
        #[max_length = 44]
        buyer_pubkey -> Varchar,
        amount -> Int8,
        #[max_length = 20]
        status -> Varchar,
        created_at -> Int8,
        updated_at -> Int8,
        expiration_time -> Int8,
    }
}

diesel::table! {
    properties (id) {
        id -> Int4,
        #[max_length = 32]
        property_id -> Varchar,
        #[max_length = 44]
        owner_pubkey -> Varchar,
        price -> Int8,
        #[max_length = 100]
        metadata_uri -> Varchar,
        #[max_length = 50]
        location -> Varchar,
        square_feet -> Int8,
        bedrooms -> Int2,
        bathrooms -> Int2,
        is_active -> Bool,
        created_at -> Int8,
        updated_at -> Int8,
        #[max_length = 44]
        nft_mint -> Varchar,
    }
}

diesel::allow_tables_to_appear_in_same_query!(
    offers,
    properties,
);