import { PublicKey } from '@solana/web3.js';

export interface PropertyMetadata {
  title: string;
  description: string;
  image: string;
  images?: string[];
  attributes?: {
    trait_type: string;
    value: string | number;
  }[];
}

export interface WalletAdapter {
  publicKey: PublicKey | null;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  on: (event: string, callback: (...args: any[]) => void) => void;
  off: (event: string, callback: (...args: any[]) => void) => void;
}

export interface PropertyFilters {
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  minSquareFeet?: number;
}

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
