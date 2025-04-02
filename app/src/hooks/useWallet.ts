import { useWallet } from "@solana/wallet-adapter-react";

export const useWalletConnection = () => {
  const { publicKey, connect, disconnect, connecting, connected } = useWallet();
  return { publicKey, connect, disconnect, connecting, connected };
};