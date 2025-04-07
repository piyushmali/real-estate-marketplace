import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

// Function to simulate a transaction using our backend API
export const simulateTransaction = async (
  transaction: string,
  token: string
) => {
  try {
    console.log("Simulating transaction with token:", token ? "Token exists" : "No token");
    
    // Convert transaction to base64 if it's not already in that format
    let serializedTransaction = transaction;
    
    // Check if input looks like base64 already 
    if (!/^[A-Za-z0-9+/=]+$/.test(transaction)) {
      console.log("Transaction doesn't appear to be base64, attempting to encode it");
      try {
        // Try to convert to base64
        serializedTransaction = Buffer.from(transaction).toString('base64');
      } catch (error) {
        console.error("Failed to encode transaction to base64:", error);
      }
    }
    
    const response = await axios.post(
      `${API_URL}/api/transactions/simulate`,
      {
        serialized_transaction: serializedTransaction,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      }
    );
    
    console.log("Transaction simulation result:", response.data);
    return {
      success: true,
      logs: response.data.logs || [],
      ...response.data
    };
  } catch (error) {
    console.error('Error simulating transaction:', error);
    
    // More detailed error logging
    if (axios.isAxiosError(error) && error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      
      return {
        success: false,
        logs: error.response.data?.logs || [],
        error: error.response.data?.error || error.message
      };
    }
    
    return {
      success: false,
      logs: [],
      error: error instanceof Error ? error.message : 'Unknown error during simulation'
    };
  }
};

export const submitTransactionNoUpdate = async (
  transaction: string, 
  token: string, 
  metadata: string = JSON.stringify({})
) => {
  try {
    console.log("Submitting transaction with token:", token ? "Token exists" : "No token");
    console.log("Transaction input:", transaction.substring(0, 100) + "...");
    
    // Convert transaction to base64 if it's not already in that format
    let serializedTransaction = transaction;
    
    // Check if input looks like base64 already 
    if (!/^[A-Za-z0-9+/=]+$/.test(transaction)) {
      console.log("Transaction doesn't appear to be base64, attempting to encode it");
      try {
        // Try to convert to base64
        serializedTransaction = Buffer.from(transaction).toString('base64');
      } catch (error) {
        console.error("Failed to encode transaction to base64:", error);
      }
    }
    
    console.log("Sending serialized_transaction data of length:", serializedTransaction.length);
    
    // Add the metadata field as required by the API
    const payload = {
      serialized_transaction: serializedTransaction,
      metadata
    };
    
    console.log("Sending payload to backend:", {
      endpoint: `${API_URL}/api/transactions/submit-no-update`,
      payloadSize: JSON.stringify(payload).length,
      hasToken: !!token
    });
    
    const response = await axios.post(
      `${API_URL}/api/transactions/submit-no-update`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      }
    );
    
    console.log("Transaction submission successful:", response.data);
    
    // Add success flag if it doesn't exist in the response
    const responseWithSuccess = {
      ...response.data,
      success: true, // Force success to be true if we got here (no errors thrown)
    };
    
    return responseWithSuccess;
  } catch (error) {
    console.error('Error submitting transaction:', error);
    
    // More detailed error logging
    if (axios.isAxiosError(error) && error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    // Return a formatted error response instead of throwing
    return {
      success: false,
      message: axios.isAxiosError(error) && error.response?.data?.message 
        ? error.response.data.message 
        : (error instanceof Error ? error.message : 'Unknown error submitting transaction'),
      error: error
    };
  }
};

export const getRecentBlockhash = async (token: string) => {
  try {
    const response = await axios.get(
      `${API_URL}/api/blockhash`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error getting recent blockhash:', error);
    throw error;
  }
};

export const recordPropertySale = async (
  propertyId: string,
  sellerWallet: string,
  buyerWallet: string,
  price: number,
  transactionSignature: string,
  token: string
) => {
  try {
    console.log(`Recording property sale for property ${propertyId}`);
    console.log(`Seller: ${sellerWallet}`);
    console.log(`Buyer: ${buyerWallet}`);
    console.log(`Price: ${price}`);
    console.log(`Transaction signature: ${transactionSignature}`);
    
    const response = await axios.post(
      `${API_URL}/api/transactions/record-sale`,
      {
        property_id: propertyId,
        seller_wallet: sellerWallet,
        buyer_wallet: buyerWallet,
        price: price,
        transaction_signature: transactionSignature
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      }
    );
    
    console.log("Property sale recorded successfully:", response.data);
    return response.data;
  } catch (error) {
    console.error('Error recording property sale:', error);
    throw error;
  }
};

export const getTransactionHistory = async (token: string) => {
  try {
    console.log("Fetching transaction history");
    
    const response = await axios.get(
      `${API_URL}/api/transactions`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      }
    );
    
    console.log("Transaction history fetched:", response.data);
    return response.data.transactions || [];
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    throw error;
  }
}; 