import { createContext, useContext, useState, ReactNode } from 'react';
import { PublicKey } from '@solana/web3.js';

// API URL with fallback
const API_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8080";

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

// Interface for serializable property data
interface SerializableProperty {
  property_id: string;
  location: string;
  price: number;
  square_feet: number;
  bedrooms: number;
  bathrooms: number;
  metadata_uri: string;
  owner: string;
}

interface PropertyContextType {
  properties: Property[];
  addProperty: (property: Property) => void;
  getProperties: () => Promise<void>;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

export function PropertyProvider({ children }: { children: ReactNode }) {
  const [properties, setProperties] = useState<Property[]>([]);

  const getProperties = async () => {
    try {
      // In a real app, fetch from your backend API
      const response = await fetch(`${API_URL}/api/properties`);
      const data = await response.json();
      
      // Convert string addresses to PublicKey objects
      const formattedProperties = data.map((property: any) => ({
        ...property,
        owner: new PublicKey(property.owner)
      }));
      
      setProperties(formattedProperties);
    } catch (error) {
      console.error('Failed to fetch properties:', error);
    }
  };

  const addProperty = (property: Property) => {
    try {
      // Convert PublicKey to string to avoid serialization issues
      const serializedProperty = {
        ...property,
        owner: typeof property.owner === 'string' 
          ? property.owner 
          : property.owner.toString()
      };
      
      // Then convert back to PublicKey for storage
      const processedProperty = {
        ...serializedProperty,
        owner: typeof serializedProperty.owner === 'string'
          ? new PublicKey(serializedProperty.owner)
          : serializedProperty.owner
      };
      
      setProperties(prev => [processedProperty, ...prev]);
    } catch (error) {
      console.error('Failed to add property:', error);
    }
  };

  return (
    <PropertyContext.Provider
      value={{
        properties,
        addProperty,
        getProperties
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