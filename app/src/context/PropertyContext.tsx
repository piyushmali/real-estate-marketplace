import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { PublicKey, Connection } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';

// RPC URL with fallback
const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com";

// Program ID from your IDL
const PROGRAM_ID = "HGKnNU4vUKBMbhBbZQ9beqUGHYNzKtv9vTGKvqfna3cZ";

export interface Property {
  property_id: string;
  location: string;
  price: number;
  square_feet: number;
  bedrooms: number;
  bathrooms: number;
  metadata_uri: string;
  owner: PublicKey | string;
}

// Mock properties for local testing
const mockProperties: Property[] = [
  {
    property_id: "PROP-001",
    location: "123 Main St, New York, NY",
    price: 10,
    square_feet: 2000,
    bedrooms: 3,
    bathrooms: 2,
    metadata_uri: "https://picsum.photos/400/300?random=1",
    owner: "13EySfdhQL6b7dxzJnw73C33cRUnX1NjPBWEP1gkU43C"
  },
  {
    property_id: "PROP-002",
    location: "456 Oak Ave, San Francisco, CA",
    price: 15,
    square_feet: 2500,
    bedrooms: 4,
    bathrooms: 3,
    metadata_uri: "https://picsum.photos/400/300?random=2",
    owner: "13EySfdhQL6b7dxzJnw73C33cRUnX1NjPBWEP1gkU43C"
  }
];

interface PropertyContextType {
  properties: Property[];
  addProperty: (property: Property) => void;
  getProperties: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

export function PropertyProvider({ children }: { children: ReactNode }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  // Rate limit function to prevent too many RPC requests
  const shouldFetch = () => {
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTime;
    // Only allow fetching once every 5 seconds
    return timeSinceLastFetch > 5000; 
  };

  const getProperties = useCallback(async () => {
    // Check if we should fetch or if we're already loading
    if (isLoading || !shouldFetch()) {
      console.log('Skipping fetch - already loading or too soon since last fetch');
      return;
    }

    setIsLoading(true);
    setError(null);
    setLastFetchTime(Date.now());

    try {
      // In a real implementation, you would fetch properties from the blockchain here
      // For now, we'll use mock data since on-chain implementation would require specific PDAs and account fetching
      console.log('Using mock properties for local testing (would fetch from blockchain in production)');
      
      // Format mock properties with PublicKey objects for the owner field
      const formattedMockProperties = mockProperties.map(property => ({
        ...property,
        owner: typeof property.owner === 'string' 
          ? new PublicKey(property.owner) 
          : property.owner
      }));
      
      // Set the properties state
      setProperties(formattedMockProperties);
      
      // Future implementation would fetch from blockchain:
      // const connection = new Connection(RPC_URL, "confirmed");
      // const provider = new Provider(connection, wallet, { commitment: "confirmed" });
      // const program = new Program(idl, PROGRAM_ID, provider);
      // const accounts = await program.account.property.all();
      // ... then process and format the accounts into properties
    } catch (error) {
      console.error('Failed to fetch properties:', error);
      setError('Failed to fetch properties. Please try again later.');
      
      // Even if there's an error, we'll still show mock properties
      // so the app remains functional for demo purposes
      const formattedMockProperties = mockProperties.map(property => ({
        ...property,
        owner: typeof property.owner === 'string' 
          ? new PublicKey(property.owner) 
          : property.owner
      }));
      
      setProperties(formattedMockProperties);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, lastFetchTime]);

  const addProperty = useCallback((property: Property) => {
    try {
      // Process the new property
      const processedProperty = {
        ...property,
        owner: typeof property.owner === 'string'
          ? new PublicKey(property.owner)
          : property.owner
      };
      
      // Add to the current properties (without causing a fetch loop)
      setProperties(prev => {
        // Check if this property already exists (by ID)
        const exists = prev.some(p => p.property_id === processedProperty.property_id);
        if (exists) {
          return prev; // Don't add duplicates
        }
        return [processedProperty, ...prev];
      });
    } catch (error) {
      console.error('Failed to add property:', error);
    }
  }, []);

  return (
    <PropertyContext.Provider
      value={{
        properties,
        addProperty,
        getProperties,
        isLoading,
        error
      }}
    >
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperties() {
  const context = useContext(PropertyContext);
  
  if (context === undefined) {
    throw new Error('useProperties must be used within a PropertyProvider');
  }
  
  return context;
} 