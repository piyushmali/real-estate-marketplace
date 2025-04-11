# Solulab Real Estate Marketplace Backend

A robust backend service for the Solana Real Estate Marketplace, providing a secure and efficient REST API for managing real estate transactions on the Solana blockchain.

## 🌟 Features

- **Blockchain Integration**
  - Solana smart contract interaction
  - Transaction preparation and submission

- **Property Management**
  - Property listing creation and management
  - Offer management system

- **Security**
  - Wallet signature authentication
  - JWT-based session management

- **Data Management**
  - PostgreSQL integration for off-chain data
  - Real-time updates via WebSocket
  - Automated backup systems

## 🛠 Prerequisites

- Rust (latest stable version)
- Solana CLI tools (v1.17 or later)
- PostgreSQL (14.0 or later)

## 🚀 Setup and Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd real-estate-marketplace/backend
```

2. Install dependencies:
```bash
cargo build
```

3. Configure environment variables in `.env`:
```env
# Database Configuration
DATABASE_URL=postgres://<username>:<password>@localhost/real_estate_db

# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
ADMIN_PRIVATE_KEY=<your-admin-private-key>

# Security
JWT_SECRET=<your-jwt-secret>

# Server Configuration
PORT=8080
```

> ⚠️ **Security Note**: 
> - Never commit your actual `ADMIN_PRIVATE_KEY` to version control
> - Keep your `JWT_SECRET` secure and use a strong random value in production
> - Use environment-specific database credentials

4. Run database migrations:
```bash
diesel migration run
```

5. Start the server:
```bash
cargo run
```

## 📡 API Endpoints 

### Authentication
- **POST /api/auth/connect**: Connect wallet and authenticate
- **POST /api/auth/verify**: Verify wallet signature
- **POST /api/auth/refresh**: Refresh JWT token

### Property Management [DB endpoints]
- **GET /api/properties**: List all properties
- **POST /api/properties**: Create new property listing
- **GET /api/properties/{id}**: Get property details
- **PUT /api/properties/{id}**: Update property listing
- **DELETE /api/properties/{id}**: Remove property listing

### Offer Management [DB endpoints]
- **POST /api/offers**: Submit new offer
- **GET /api/offers/{id}**: Get offer details
- **PUT /api/offers/{id}**: Update offer
- **POST /api/offers/{id}/accept**: Accept offer
- **POST /api/offers/{id}/reject**: Reject offer

### Transaction Management [Blockchain endpoints]
- **POST /api/transactions/prepare**: Prepare transaction
- **POST /api/transactions/submit**: Submit signed transaction
- **GET /api/transactions/{id}**: Get transaction status

## 🔄 Transaction Flow

### Property Listing Flow
1. **Property Creation**
   - Backend validates the property information
   - Backend creates property NFT on Solana blockchain
   - Backend stores property metadata in PostgreSQL database
   - Backend returns listing confirmation to Seller

2. **Property Verification**
   - Ownership verification 
   - Property metadata validation
   - NFT minting confirmation

### Offer and Purchase Flow
1. **Offer Submission**
   - Buyer submits offer details to Backend
   - Backend validates offer parameters (price, terms)
   - Backend creates offer record in database

2. **Offer Processing**
   - Seller receives offer notification
   - Review offer terms and conditions
   - Accept/Reject/Counter offer options
   - Automatic escrow management

3. **Transaction Execution**
   - Seller accepts offer through Backend
   - Backend validates acceptance conditions
   - Backend prepares Solana transaction for property transfer
   - Buyer confirms and signs transaction
   - Backend processes transaction on Solana blockchain
   - Backend updates property ownership records
   - Backend updates the transaction history.
   
   
### Technical Implementation Details

1. **Escrow Management**
   - Automatic escrow account creation
   - Multi-signature requirement
   - Time-locked transactions
   - Dispute resolution mechanism

2. **State Management**
   ```
   Property States:
   - LISTED
   - OFFER_RECEIVED
   - UNDER_CONTRACT
   - ESCROW_FUNDED
   - COMPLETING_SALE
   - SOLD
   ```

3. **Security Checkpoints**
   - Transaction signature verification
   - Account ownership validation
   - Balance verification
   - Duplicate transaction prevention

### Error Handling and Recovery

1. **Transaction Failures**
   - Automatic rollback mechanisms
   - Fund return process
   - State recovery procedures

### Monitoring and Validation

1. **Transaction Monitoring**
   - Real-time status updates
   - Blockchain confirmation tracking
   - Gas fee optimization
   - Performance metrics

2. **Validation Checkpoints**
   ```
   Pre-Transaction Checks:
   ✓ Sufficient funds
   ✓ Account permissions
   ✓ Property availability
   ✓ Legal requirements
   ```

### Gas Fee Management

1. **Optimization Strategies**
   - Batch processing
   - Off-peak execution
   - Transaction compression
   - Priority levels

## 🏗 Architecture

```
src/
├── api/           # API route handlers
├── models/        # Data models and schema
├── services/      # Business logic
├── blockchain/    # Solana interaction
├── config/        # Configuration management
├── middleware/    # Custom middleware
└── utils/         # Helper functions
```

## 🔒 Security Measures

- Wallet signature verification for authentication
- Rate limiting per IP and wallet address
- Input validation and sanitization
- CORS configuration
- Request size limiting
- SQL injection prevention
- XSS protection


### Production Considerations
- Use production-grade PostgreSQL setup
- Configure proper SSL/TLS
- Set up monitoring and logging
- Implement backup strategies
- Configure proper firewall rules

## 📊 Monitoring and Logging

- Structured logging with `tracing`
- Prometheus metrics endpoint
- Health check endpoint
- Error tracking integration
- Performance monitoring

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and queries:
- Open an issue in the repository
- Contact the development team
- Check documentation in `/docs` 