// src/lib/auth.ts
import bs58 from "bs58";

export interface AuthPayload {
  public_key: string;
  signature: string;
  timestamp: number;
}

export interface JWTPayload {
  sub: string; // wallet address
  exp: number; // expiration timestamp
}

export const signWithPhantom = async (): Promise<AuthPayload> => {
  if (!window.solana || !window.solana.isPhantom) {
    throw new Error("Phantom wallet not found. Please install Phantom.");
  }

  // Connect to Phantom
  if (!window.solana.isConnected) {
    await window.solana.connect();
  }

  const publicKey = window.solana.publicKey.toBase58();
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `Timestamp: ${timestamp}`;

  console.log("Signing message:", message);
  console.log("Public key:", publicKey);

  // Sign the message
  const encodedMessage = new TextEncoder().encode(message);
  const signedMessage = await window.solana.signMessage(encodedMessage, "utf8");
  const signatureBase58 = bs58.encode(signedMessage.signature);
  
  console.log("Signature:", signatureBase58);
  
  const payload = {
    public_key: publicKey,
    signature: signatureBase58,
    timestamp,
  };
  
  console.log("Auth payload:", payload);
  return payload;
};

export const authenticateWithBackend = async (payload: AuthPayload): Promise<string> => {
  console.log("Sending authentication request to backend:", payload);
  
  try {
    const response = await fetch("http://localhost:8080/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log("Response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Authentication failed:", errorText);
      throw new Error(`Authentication failed: ${response.statusText}. ${errorText}`);
    }

    const result = await response.json();
    console.log("Authentication successful:", result);
    return result.token;
  } catch (error) {
    console.error("Error during authentication:", error);
    throw error;
  }
};

// Utility to store JWT in local storage with the associated wallet address
export const storeToken = (token: string) => {
  try {
    // Store the token
    localStorage.setItem("jwt_token", token);
    
    // Extract and store the wallet address from the token if possible
    const payload = parseJwt(token);
    if (payload && payload.sub) {
      localStorage.setItem("wallet_address", payload.sub);
      console.log("Stored token for wallet:", payload.sub);
    }
    
    console.log("Token stored successfully");
  } catch (error) {
    console.error("Error storing token:", error);
  }
};

// Parse JWT without verification
export const parseJwt = (token: string): JWTPayload | null => {
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
export const getToken = (): string | null => {
  return localStorage.getItem("jwt_token");
};

// Utility to clear JWT from local storage (e.g., on logout)
export const clearToken = () => {
  localStorage.removeItem("jwt_token");
  localStorage.removeItem("wallet_address");
  console.log("Token and wallet address cleared");
};

// Check if token is valid and not expired
export const isValidToken = (): boolean => {
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