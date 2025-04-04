#!/usr/bin/env pwsh
$env:DATABASE_URL="postgres://shubh:123@localhost/real_estate_db"
$env:SOLANA_RPC_URL="https://api.devnet.solana.com"
$env:ADMIN_PRIVATE_KEY="2Zm9KeEMjowDmCXVgZYQCYiuqunAbTWdttV1yZfEr9R4Qsrt85znbnkYqWhK6Bx4iWic7AGtavbjaWkD7LX9Ap7z"
$env:JWT_SECRET="HOGWSHOVFJHOPNRF52929VTGRFBNICF"
$env:PORT="8080"

Write-Host "Starting Real Estate Marketplace backend server..."
cargo run --release 