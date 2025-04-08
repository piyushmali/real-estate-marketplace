import axios from 'axios';
import { Offer } from '../types/offer';
import { PublicKey } from '@solana/web3.js';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';
const PROGRAM_ID = new PublicKey('E7v7RResymJU5XvvPA9uwxGSEEsdSE6XvaP7BTV2GGoQ');

export const createOffer = async (
  propertyId: string, 
  amount: number, 
  expirationDays: number, 
  token: string,
  buyerWallet: string
): Promise<Offer> => {
  try {
    console.log("Creating offer with token:", token ? "Token exists" : "No token");
    console.log(`Creating offer for ${propertyId} with amount ${amount} SOL and expiration ${expirationDays} days`);

    // Convert SOL to lamports (1 SOL = 1,000,000,000 lamports)
    const amountInLamports = Math.floor(amount * 1_000_000_000);
    
    console.log(`Amount in lamports: ${amountInLamports}`);
    
    const response = await axios.post(
      `${API_URL}/api/offers`,
      {
        property_id: propertyId,
        amount: amountInLamports,
        expiration_days: expirationDays,
        buyer_wallet: buyerWallet,
        program_id: PROGRAM_ID.toString()
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      }
    );
    return response.data.offer;
  } catch (error) {
    console.error('Error creating offer:', error);
    throw error;
  }
};

export const updateOffer = async (offerId: string, status: 'accepted' | 'rejected' | 'expired', token: string): Promise<Offer> => {
  try {
    const response = await axios.patch(
      `${API_URL}/api/offers/${offerId}`,
      {
        status,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error updating offer:', error);
    throw error;
  }
};

// Fetch user's offers
export const getUserOffers = async (token: string): Promise<Offer[]> => {
  try {
    console.log("Fetching user offers with token:", token ? "Token exists" : "No token");
    
    const response = await axios.get(
      `${API_URL}/api/offers/my-offers`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      }
    );
    
    if (response.data && response.data.success) {
      return response.data.offers || [];
    } else {
      console.warn("Unexpected response format:", response.data);
      return [];
    }
  } catch (error) {
    console.error('Error fetching offers:', error);
    throw error;
  }
};

// Respond to an offer (accept or reject) - called after blockchain transaction
export const respondToOffer = async (
  offerId: string, 
  status: 'accepted' | 'rejected', 
  transactionSignature: string | null,
  token: string,
  sellerWallet: string
): Promise<any> => {
  try {
    console.log(`Responding to offer ${offerId} with status: ${status}`);
    
    const response = await axios.post(
      `${API_URL}/api/offers/${offerId}/respond`,
      {
        status,
        transaction_signature: transactionSignature,
        seller_wallet: sellerWallet,
        program_id: PROGRAM_ID.toString()
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error responding to offer:', error);
    throw error;
  }
};

// Fetch offers for a specific property (for property owners only)
export const getPropertyOffers = async (propertyId: string, token: string): Promise<Offer[]> => {
  try {
    console.log(`Fetching offers for property: ${propertyId}`);
    
    const response = await axios.get(
      `${API_URL}/api/properties/${propertyId}/offers`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      }
    );
    
    if (response.data && response.data.success) {
      return response.data.offers || [];
    } else {
      console.warn("Unexpected response format:", response.data);
      return [];
    }
  } catch (error) {
    console.error('Error fetching property offers:', error);
    throw error;
  }
}; 