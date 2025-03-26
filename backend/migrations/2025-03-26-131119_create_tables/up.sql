CREATE TABLE properties (
    id SERIAL PRIMARY KEY,
    property_id VARCHAR(32) NOT NULL UNIQUE,
    owner_pubkey VARCHAR(44) NOT NULL,
    price BIGINT NOT NULL,
    metadata_uri VARCHAR(100) NOT NULL,
    location VARCHAR(50) NOT NULL,
    square_feet BIGINT NOT NULL,
    bedrooms SMALLINT NOT NULL,
    bathrooms SMALLINT NOT NULL,
    is_active BOOLEAN NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    nft_mint VARCHAR(44) NOT NULL
);

CREATE TABLE offers (
    id SERIAL PRIMARY KEY,
    property_id VARCHAR(32) NOT NULL REFERENCES properties(property_id),
    buyer_pubkey VARCHAR(44) NOT NULL,
    amount BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    expiration_time BIGINT NOT NULL
);