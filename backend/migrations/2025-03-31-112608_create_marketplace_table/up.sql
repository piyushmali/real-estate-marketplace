CREATE TABLE marketplace (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authority TEXT NOT NULL,
    properties_count BIGINT NOT NULL DEFAULT 0,
    fee_percentage BIGINT NOT NULL,
    pda TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);