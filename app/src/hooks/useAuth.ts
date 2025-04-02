// src/hooks/useAuth.ts
import { useState, useCallback } from "react";
import { signWithPhantom, authenticateWithBackend, storeToken, getToken, clearToken } from "@/lib/auth";
import { useWalletConnection } from "@/hooks/useWallet";

export const useAuth = () => {
  const { connected } = useWalletConnection();
  const [token, setToken] = useState<string | null>(getToken());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const authenticate = useCallback(async () => {
    if (!connected) {
      setError("Please connect your wallet first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = await signWithPhantom();
      const jwtToken = await authenticateWithBackend(payload);
      storeToken(jwtToken);
      setToken(jwtToken);
    } catch (err: any) {
      setError(err.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }, [connected]);

  const logout = useCallback(() => {
    clearToken();
    setToken(null);
  }, []);

  return { token, authenticate, logout, error, loading, connected };
};