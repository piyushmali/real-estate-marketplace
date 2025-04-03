import { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/hooks/useAuth";

export function ConnectWalletButton() {
  const { connected, connect, disconnect, publicKey } = useWallet();
  const { authenticate, token, logout, loading, error, isAuthenticated } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Display error from useAuth hook
  useEffect(() => {
    if (error) {
      setErrorMessage(error);
      setShowError(true);
      const timer = setTimeout(() => {
        setShowError(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      setErrorMessage(null);
      await connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect wallet";
      setErrorMessage(message);
      setShowError(true);
      console.error("Failed to connect wallet:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setErrorMessage(null);
      await disconnect();
      if (token) {
        logout();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to disconnect wallet";
      setErrorMessage(message);
      setShowError(true);
      console.error("Failed to disconnect wallet:", error);
    }
  };

  const handleAuthenticate = async () => {
    try {
      setErrorMessage(null);
      if (connected && !isAuthenticated) {
        await authenticate();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed";
      setErrorMessage(message);
      setShowError(true);
    }
  };

  // Truncate wallet address for display
  const truncatedAddress = publicKey ? 
    `${publicKey.substring(0, 4)}...${publicKey.substring(publicKey.length - 4)}` : 
    "";

  return (
    <div className="relative">
      {!connected ? (
        <button
          disabled={isConnecting}
          onClick={handleConnect}
          className="bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 px-4 rounded"
        >
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </button>
      ) : !isAuthenticated ? (
        <button
          disabled={loading}
          onClick={handleAuthenticate}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        >
          {loading ? "Authenticating..." : `Authenticate ${truncatedAddress}`}
        </button>
      ) : (
        <button
          onClick={handleDisconnect}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
        >
          Disconnect {truncatedAddress}
        </button>
      )}

      {/* Error message tooltip */}
      {showError && errorMessage && (
        <div className="absolute top-full mt-2 right-0 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded shadow-md z-50 w-64">
          <p className="text-sm">{errorMessage}</p>
        </div>
      )}
    </div>
  );
} 