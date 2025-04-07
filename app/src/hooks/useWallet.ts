import { useState, useEffect } from 'react';
import { PublicKey, Connection, Transaction } from '@solana/web3.js';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { useAnchorWallet, useConnection, useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';

// Solana RPC URL with fallback
const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

export function useWallet() {
  const { publicKey, connected, connecting, disconnect, select, wallet, wallets, signTransaction } = useSolanaWallet();
  const connection = new Connection(RPC_URL, 'confirmed');
  const [balance, setBalance] = useState<number | null>(null);
  const [previousWallet, setPreviousWallet] = useState<string | null>(null);
  // State to track if we need to force authentication
  const [needsAuthentication, setNeedsAuthentication] = useState<boolean>(false);

  useEffect(() => {
    if (connected && publicKey) {
      // Track wallet changes
      const currentWallet = publicKey.toString();
      if (previousWallet && previousWallet !== currentWallet) {
        console.log("Wallet changed from", previousWallet, "to", currentWallet);
        
        // Set flag that this wallet needs authentication
        setNeedsAuthentication(true);
        localStorage.removeItem("jwt_token");
        localStorage.removeItem("wallet_address");
        
        // Trigger a custom event that other components can listen for
        window.dispatchEvent(new CustomEvent('walletChanged', { 
          detail: { previous: previousWallet, current: currentWallet, needsAuth: true }
        }));
      }
      setPreviousWallet(currentWallet);
      
      // Get and set balance
      connection.getBalance(publicKey).then(balance => {
        setBalance(balance / 1000000000); // Convert lamports to SOL
      });
    } else {
      setBalance(null);
      if (previousWallet) {
        console.log("Wallet disconnected:", previousWallet);
        setPreviousWallet(null);
        setNeedsAuthentication(false);
      }
    }
  }, [connected, publicKey, connection, previousWallet]);

  const connectWallet = async () => {
    // If we have wallets, select the first one (usually Phantom)
    if (wallets.length > 0) {
      const phantomWallet = wallets.find(w => w.adapter.name === 'Phantom');
      if (phantomWallet) {
        select(phantomWallet.adapter.name);
      } else {
        select(wallets[0].adapter.name);
      }
      // New wallet will need authentication
      setNeedsAuthentication(true);
    }
  };

  const disconnectWallet = () => {
    // Clear auth state when disconnecting
    localStorage.removeItem("jwt_token");
    localStorage.removeItem("wallet_address");
    disconnect();
    setNeedsAuthentication(false);
  };

  // Reset the needs authentication flag
  const setAuthenticated = () => {
    setNeedsAuthentication(false);
  };

  return {
    publicKey: publicKey?.toString(),
    connected,
    connecting,
    balance,
    connectWallet,
    disconnectWallet,
    needsAuthentication,
    setAuthenticated,
    signTransaction,
    publicKeyObj: publicKey
  };
} 