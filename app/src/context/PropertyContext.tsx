import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { PublicKey, Connection } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';

// RPC URL with fallback
const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com";

// API URL with fallback
const API_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8080";

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

// Response from backend API
interface PropertyResponse {
  id: string;
  property_id: string;
  owner_wallet: string;
  price: number;
  metadata_uri: string;
  location: string;
  square_feet: number;
  bedrooms: number;
  bathrooms: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
      // Fetch properties from the backend API
      console.log('Fetching properties from backend API');
      const response = await fetch(`${API_URL}/api/properties`);
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const data: PropertyResponse[] = await response.json();
      
      // Convert database properties to our Property format
      const formattedProperties = data.map(item => ({
        property_id: item.property_id,
        location: item.location,
        // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
        price: Number(item.price) / 1_000_000_000, 
        square_feet: Number(item.square_feet),
        bedrooms: Number(item.bedrooms),
        bathrooms: Number(item.bathrooms),
        metadata_uri: item.metadata_uri || "https://images.unsplash.com/photo-1582407947304-fd86f028f716?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&q=80",
        owner: new PublicKey(item.owner_wallet)
      }));
      
      console.log(`Fetched ${formattedProperties.length} properties from backend:`, formattedProperties);
      setProperties(formattedProperties);
      
    } catch (error) {
      console.error('Failed to fetch properties:', error);
      setError('Failed to fetch properties. Falling back to mock data.');
      
      // Fall back to mock data if the API request fails
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