import axios from 'axios';
import { PublicKey } from '@solana/web3.js';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';
const PROGRAM_ID = new PublicKey('E7v7RResymJU5XvvPA9uwxGSEEsdSE6XvaP7BTV2GGoQ');

// Function to simulate a transaction using our backend API
export const simulateTransaction = async (
  transaction: string | Uint8Array,
  token: string
): Promise<any> => {
  try {
    const transactionBase64 = typeof transaction === 'string' 
      ? transaction 
      : Buffer.from(transaction).toString('base64');

    const response = await axios.post(
      `${API_URL}/api/transactions/simulate`,
      {
        transaction: transactionBase64,
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
    console.error('Error simulating transaction:', error);
    throw error;
  }
};

export const submitTransaction = async (
  transaction: string | Uint8Array,
  token: string
): Promise<string> => {
  try {
    const transactionBase64 = typeof transaction === 'string' 
      ? transaction 
      : Buffer.from(transaction).toString('base64');

    const response = await axios.post(
      `${API_URL}/api/transactions/submit`,
      {
        transaction: transactionBase64,
        program_id: PROGRAM_ID.toString()
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      }
    );
    return response.data.signature;
  } catch (error) {
    console.error('Error submitting transaction:', error);
    throw error;
  }
};

export const submitTransactionNoUpdate = async (
  transaction: string | Uint8Array,
  token: string
): Promise<string> => {
  try {
    const transactionBase64 = typeof transaction === 'string' 
      ? transaction 
      : Buffer.from(transaction).toString('base64');

    const response = await axios.post(
      `${API_URL}/api/transactions/submit-no-update`,
      {
        transaction: transactionBase64,
        program_id: PROGRAM_ID.toString()
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      }
    );
    return response.data.signature;
  } catch (error) {
    console.error('Error submitting transaction:', error);
    throw error;
  }
};

export const getRecentBlockhash = async (token: string): Promise<string> => {
  try {
    const response = await axios.get(
      `${API_URL}/api/blockhash`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      }
    );
    return response.data.blockhash;
  } catch (error) {
    console.error('Error getting recent blockhash:', error);
    throw error;
  }
};

export const recordPropertySale = async (
  propertyId: string,
  buyerWallet: string,
  sellerWallet: string,
  amount: number,
  transactionSignature: string,
  token: string
): Promise<any> => {
  try {
    const response = await axios.post(
      `${API_URL}/api/transactions/record-sale`,
      {
        property_id: propertyId,
        buyer_wallet: buyerWallet,
        seller_wallet: sellerWallet,
        amount: amount,
        transaction_signature: transactionSignature,
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
    console.error('Error recording property sale:', error);
    throw error;
  }
};

export const getTransactionHistory = async (token: string): Promise<any[]> => {
  try {
    const response = await axios.get(
      `${API_URL}/api/transactions`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      }
    );
    return response.data.transactions;
  } catch (error) {
    console.error('Error getting transaction history:', error);
    throw error;
  }
};

export const completeNFTTransfer = async (
  propertyId: string,
  buyerWallet: string,
  sellerWallet: string,
  transactionSignature: string,
  token: string
): Promise<any> => {
  try {
    const response = await axios.post(
      `${API_URL}/api/transactions/complete-transfer`,
      {
        property_id: propertyId,
        buyer_wallet: buyerWallet,
        seller_wallet: sellerWallet,
        transaction_signature: transactionSignature,
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
    console.error('Error completing NFT transfer:', error);
    throw error;
  }
};

export const updatePropertyOwnership = async (
  propertyId: string,
  newOwner: string,
  offerId: string,
  transactionSignature: string,
  token: string
): Promise<any> => {
  try {
    const response = await axios.post(
      `${API_URL}/api/properties/update-ownership`,
      {
        property_id: propertyId,
        new_owner: newOwner,
        offer_id: offerId,
        transaction_signature: transactionSignature,
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
    console.error('Error updating property ownership:', error);
    throw error;
  }
}; 