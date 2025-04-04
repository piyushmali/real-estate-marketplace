#!/usr/bin/env pwsh
$env:VITE_SOLANA_RPC_URL="https://api.devnet.solana.com"
$env:VITE_BACKEND_URL="http://localhost:8080"

Write-Host "Starting Real Estate Marketplace frontend..."
npm run dev 