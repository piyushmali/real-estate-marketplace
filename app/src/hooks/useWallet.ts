import { useState, useEffect } from 'react';
import { PublicKey, Connection } from '@solana/web3.js';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { useAnchorWallet, useConnection, useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';

// Solana RPC URL with fallback
const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

export function useWallet() {
  const { publicKey, connected, connecting, disconnect, select, wallet, wallets } = useSolanaWallet();
  const connection = new Connection(RPC_URL, 'confirmed');
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (connected && publicKey) {
      // Get and set balance
      connection.getBalance(publicKey).then(balance => {
        setBalance(balance / 1000000000); // Convert lamports to SOL
      });
    } else {
      setBalance(null);
    }
  }, [connected, publicKey, connection]);

  const connectWallet = async () => {
    // If we have wallets, select the first one (usually Phantom)
    if (wallets.length > 0) {
      const phantomWallet = wallets.find(w => w.adapter.name === 'Phantom');
      if (phantomWallet) {
        select(phantomWallet.adapter.name);
      } else {
        select(wallets[0].adapter.name);
      }
    }
  };

  const disconnectWallet = () => {
    disconnect();
  };

  return {
    publicKey: publicKey?.toString(),
    connected,
    connecting,
    balance,
    connectWallet,
    disconnectWallet
  };
} 