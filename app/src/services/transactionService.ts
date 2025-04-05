import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

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
    return response.data;
  } catch (error) {
    console.error('Error submitting transaction:', error);
    
    // More detailed error logging
    if (axios.isAxiosError(error) && error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    throw error;
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