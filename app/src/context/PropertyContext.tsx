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
  is_active?: boolean;
  description?: string;
  nft_mint?: string;
  nft_mint_address?: string;
  nft_token_account?: string;
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
  nft_mint_address?: string;
  nft_token_account?: string;
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
    owner: "A9xYe8XDnCRyPdy7B75B5PT7JP9ktLtxi6xMBVa7C4Xd"
  },
  {
    property_id: "PROP-002",
    location: "456 Oak Ave, San Francisco, CA",
    price: 15,
    square_feet: 2500,
    bedrooms: 4,
    bathrooms: 3,
    metadata_uri: "https://picsum.photos/400/300?random=2",
    owner: "A9xYe8XDnCRyPdy7B75B5PT7JP9ktLtxi6xMBVa7C4Xd"
  }
];

interface PropertyContextType {
  properties: Property[];
  addProperty: (property: Property) => void;
  updateProperty: (propertyId: string, updates: Partial<Property>) => Promise<void>;
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

  const getProperties = useCallback(async (forceRefresh = false) => {
    // Check if we should fetch or if we're already loading
    if (isLoading || (!forceRefresh && !shouldFetch())) {
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
        // Price is already in SOL in the database, no need to convert
        price: Number(item.price),
        square_feet: Number(item.square_feet),
        bedrooms: Number(item.bedrooms),
        bathrooms: Number(item.bathrooms),
        metadata_uri: item.metadata_uri || "https://images.unsplash.com/photo-1582407947304-fd86f028f716?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&q=80",
        owner: new PublicKey(item.owner_wallet),
        is_active: item.is_active,
        description: item.metadata_uri,
        nft_mint_address: item.nft_mint_address,
        nft_token_account: item.nft_token_account
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

  // New method to update a property
  const updateProperty = useCallback(async (propertyId: string, updates: Partial<Property>) => {
    try {
      console.log(`Updating property ${propertyId} with:`, updates);
      
      // Update in local state immediately for responsive UI
      setProperties(prevProperties => 
        prevProperties.map(property => 
          property.property_id === propertyId 
            ? { ...property, ...updates } 
            : property
        )
      );
      
      // Prepare API call data - make sure to use the correct field names expected by the backend
      const apiData: Record<string, any> = {};
      
      // Handle price conversion from SOL to lamports
      if (updates.price !== undefined) {
        // Keep the price in SOL, don't convert to lamports
        apiData['price'] = updates.price;
        console.log(`Using price in SOL: ${updates.price}`);
      }
      
      // Map metadata_uri correctly - use this field for image URL updates
      if (updates.metadata_uri !== undefined) {
        apiData['metadata_uri'] = updates.metadata_uri;
      }
      
      // Other fields that might be updated
      if (updates.is_active !== undefined) {
        apiData['is_active'] = updates.is_active;
      }
      
      console.log("Sending update to API:", apiData);
      
      // Get token from localStorage
      const token = localStorage.getItem('jwt_token');
      if (!token) {
        throw new Error("Authentication required");
      }
      
      // Make the API call to update the property
      const response = await fetch(`${API_URL}/api/properties/${propertyId}/update`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(apiData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update property");
      }
      
      // Parse the response to get the updated property
      const responseData = await response.json();
      console.log("API update response:", responseData);
      
      // Force a refresh of all properties from the database
      await getProperties(true);
      
      return;
    } catch (error) {
      console.error('Failed to update property:', error);
      throw new Error('Failed to update property');
    }
  }, [getProperties]);

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
        updateProperty,
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