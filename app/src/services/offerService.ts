import axios from 'axios';
import { Offer } from '../types/offer';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

export const createOffer = async (propertyId: string, amount: number, expirationDays: number, token: string): Promise<Offer> => {
  try {
    console.log("Creating offer with token:", token ? "Token exists" : "No token");
    
    const response = await axios.post(
      `${API_URL}/api/offers`,
      {
        property_id: propertyId,
        amount,
        expiration_days: expirationDays,
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