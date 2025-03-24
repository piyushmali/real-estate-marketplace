# Real Estate Marketplace on Solana

## Overview
The Real Estate Marketplace leverages Solana's high throughput and low-cost transactions to facilitate property trading. Property ownership is tokenized as NFTs, and transactions are managed through a smart contract written in Rust using Anchor. Key functionalities include marketplace initialization, property listing, updates, offers, and sales, with a configurable fee structure.

---

## Features
- **Marketplace Initialization**: Set up with an authority and fee percentage.
- **Property Listing**: List properties as NFTs with detailed metadata.
- **Property Updates**: Modify listing details (price, status, etc.).
- **Offer System**: Buyers can make time-bound offers on properties.
- **Sale Execution**: Finalize sales with token and NFT transfers.
- **Fee Structure**: Marketplace takes a percentage of each sale (e.g., 1%).

---

## End-to-End Flow
Below is the step-by-step process of how the Real Estate Marketplace operates, from setup to sale completion.

### Step 1: Marketplace Initialization
- **Actor**: Marketplace Authority (Admin)
- **Action**: Initialize the marketplace with a fee (e.g., 1% = 100 basis points).
- **Process**:
  1. Call `initialize_marketplace` with `marketplace_fee`.
  2. Creates a `Marketplace` PDA with `authority`, `properties_count = 0`, and `fee_percentage`.
  3. Validates `marketplace_fee <= 10000`.
- **Outcome**: Marketplace is ready for property listings.

### Step 2: Listing a Property
- **Actor**: Property Owner
- **Action**: List a property with details and mint an NFT.
- **Process**:
  1. Call `list_property` with `property_id` (e.g., "Property123"), `price` (e.g., 1M lamports), `metadata_uri`, etc.
  2. Mints an NFT and creates a `Property` PDA with ownership and metadata.
  3. Increments `properties_count` in the marketplace.
  4. Validates input lengths and price.
- **Outcome**: Property is listed, and the owner receives the NFT.

### Step 3: Updating a Property
- **Actor**: Property Owner
- **Action**: Update listing details (e.g., price to 1.5M lamports).
- **Process**:
  1. Call `update_property` with optional `price`, `metadata_uri`, or `is_active`.
  2. Verifies NFT ownership and updates the `Property` account.
  3. Validates new values (e.g., `price > 0`).
- **Outcome**: Property details are updated.

### Step 4: Making an Offer
- **Actor**: Buyer
- **Action**: Submit an offer (e.g., 900K lamports, 24-hour expiration).
- **Process**:
  1. Call `make_offer` with `offer_amount` and `expiration_time`.
  2. Creates an `Offer` PDA with `status = Pending`.
  3. Validates property is active and buyer isn’t the owner.
- **Outcome**: Offer is recorded and awaits response.

### Step 5: Responding to an Offer
- **Actor**: Property Owner
- **Action**: Accept or reject the offer.
- **Process**:
  1. Call `respond_to_offer` with `accept = true/false`.
  2. Checks offer is pending and not expired.
  3. Updates `status` to `Accepted` or `Rejected`.
- **Outcome**: Offer is accepted (proceeds to sale) or rejected.

### Step 6: Executing the Sale
- **Actors**: Buyer and Property Owner (Seller)
- **Action**: Finalize the sale, transferring payment and NFT.
- **Process**:
  1. Call `execute_sale`.
  2. Verifies offer is accepted and transfers:
     - 891K lamports to seller (99%).
     - 9K lamports to marketplace (1% fee).
     - NFT to buyer.
  3. Updates `Property` ownership, deactivates listing, and logs transaction history.
- **Outcome**: Buyer owns the property; seller and marketplace are paid.

### Flow Summary
1. **Setup**: Authority initializes marketplace (1% fee).
2. **List**: Owner lists "Property123" for 1M lamports, gets NFT.
3. **Update**: Owner updates price to 1.5M lamports.
4. **Offer**: Buyer offers 900K lamports (24h expiration).
5. **Response**: Owner accepts offer.
6. **Sale**: Buyer pays 900K, gets NFT; seller gets 891K, marketplace gets 9K.

---

## Installation
### Prerequisites
- Solana CLI (`solana --version`)
- Rust and Cargo (`rustc --version`)
- Anchor CLI (`anchor --version`)
- Node.js and npm (`node --version`)

### Steps
1. **Clone the Repository**:
   ```bash
   git clone https://github.com/piyushmali/real-estate-marketplace.git
   cd real-estate-marketplace
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Build the Project**:
   ```bash
   anchor build
   ```

---

## Usage
### Deploy to Solana
```bash
anchor deploy
```

### Run the Program
1. **Initialize Marketplace**:
   - Use the authority wallet to set a fee (e.g., 100).
2. **List a Property**:
   - Provide property details and mint an NFT.
3. **Interact**:
   - Update properties, make offers, respond, and execute sales via program instructions.

---

## Testing
Run the test suite to verify functionality:
```bash
anchor test
```
- Tests cover initialization, listing, updates, offers, and sales.
- Uses Mocha/Chai and Solana Web3.js.

---

## Contributing
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/new-feature`).
3. Commit changes (`git commit -m "Add new feature"`).
4. Push to the branch (`git push origin feature/new-feature`).
5. Open a Pull Request.

---

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

