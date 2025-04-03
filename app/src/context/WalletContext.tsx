import React, { createContext, useState, useEffect } from 'react';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { useSolanaWallet } from '@/hooks/useSolanaWallet';
import bs58 from 'bs58';

interface WalletContextType {
  wallet: {
    publicKey: PublicKey;
  } | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  signMessage: (message: string) => Promise<string>;
  isConnecting: boolean;
}

export const WalletContext = createContext<WalletContextType>({
  wallet: null,
  connectWallet: async () => {},
  disconnectWallet: () => {},
  signMessage: async () => '',
  isConnecting: false,
});

interface WalletContextProviderProps {
  children: React.ReactNode;
}

export const WalletContextProvider: React.FC<WalletContextProviderProps> = ({ children }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const { 
    connect, 
    disconnect, 
    signMessage: signWalletMessage,
    wallet,
    connected,
    publicKey
  } = useSolanaWallet();
  
  const connectWallet = async () => {
    try {
      setIsConnecting(true);
      await connect();
    } catch (error) {
      console.error('Error connecting wallet:', error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };
  
  const disconnectWallet = () => {
    disconnect();
  };
  
  const signMessage = async (message: string): Promise<string> => {
    try {
      if (!wallet || !publicKey) {
        throw new Error('Wallet not connected');
      }
      
      const messageBuffer = new TextEncoder().encode(message);
      const signatureBytes = await signWalletMessage(messageBuffer);
      
      return bs58.encode(signatureBytes);
    } catch (error) {
      console.error('Error signing message:', error);
      throw error;
    }
  };
  
  const walletContext: WalletContextType = {
    wallet: publicKey ? { publicKey } : null,
    connectWallet,
    disconnectWallet,
    signMessage,
    isConnecting
  };
  
  return (
    <WalletContext.Provider value={walletContext}>
      {children}
    </WalletContext.Provider>
  );
};
