// src/lib/auth.ts
import { token } from "@coral-xyz/anchor/dist/cjs/utils";
import bs58 from "bs58";

export interface AuthPayload {
  public_key: string;
  signature: string;
  timestamp: number;
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

  // Sign the message
  const messageBytes = new TextEncoder().encode(message);
  const signedMessage = await window.solana.signMessage(messageBytes, "utf8");
  const signatureBase58 = bs58.encode(signedMessage.signature);
  console.log(message)
  console.log(signedMessage)
  console.log(signatureBase58)
  return {
    public_key: publicKey,
    signature: signatureBase58,
    timestamp,
  };
};

export const authenticateWithBackend = async (payload: AuthPayload): Promise<string> => {
  const response = await fetch("http://localhost:8080/api/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Authentication failed: ${response.statusText}`);
  }

  const result = await response.json();
  return result.token; // Assuming the backend returns { token: "jwt-token" }
};

// Utility to store JWT in local storage
export const storeToken = (token: string) => {
  localStorage.setItem("jwt_token", token);
};

// console.log(token)

// Utility to retrieve JWT from local storage
export const getToken = (): string | null => {
  return localStorage.getItem("jwt_token");
};

// Utility to clear JWT from local storage (e.g., on logout)
export const clearToken = () => {
  localStorage.removeItem("jwt_token");
};