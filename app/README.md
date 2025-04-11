# Solulab Real Estate Marketplace

A decentralized real estate marketplace built on the Solana blockchain, offering a modern and efficient platform for property transactions.

## 🌟 Features

- **Property Listings**: List and browse real estate properties on the Solana blockchain
- **Secure Transactions**: Powered by Solana's high-performance blockchain
- **Wallet Integration**: Seamless integration with popular Solana wallets
- **Modern UI/UX**: Built with React and Shadcn UI components
- **Real-time Updates**: Live property status and transaction updates
- **Responsive Design**: Optimized for all device sizes

## 🛠 Technical Stack

### Frontend
- **React 18** - Modern UI framework
- **TypeScript** - Type-safe development
- **Vite** - Next-generation frontend tooling
- **Tailwind CSS** - Utility-first CSS framework
- **Shadcn UI** - High-quality UI components
- **React Query** - Powerful data synchronization
- **React Hook Form** - Form handling with validation
- **Framer Motion** - Smooth animations

### Blockchain Integration
- **@solana/web3.js** - Solana blockchain interaction
- **@project-serum/anchor** - Solana smart contract development
- **@solana/wallet-adapter** - Wallet connection and management

### Backend & Database
- **actix ** - Backend server
- **Diesel ** - Database operations
- **PostgreSQL** - Database (via Neon Serverless)

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- Yarn package manager
- Solana CLI tools
- A Solana wallet (Phantom)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd real-estate-marketplace/app
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file with the following:
```env
VITE_SOLANA_RPC_URL=<your-solana-rpc-url>
VITE_BACKEND_URL=<your-database-url>
```

4. Start the development server:
```bash
yarn dev
```

## 🔄 User Flow

### 1. Wallet Connection & Authentication
- **Initial Access**
  - User visits the marketplace platform
  - Clicks on "Connect Wallet" button
  - Chooses between supported wallets (Phantom)
- **Authentication Process**
  - Wallet connection triggers automatic authentication
  - System verifies SOL balance and permissions
  - Creates/retrieves user profile from database

### 2. Property Browsing & Search
- **Homepage Navigation**
  - View featured properties
- **Property Discovery**
  - View property cards with preview information
  - Access detailed property pages

### 3. Property Listing Process
- **Create Listing**
  - Click "List Property" button
  - Complete property information form:
    - Basic details (title, description)
    - Property specifications (size, rooms, amenities)
    - Location details
    - Price 
- **Media Upload**
    - Add property image urls
- **Blockchain Integration**
  - Review listing details
  - Pay listing fee in SOL
  - Sign transaction with connected wallet
  - Confirm blockchain transaction
  - Receive listing confirmation and NFT receipt

### 4. Making & Managing Offers
- **Submit Offer**
  - View property details
  - Click "Make Offer" button
  - Enter offer amount
  - Add contingencies (if any)
  - Sign and submit offer transaction
- **Offer Management**
  - Track offer status in real-time
  - Receive notifications for counter-offers
  - Accept or reject counter-offers
  - View offer history
- **Transaction Process**
  - Review final terms
  - Execute smart contract
  - Complete payment transaction
  - Receive property NFT 

### 5. Property Management Dashboard
- **Seller Features**
  - View all listed properties
  - Track viewing statistics
  - Manage property details and pricing
  - Review and respond to offers
  - Access transaction history
- **Buyer Features**
  - View submitted offers
  - Track favorite properties
  - Access purchase history
  - Manage property documents
- **Notification Center**
  - Receive updates on offers
  - Get transaction confirmations

### 6. Transaction Completion
- **Closing Process**
  - Execute smart contract
  - Transfer funds through escrow
  - Receive confirmation of ownership
- **Post-Transaction**
  - Receive property NFT
  - Get transaction signature

## 🔐 Security

- Secure wallet integration
- Protected API endpoints
- Data encryption
- Smart contract security measures

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the Project
2. Create your Feature Branch
3. Commit your Changes
4. Push to the Branch
5. Open a Pull Request

## 📞 Support

For support, please open an issue in the GitHub repository or contact the development team.
