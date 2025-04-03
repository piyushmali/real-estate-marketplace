import { createContext, useState, useEffect, ReactNode } from "react";

interface WalletContextType {
  connected: boolean;
  publicKey: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export const WalletContext = createContext<WalletContextType>({
  connected: false,
  publicKey: null,
  connect: async () => {},
  disconnect: async () => {},
});

interface WalletContextProviderProps {
  children: ReactNode;
}

export const WalletContextProvider = ({ children }: WalletContextProviderProps) => {
  const [connected, setConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    // Check if wallet is already connected
    const checkConnection = async () => {
      if (window.solana && window.solana.isPhantom) {
        try {
          if (window.solana.isConnected) {
            setConnected(true);
            setPublicKey(window.solana.publicKey.toBase58());
          }
        } catch (error) {
          console.error("Error checking wallet connection:", error);
        }
      }
    };

    checkConnection();

    // Listen for connection events
    const handleConnect = () => {
      if (window.solana && window.solana.isConnected) {
        setConnected(true);
        setPublicKey(window.solana.publicKey.toBase58());
      }
    };

    const handleDisconnect = () => {
      setConnected(false);
      setPublicKey(null);
    };

    window.addEventListener("solana#connect", handleConnect);
    window.addEventListener("solana#disconnect", handleDisconnect);

    return () => {
      window.removeEventListener("solana#connect", handleConnect);
      window.removeEventListener("solana#disconnect", handleDisconnect);
    };
  }, []);

  const connect = async () => {
    if (!window.solana || !window.solana.isPhantom) {
      window.open("https://phantom.app/", "_blank");
      throw new Error("Phantom wallet not installed");
    }

    try {
      const response = await window.solana.connect();
      setConnected(true);
      setPublicKey(response.publicKey.toBase58());
    } catch (error) {
      console.error("Error connecting to wallet:", error);
      throw error;
    }
  };

  const disconnect = async () => {
    if (window.solana && window.solana.isConnected) {
      await window.solana.disconnect();
      setConnected(false);
      setPublicKey(null);
    }
  };

  return (
    <WalletContext.Provider value={{ connected, publicKey, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
};
