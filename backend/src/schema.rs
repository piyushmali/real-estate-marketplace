// @generated automatically by Diesel CLI.

diesel::table! {
    marketplace (id) {
        id -> Uuid,
        authority -> Text,
        properties_count -> Int8,
        fee_percentage -> Int8,
        pda -> Text,
        created_at -> Timestamp,
    }
}

diesel::table! {
    offers (id) {
        id -> Uuid,
        property_id -> Text,
        buyer_wallet -> Text,
        amount -> Int8,
        status -> Text,
        created_at -> Timestamp,
        updated_at -> Timestamp,
        expiration_time -> Timestamp,
    }
}

diesel::table! {
    properties (id) {
        id -> Uuid,
        property_id -> Text,
        owner_wallet -> Text,
        price -> Int8,
        metadata_uri -> Text,
        location -> Text,
        square_feet -> Int8,
        bedrooms -> Int2,
        bathrooms -> Int2,
        is_active -> Bool,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    transactions (id) {
        id -> Uuid,
        property_id -> Text,
        seller_wallet -> Text,
        buyer_wallet -> Text,
        price -> Int8,
        timestamp -> Timestamp,
    }
}

diesel::table! {
    users (id) {
        id -> Uuid,
        wallet_address -> Text,
        jwt_token -> Nullable<Text>,
    }
}

diesel::allow_tables_to_appear_in_same_query!(
    marketplace,
    offers,
    properties,
    transactions,
    users,
);
