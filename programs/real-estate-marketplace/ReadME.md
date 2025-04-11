# Real Estate Marketplace Smart Contract

https://img.shields.io/badge/License-MIT-yellow.svg](https://opensource.org/licenses/MIT)
https://img.shields.io/badge/Built%20with-Anchor-blue](https://www.anchor-lang.com/)
https://img.shields.io/badge/Blockchain-Solana-green](https://solana.com/)

## Overview

This smart contract powers a decentralized real estate marketplace on the Solana blockchain, enabling property owners to tokenize and list their real estate assets as NFTs. The platform facilitates secure property transactions with a comprehensive offer and escrow system, creating a transparent, efficient, and trustless environment for real estate trading.

## Features

- **Property NFT Tokenization**: Convert real estate properties into unique NFTs with associated metadata
- **Marketplace Management**: Initialize and configure the marketplace with customizable fee structure
- **Property Listings**: List properties with detailed information (location, size, price)
- **Offer System**: Make, accept, reject, and manage offers with built-in escrow functionality
- **Secure Transactions**: Complete property sales with automatic token and payment transfers
- **Transaction History**: Track all property transactions permanently on-chain

## Smart Contract Architecture

### Core Components

1. **Marketplace**: Central registry and configuration for the platform
2. **Property**: Individual real estate asset representation with metadata
3. **Offer**: Bid from potential buyers with escrow integration
4. **Escrow**: Temporary holding account for funds and NFTs during transactions
5. **Transaction History**: Record of completed property sales

### Account Structures

rust
// Marketplace configuration
pub struct Marketplace {
    pub authority: Pubkey,
    pub properties_count: u64,
    pub fee_percentage: u64,
}

// Property details
pub struct Property {
    pub marketplace: Pubkey,
    pub owner: Pubkey,
    pub property_id: String,
    pub price: u64,
    pub metadata_uri: String,
    pub location: String,
    pub square_feet: u64,
    pub bedrooms: u8,
    pub bathrooms: u8,
    pub is_active: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub transaction_count: u64,
    pub nft_mint: Pubkey,
}

// Buyer offers
pub struct Offer {
    pub buyer: Pubkey,
    pub property: Pubkey,
    pub amount: u64,
    pub status: OfferStatus,
    pub created_at: i64,
    pub updated_at: i64,
    pub expiration_time: i64,
    pub escrow: Pubkey,
}

// Transaction records
pub struct TransactionHistory {
    pub property: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub price: u64,
    pub timestamp: i64,
    pub transaction_index: u64,
}

// Escrow accounts
pub struct Escrow {
    pub offer: Pubkey,
    pub property: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub nft_held: bool,
    pub created_at: i64,
}


## Key Functions

### For Marketplace Administrators
- `initialize_marketplace`: Create and configure the marketplace with fee settings
  
### For Property Owners
- `list_property`: Create a new property listing with associated NFT
- `update_property`: Modify property details, price, or listing status
- `respond_to_offer`: Accept or reject offers from potential buyers

### For Buyers
- `make_offer`: Submit an offer for a property with automatic escrow
- `execute_sale`: Complete the property purchase after accepted offer

## Technical Details

### Program ID

E7v7RResymJU5XvvPA9uwxGSEEsdSE6XvaP7BTV2GGoQ


### Built With
- **Anchor Framework**: v0.30.1
- **Solana Program Library**: Integrated with SPL Token for NFT operations
- **Solana Blockchain**: Compatible with Solana v1.18.0

### Deployment
The smart contract is deployed on:
- **Devnet**: For testing and integration
- **Localnet**: For development purposes

## Security Features

- Ownership validation for all critical operations
- Escrow-based transaction security for buyer and seller protection
- Comprehensive error handling with descriptive error codes
- Secure NFT transfer mechanisms
- Transaction verification guards against common attack vectors

## Integration Guide

### Prerequisites
- Solana CLI tools
- Anchor Framework
- Node.js environment for client integration

### Initialization Steps
1. Deploy the program to desired network (Devnet/Mainnet)
2. Initialize marketplace with administrative wallet
3. Configure marketplace fee structure (basis points, 0-10000)

### Property Listing Process
1. Create an NFT mint for the property
2. Call `list_property` with property details
3. Property is now visible on the marketplace

### Transaction Flow
1. Buyer submits offer with `make_offer`
2. Seller reviews and responds with `respond_to_offer`
3. If accepted, buyer completes transaction with `execute_sale`
4. Property ownership and funds transfer automatically

## Events and Notifications

The contract emits the following events to facilitate frontend integration:

- `PropertyListed`: When a new property is added to the marketplace
- `PropertyUpdated`: When property details are modified
- `OfferCreated`: When a buyer submits an offer
- `OfferAccepted`: When a seller accepts an offer
- `OfferRejected`: When a seller rejects an offer
- `PropertySold`: When a sale is successfully completed
- `OfferExpired`: When an offer reaches its expiration time

## Error Handling

The contract includes comprehensive error codes:

rust
pub enum ErrorCode {
    PropertyIdTooLong,
    MetadataUriTooLong,
    LocationTooLong,
    InvalidPrice,
    InvalidOfferAmount,
    InvalidExpirationTime,
    NotPropertyOwner,
    PropertyNotActive,
    CannotOfferOwnProperty,
    OfferNotPending,
    OfferExpired,
    OfferNotAccepted,
    OfferPropertyMismatch,
    NotOfferBuyer,
    InvalidTokenAccount,
    InvalidMarketplaceFeeAccount,
    ArithmeticOverflow,
    InvalidFeePercentage,
    NotNFTOwner,
    InvalidNFTMint,
    EscrowMismatch,
    NFTNotInEscrow,
    InsufficientEscrowFunds,
}


## Development and Testing

### Local Setup
bash
# Clone the repository
git clone <repository-url>
cd real-estate-marketplace

# Install dependencies
yarn install

# Build the program
anchor build

# Run tests
anchor test


### Testing Environment
The contract includes a comprehensive test suite covering all major functions and edge cases:
- Marketplace initialization
- Property listing and updates
- Offer creation and management
- Complete transaction flow

## Roadmap

### Current Version (v0.1.0)
- Core marketplace functionality
- NFT-based property representation
- Offer and escrow system
- Transaction history

### Planned Features
- Multi-signature ownership support
- Fractional property ownership
- Integration with external oracle data
- Enhanced metadata with geographic information
- Property refinancing and collateralization

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contact

For inquiries about integration or collaboration, please contact:
- Email: mailto:your.email@example.com
- Website: https://www.yourcompany.com
- Twitter: @yourcompany

---

Developed by SoluLab. All rights reserved.