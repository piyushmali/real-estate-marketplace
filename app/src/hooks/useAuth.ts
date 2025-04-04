// src/hooks/useAuth.ts
import { useState, useCallback, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import bs58 from 'bs58';

// JWT payload interface
interface JWTPayload {
  sub: string; // public key
  exp: number; // expiration time
  iat: number; // issued at time
}

// Authentication payload for backend
interface AuthPayload {
  public_key: string;
  signature: string;
  timestamp: number;
}

// API URL with fallback
const API_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8080";

export const useAuth = () => {
  const { connected, publicKey } = useWallet();
  const [token, setToken] = useState<string | null>(getToken());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check if token is valid on initial load and when token changes
  useEffect(() => {
    if (token) {
      // Check token validity
      if (isValidToken()) {
        setIsAuthenticated(true);
        
        // Verify that the token belongs to the currently connected wallet
        if (connected && publicKey) {
          const payload = parseJwt(token);
          if (payload && payload.sub !== publicKey) {
            console.warn("Token belongs to a different wallet. Clearing token.");
            logout();
          }
        }
      } else {
        setIsAuthenticated(false);
        clearToken(); // Clear invalid token
      }
    } else {
      setIsAuthenticated(false);
    }
  }, [token, connected, publicKey]);

  // Check wallet connection and token validity
  useEffect(() => {
    const checkAuthentication = () => {
      // If wallet is connected but not authenticated
      if (connected && publicKey) {
        // Check if we have a valid token
        if (!isAuthenticated) {
          // Check if a token exists but wasn't validated yet
          const existingToken = getToken();
          if (existingToken) {
            // Validate the token for this wallet
            const payload = parseJwt(existingToken);
            if (payload && payload.sub === publicKey && isValidToken()) {
              // Token is valid for this wallet
              setToken(existingToken);
              setIsAuthenticated(true);
              console.log("Found valid token, auto-authenticated");
            } else {
              // Token is invalid or for different wallet, clear it
              clearToken();
            }
          }
        }
      }
    };

    checkAuthentication();
  }, [connected, publicKey, isAuthenticated]);

  // Clear authentication if wallet disconnects
  useEffect(() => {
    if (!connected && token) {
      logout();
    }
  }, [connected]);

  const authenticate = useCallback(async () => {
    if (!connected) {
      setError("Please connect your wallet first.");
      return;
    }

    if (!publicKey) {
      setError("Cannot authenticate without a wallet public key.");
      return;
    }

    // Check if we already have a valid token for this wallet
    if (isAuthenticated && token) {
      // Extract wallet address from token
      const payload = parseJwt(token);
      if (payload && payload.sub === publicKey) {
        console.log("Already authenticated with this wallet");
        return; // Already authenticated with this wallet
      }
    }

    setLoading(true);
    setError(null);

    try {
      const payload = await signWithPhantom();
      
      // Verify the payload belongs to the connected wallet
      if (payload.public_key !== publicKey) {
        throw new Error("Wallet mismatch. Please ensure you're using the connected wallet.");
      }
      
      const jwtToken = await authenticateWithBackend(payload);
      
      // Verify the JWT token was received
      if (!jwtToken) {
        throw new Error("No token received from server");
      }
      
      storeToken(jwtToken);
      setToken(jwtToken);
      setIsAuthenticated(true);
      
      console.log("Authentication successful");
    } catch (err: any) {
      console.error("Authentication error:", err);
      const errorMessage = err.message || "Authentication failed.";
      setError(errorMessage);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, [connected, publicKey, isAuthenticated, token]);

  const logout = useCallback(() => {
    clearToken();
    setToken(null);
    setIsAuthenticated(false);
    setError(null);
  }, []);

  return { 
    token, 
    authenticate, 
    logout, 
    error, 
    loading, 
    connected, 
    isAuthenticated,
    publicKey
  };
};

// Sign message using Phantom wallet
const signWithPhantom = async (): Promise<AuthPayload> => {
  try {
    const { solana } = window as any;
    
    if (!solana?.isPhantom) {
      throw new Error("Phantom wallet not detected");
    }
    
    const publicKey = solana.publicKey.toString();
    const timestamp = Date.now();
    // Use the exact message format expected by the backend - "Timestamp: {timestamp}"
    const message = `Timestamp: ${timestamp}`;
    
    // Convert message to bytes
    const messageBytes = new TextEncoder().encode(message);
    
    // Sign message with Phantom
    const { signature } = await solana.signMessage(messageBytes, "utf8");
    
    // Convert signature to base58 string to match backend expectation
    const signatureBase58 = bs58.encode(Buffer.from(signature));
    
    console.log("Signature:", signatureBase58);
    
    const payload = {
      public_key: publicKey,
      signature: signatureBase58,
      timestamp,
    };
    
    console.log("Auth payload:", payload);
    return payload;
  } catch (error) {
    console.error("Error signing message with Phantom:", error);
    throw error;
  }
};

const authenticateWithBackend = async (payload: AuthPayload): Promise<string> => {
  console.log("Sending authentication request to backend:", payload);
  
  try {
    console.log("Backend API URL:", API_URL);
    const response = await fetch(`${API_URL}/api/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log("Response status:", response.status);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Authentication failed with status ${response.status}`);
    }
    
    const data = await response.json();
    console.log("Authentication response:", data);
    
    if (!data.token) {
      throw new Error("No token in response");
    }
    
    return data.token;
  } catch (error) {
    console.error("Authentication request failed:", error);
    throw error;
  }
};

// Store JWT token and wallet address in local storage
const storeToken = (token: string): void => {
  localStorage.setItem("jwt_token", token);
  
  // Store wallet address for token validation
  const payload = parseJwt(token);
  if (payload && payload.sub) {
    localStorage.setItem("wallet_address", payload.sub);
  }
};

// Clear JWT token and wallet address from local storage
const clearToken = (): void => {
  localStorage.removeItem("jwt_token");
  localStorage.removeItem("wallet_address");
};

// Parse JWT without verification
const parseJwt = (token: string): JWTPayload | null => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Error parsing JWT:", error);
    return null;
  }
};

// Utility to retrieve JWT from local storage
const getToken = (): string | null => {
  return localStorage.getItem("jwt_token");
};

// Check if token is valid and not expired
const isValidToken = (): boolean => {
  const token = getToken();
  if (!token) return false;
  
  try {
    const payload = parseJwt(token);
    if (!payload) return false;
    
    // Check if token is expired
    const currentTime = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < currentTime) {
      console.log("Token expired");
      return false;
    }
    
    // Check if token matches connected wallet
    const storedWalletAddress = localStorage.getItem("wallet_address");
    if (payload.sub !== storedWalletAddress) {
      console.log("Token wallet mismatch");
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("Error validating token:", error);
    return false;
  }
};