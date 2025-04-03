interface PhantomProvider {
  isPhantom: boolean;
  publicKey: { toBase58: () => string };
  isConnected: boolean;
  signMessage: (message: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
  connect: () => Promise<{ publicKey: { toBase58: () => string } }>;
  disconnect: () => Promise<void>;
}

interface Window {
  solana?: PhantomProvider;
} 