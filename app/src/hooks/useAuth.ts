// src/hooks/useAuth.ts
import { useState, useCallback, useEffect } from "react";
import { signWithPhantom, authenticateWithBackend, storeToken, getToken, clearToken, isValidToken, parseJwt } from "@/lib/auth";
import { useWallet } from "@/hooks/useWallet";

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
  }, [connected, publicKey]);

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