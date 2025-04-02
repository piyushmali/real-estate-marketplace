// src/hooks/useWallet.ts
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

export const useWalletConnection = () => {
  const { publicKey, connect, disconnect, connecting, connected: walletConnected } = useWallet();
  const [connected, setConnected] = useState(walletConnected);

  useEffect(() => {
    console.log("useWalletConnection - Wallet Connected:", walletConnected, "Public Key:", publicKey?.toBase58());
    setConnected(walletConnected);
  }, [walletConnected, publicKey]);

  return { publicKey, connect, disconnect, connecting, connected };
};