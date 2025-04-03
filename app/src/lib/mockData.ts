// src/lib/mockData.ts
import { PublicKey } from '@solana/web3.js';

export interface Property {
  property_id: string;
  price: number;
  metadata_uri: string;
  location: string;
  square_feet: number;
  bedrooms: number;
  bathrooms: number;
  owner: PublicKey;
  is_active: boolean;
  created_at: number;
  updated_at: number;
  nft_mint: PublicKey;
}

export interface Offer {
  offer_id: string;
  buyer: PublicKey;
  property: Property;
  amount: number;
  status: 'Pending' | 'Accepted' | 'Rejected' | 'Completed' | 'Expired';
  created_at: number;
  updated_at: number;
  expiration_time: number;
}

// Generate mock wallet addresses with valid base58-encoded public keys
const mockWallets = [
  'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
  '2q7pyhPwAwZ3QMfZrnAbDhnh9mDUqycszcpf86VgQxhD',
  '3rULXe4mYVB6tkB5EZexNQEJv6DQtKjZqxEBqRt8h6cU',
].map(address => {
  try {
    return new PublicKey(address);
  } catch (error) {
    console.error(`Error creating PublicKey for address ${address}:`, error);
    // Return a known valid public key as fallback
    return new PublicKey('11111111111111111111111111111111');
  }
});

// Generate mock properties
export const mockProperties: Property[] = [
  {
    property_id: 'PROP-1',
    price: 250000,
    metadata_uri: 'https://picsum.photos/400/300',
    location: 'Downtown Manhattan, NY',
    square_feet: 1200,
    bedrooms: 2,
    bathrooms: 2,
    owner: mockWallets[0],
    is_active: true,
    created_at: Date.now() - 7 * 24 * 60 * 60 * 1000,
    updated_at: Date.now() - 7 * 24 * 60 * 60 * 1000,
    nft_mint: new PublicKey('44UDdtpnwkgeMRe7UNBKAqQXHtXQM4hsw8mzqGvQiPRz'),
  },
  {
    property_id: 'PROP-2',
    price: 450000,
    metadata_uri: 'https://picsum.photos/400/300',
    location: 'Beverly Hills, CA',
    square_feet: 2500,
    bedrooms: 4,
    bathrooms: 3,
    owner: mockWallets[1],
    is_active: true,
    created_at: Date.now() - 14 * 24 * 60 * 60 * 1000,
    updated_at: Date.now() - 14 * 24 * 60 * 60 * 1000,
    nft_mint: new PublicKey('55YUBxTD4JbbrGfARCY9h5onvq3W4QWxCxDGPiSaVKgm'),
  },
  {
    property_id: 'PROP-3',
    price: 350000,
    metadata_uri: 'https://picsum.photos/400/300',
    location: 'Miami Beach, FL',
    square_feet: 1800,
    bedrooms: 3,
    bathrooms: 2,
    owner: mockWallets[2],
    is_active: true,
    created_at: Date.now() - 21 * 24 * 60 * 60 * 1000,
    updated_at: Date.now() - 21 * 24 * 60 * 60 * 1000,
    nft_mint: new PublicKey('66nkB3MJPYFjzfDN4VnHgQdnRzwKkDUwTGhSKZxv6PUy'),
  },
];

// Generate mock offers
export const mockOffers: Offer[] = [
  {
    offer_id: 'OFFER-1',
    buyer: mockWallets[1],
    property: mockProperties[0],
    amount: 240000,
    status: 'Pending',
    created_at: Date.now() - 2 * 24 * 60 * 60 * 1000,
    updated_at: Date.now() - 2 * 24 * 60 * 60 * 1000,
    expiration_time: Date.now() + 5 * 24 * 60 * 60 * 1000,
  },
  {
    offer_id: 'OFFER-2',
    buyer: mockWallets[2],
    property: mockProperties[0],
    amount: 245000,
    status: 'Pending',
    created_at: Date.now() - 1 * 24 * 60 * 60 * 1000,
    updated_at: Date.now() - 1 * 24 * 60 * 60 * 1000,
    expiration_time: Date.now() + 6 * 24 * 60 * 60 * 1000,
  },
];