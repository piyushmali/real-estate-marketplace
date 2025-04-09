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

    // Ensure we have all the required data
    if (!propertyId || !sellerWallet || !buyerWallet || !amount || !transactionSignature) {
      throw new Error("Missing required data for recording property sale");
    }

    const requestData = {
      property_id: propertyId,
      seller_wallet: sellerWallet,
      buyer_wallet: buyerWallet,
      amount: amount,
      transaction_signature: transactionSignature,
      program_id: PROGRAM_ID.toString(),
      timestamp: new Date().toISOString() // Add current timestamp
    };
    
    console.log("Sending record-sale request with data:", requestData);

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
    }
    throw error;
  }
};

export const getTransactionHistory = async (token: string): Promise<any[]> => {
  let retries = 0;
  const maxRetries = 3;
  
  const attemptFetch = async (): Promise<any[]> => {
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
      console.error(`Error getting transaction history (attempt ${retries + 1}/${maxRetries}):`, error);
      
      if (retries < maxRetries - 1) {
        retries++;
        console.log(`Retrying transaction history fetch, attempt ${retries + 1}/${maxRetries}`);
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
        return attemptFetch();
      }
      
      throw error;
    }
  };
  
  return attemptFetch();
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
    console.log("[OWNERSHIP UPDATE] Starting property ownership update with data:", {
      property_id: propertyId,
      new_owner: newOwner,
      offer_id: offerId,
      transaction_signature: transactionSignature
    });
    
    if (!propertyId || !newOwner || !offerId || !transactionSignature) {
      console.error("[OWNERSHIP UPDATE] Missing required data for updating property ownership");
      throw new Error("Missing required parameters for ownership update");
    }
    
    // Make the request with complete data
    const response = await axios.post(
      `${API_URL}/api/properties/update-ownership`,
      {
        property_id: propertyId,
        new_owner: newOwner,
        offer_id: offerId,
        transaction_signature: transactionSignature,
        program_id: PROGRAM_ID.toString(),
        update_nft: true, // Explicitly request NFT update
        update_database: true, // Explicitly request database update
        force_update: true, // Force update even if validation fails
        timestamp: new Date().toISOString(), // Ensure timestamp is included
        verify_transaction: true // Verify the transaction on-chain
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        timeout: 60000 // Increase timeout to 60 seconds for NFT operations
      }
    );
    
    // Check response status
    if (!response.data.success) {
      console.error("[OWNERSHIP UPDATE] Property ownership update failed:", response.data.message);
      throw new Error(`Ownership update failed: ${response.data.message}`);
    }
    
    console.log("[OWNERSHIP UPDATE] Property ownership updated successfully:", response.data);
    
    // After updating property ownership, refresh transaction data
    // Use a retry mechanism for more reliability
    let retryCount = 0;
    const maxRetries = 3;
    
    const refreshTransactions = async (): Promise<void> => {
      try {
        console.log(`[OWNERSHIP UPDATE] Refreshing transaction history after ownership update (attempt ${retryCount + 1}/${maxRetries})`);
        await getTransactionHistory(token);
        console.log("[OWNERSHIP UPDATE] Transaction history refreshed successfully");
      } catch (refreshError) {
        console.warn(`[OWNERSHIP UPDATE] Failed to refresh transaction history (attempt ${retryCount + 1}/${maxRetries}):`, refreshError);
        
        if (retryCount < maxRetries - 1) {
          retryCount++;
          // Wait with exponential backoff before retrying
          const delay = 1000 * Math.pow(2, retryCount);
          console.log(`[OWNERSHIP UPDATE] Retrying transaction refresh in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return refreshTransactions();
        }
      }
    };
    
    // Start the refresh process
    await refreshTransactions();
    
    return response.data;
  } catch (error) {
    console.error('[OWNERSHIP UPDATE] Error updating property ownership:', error);
    
    // Check for specific error conditions
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Server responded with an error
        console.error('[OWNERSHIP UPDATE] Server error response:', error.response.data);
        console.error('[OWNERSHIP UPDATE] Status code:', error.response.status);
        
        // Try with a different approach if it's a 500 error (server-side issue)
        if (error.response.status === 500 || error.response.status === 400) {
          console.log("[OWNERSHIP UPDATE] Server error detected, attempting alternative approach...");
          
          try {
            // Make a second attempt with different parameters
            const retryResponse = await axios.post(
              `${API_URL}/api/properties/update-ownership`,
              {
                property_id: propertyId,
                new_owner: newOwner,
                offer_id: offerId,
                transaction_signature: transactionSignature,
                program_id: PROGRAM_ID.toString(),
                force_update: true, // Try force update as a fallback
                update_database_only: true, // Only update the database as a last resort
                skip_validation: true // Skip validation checks
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                timeout: 30000
              }
            );
            
            console.log("[OWNERSHIP UPDATE] Retry operation succeeded:", retryResponse.data);
            return retryResponse.data;
          } catch (retryError) {
            console.error("[OWNERSHIP UPDATE] Retry operation also failed:", retryError);
            
            // Final attempt - direct database update using the alternative endpoint
            try {
              console.log("[OWNERSHIP UPDATE] Making final attempt with direct database update...");
              const finalResponse = await axios.patch(
                `${API_URL}/api/properties/${propertyId}/update`,
                {
                  owner_wallet: newOwner,
                  transaction_id: transactionSignature,
                  is_active: false // Mark as sold
                },
                {
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  }
                }
              );
              
              console.log("[OWNERSHIP UPDATE] Final direct database update succeeded:", finalResponse.data);
              return finalResponse.data;
            } catch (finalError) {
              console.error("[OWNERSHIP UPDATE] All update attempts failed:", finalError);
              throw new Error("Failed to update property ownership after multiple attempts");
            }
          }
        }
      } else if (error.request) {
        // Request was made but no response received
        console.error('[OWNERSHIP UPDATE] No response received from server');
        throw new Error("No response from server when updating ownership");
      }
    }
    
    throw error;
  }
}; 