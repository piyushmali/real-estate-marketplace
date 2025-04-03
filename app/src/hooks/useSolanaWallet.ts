import { useState, useEffect, useCallback } from 'react';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';

interface SolanaWallet {
  isPhantom?: boolean;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signMessage: (message: Uint8Array, display?: string) => Promise<Uint8Array>;
  publicKey: PublicKey | null;
}

interface WindowWithSolana extends Window {
  solana?: SolanaWallet;
}

export function useSolanaWallet() {
  const [wallet, setWallet] = useState<SolanaWallet | null>(null);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const solana = (window as WindowWithSolana).solana;
    
    if (solana) {
      setWallet(solana);
      
      if (solana.publicKey) {
        setPublicKey(solana.publicKey);
        setConnected(true);
      }
      
      // Listen for connect events
      solana.on('connect', (publicKey: PublicKey) => {
        setPublicKey(publicKey);
        setConnected(true);
      });
      
      // Listen for disconnect events
      solana.on('disconnect', () => {
        setPublicKey(null);
        setConnected(false);
      });
    }
    
    return () => {
      if (solana) {
        solana.disconnect();
      }
    };
  }, []);
  
  const connect = useCallback(async () => {
    if (!wallet) {
      throw new Error('Solana wallet adapter not found');
    }
    
    try {
      // See if the wallet needs to be connected
      if (!connected) {
        await wallet.connect();
      }
      return { publicKey: wallet.publicKey };
    } catch (error) {
      console.error('Error connecting to wallet:', error);
      throw error;
    }
  }, [wallet, connected]);
  
  const disconnect = useCallback(async () => {
    if (wallet) {
      await wallet.disconnect();
      setConnected(false);
      setPublicKey(null);
    }
  }, [wallet]);
  
  const signMessage = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    if (!wallet || !publicKey) {
      throw new Error('Wallet not connected');
    }
    
    try {
      const signedMessage = await wallet.signMessage(message, 'utf8');
      return signedMessage;
    } catch (error) {
      console.error('Error signing message:', error);
      throw error;
    }
  }, [wallet, publicKey]);
  
  return {
    wallet,
    publicKey,
    connected,
    connect,
    disconnect,
    signMessage
  };
}
