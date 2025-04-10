import axios from 'axios';
import { PublicKey } from '@solana/web3.js';
import { Connection } from '@solana/web3.js';

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

export const getRecentBlockhash = async (token: string): Promise<{blockhash: string}> => {
  try {
    console.log("Fetching blockhash from API...");
    const response = await axios.get(
      `${API_URL}/api/blockhash`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      }
    );
    
    console.log("Blockhash API response:", response.data);
    
    if (!response.data || !response.data.blockhash) {
      console.error("Invalid blockhash response:", response.data);
      throw new Error('Invalid blockhash response from server');
    }
    
    return { blockhash: response.data.blockhash };
  } catch (error) {
    console.error('Error getting recent blockhash from backend:', error);
    
    // Fallback: Try to get blockhash directly from Solana
    try {
      console.log("Attempting to get blockhash directly from Solana...");
      const connection = new Connection("https://api.devnet.solana.com", "confirmed");
      const { blockhash } = await connection.getLatestBlockhash();
      console.log("Got blockhash directly from Solana:", blockhash);
      return { blockhash };
    } catch (solanaError) {
      console.error('Error getting blockhash from Solana:', solanaError);
      throw new Error('Failed to get blockhash from both backend and Solana');
    }
  }
};

export const recordPropertySale = async (
  propertyId: string,
  sellerWallet: string,
  buyerWallet: string,
  amount: number,
  transactionSignature: string,
  token: string
): Promise<any> => {
  try {
    console.log("Recording property sale in database with the following details:");
    console.log("- Property ID:", propertyId);
    console.log("- Seller wallet:", sellerWallet);
    console.log("- Buyer wallet:", buyerWallet);
    console.log("- Amount:", amount);
    console.log("- Transaction signature:", transactionSignature);

    // Ensure we have all the required data and convert to correct types
    if (!propertyId || !sellerWallet || !buyerWallet || !transactionSignature) {
      throw new Error("Missing required data for recording property sale");
    }

    // Ensure amount is a valid number
    const numericAmount = typeof amount === 'number' ? amount : parseFloat(String(amount));
    if (isNaN(numericAmount)) {
      console.error("Invalid amount value:", amount);
      throw new Error("Amount must be a valid number");
    }

    const requestData = {
      property_id: propertyId,
      seller_wallet: sellerWallet,
      buyer_wallet: buyerWallet,
      price: numericAmount,
      transaction_signature: transactionSignature,
      program_id: PROGRAM_ID.toString(),
      timestamp: new Date().toISOString(), // Add current timestamp
      deduplicate: true // Add a flag to prevent duplicate entries
    };
    
    console.log("Sending record-sale request with data:", requestData);
    console.log("Request JSON:", JSON.stringify(requestData));

    const response = await axios.post(
      `${API_URL}/api/transactions/record-sale`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      }
    );
    
    console.log("Property sale recorded successfully:", response.data);
    
    // Explicitly fetch updated transaction history to ensure Transactions page will update
    try {
      await getTransactionHistory(token);
      console.log("Transaction history refreshed after recording sale");
    } catch (historyError) {
      console.warn("Failed to refresh transaction history after recording sale:", historyError);
    }
    
    return response.data;
  } catch (error) {
    console.error('Error recording property sale:', error);
    // More detailed error logging
    if (axios.isAxiosError(error) && error.response) {
      console.error('Server response:', error.response.data);
      console.error('Status code:', error.response.status);
      console.error('Request data:', error.config?.data);
    }
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
    
    console.log("Raw transaction data:", response.data.transactions);
    
    // Process transactions to add status information
    const transactions = response.data.transactions.map((tx: any) => {
      // For now all transactions from database are considered confirmed
      return {
        ...tx,
        status: 'confirmed'
      };
    });
    
    console.log("Processed transaction data:", transactions);
    return transactions;
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
  offerId: string | number,
  transactionSignature: string,
  token: string
): Promise<any> => {
  try {
    // Ensure offerId is a valid string
    const offerIdString = offerId?.toString() || "";
    if (!offerIdString) {
      console.error("Invalid offer ID:", offerId);
      throw new Error("Invalid offer ID for ownership update");
    }
    
    // Format the offer ID - Try to ensure it's a valid UUID format if it's not already
    // This handles UUIDs with or without hyphens
    let formattedOfferId = offerIdString;
    if (offerIdString.length === 32 && !offerIdString.includes('-')) {
      // Convert to standard UUID format with hyphens
      formattedOfferId = `${offerIdString.substring(0, 8)}-${offerIdString.substring(8, 12)}-${offerIdString.substring(12, 16)}-${offerIdString.substring(16, 20)}-${offerIdString.substring(20)}`;
      console.log("Converted plain UUID to formatted UUID:", formattedOfferId);
    }
    
    // Log full request data for debugging
    const requestData = {
      property_id: propertyId,
      new_owner: newOwner,
      offer_id: formattedOfferId,
      transaction_signature: transactionSignature,
      program_id: PROGRAM_ID.toString(),
      deduplicate: true // Add a flag to prevent duplicate entries
    };
    
    console.log("Updating property ownership with data:", requestData);
    console.log("Request JSON:", JSON.stringify(requestData));
    
    // Validate that all fields are present and have the correct types
    if (!propertyId || !newOwner || !formattedOfferId || !transactionSignature) {
      console.error("Missing required fields for property ownership update", requestData);
      throw new Error("Missing required fields for property ownership update");
    }
    
    console.log("Sending update-ownership request to:", `${API_URL}/api/properties/update-ownership`);
    
    const response = await axios.post(
      `${API_URL}/api/properties/update-ownership`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      }
    );
    
    console.log("Property ownership updated successfully:", response.data);
    console.log("Backend response status:", response.status);
    
    // Add a verification step to check if the offer was marked as completed
    try {
      console.log("Verifying offer status was updated to completed...");
      // Get user's offers (since there's no direct offer lookup endpoint)
      const verifyResponse = await axios.get(
        `${API_URL}/api/offers/my-offers`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
        }
      );
      
      if (verifyResponse.data && verifyResponse.data.offers) {
        // Find the specific offer by ID
        const offerData = verifyResponse.data.offers.find((o: any) => 
          o.id === formattedOfferId || o.id.toString() === formattedOfferId
        );
        
        if (offerData) {
          console.log("Found offer after update, current status:", offerData.status);
          if (offerData.status !== 'completed') {
            console.warn("⚠️ Offer status is not 'completed' after ownership update!");
            console.warn("Current status is:", offerData.status);
          } else {
            console.log("✅ Offer status confirmed as 'completed'");
          }
        } else {
          console.warn("⚠️ Could not find offer in user's offers list after update");
          console.log("Looking for offer ID:", formattedOfferId);
          console.log("Available offer IDs:", verifyResponse.data.offers.map((o: any) => o.id).join(", "));
        }
      }
    } catch (verifyError) {
      console.warn("Unable to verify offer status:", verifyError);
    }
    
    // After updating property ownership, refresh transaction data
    try {
      console.log("Refreshing transaction history after ownership update");
      await getTransactionHistory(token);
      console.log("Transaction history refreshed successfully");
    } catch (refreshError) {
      console.warn("Failed to refresh transaction history:", refreshError);
      // Non-blocking error
    }
    
    return response.data;
  } catch (error) {
    console.error('Error updating property ownership:', error);
    
    // Add more detailed error logging
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error('Server response:', error.response.data);
        console.error('Status code:', error.response.status);
        console.error('Headers:', error.response.headers);
        
        // Check for specific error strings related to UUID format
        const responseData = error.response.data;
        if (typeof responseData === 'string' && responseData.includes('UUID')) {
          console.error('UUID FORMAT ERROR DETECTED! Try manually formatting the UUID');
        }
      } else if (error.request) {
        console.error('No response received:', error.request);
      } else {
        console.error('Error setting up request:', error.message);
      }
    }
    
    throw error;
  }
}; 