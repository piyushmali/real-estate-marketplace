import { createContext, useState, useContext, ReactNode, useEffect } from "react";
import { mockProperties, Property, mockOffers, Offer } from "@/lib/mockData";
import { PublicKey } from "@solana/web3.js";

interface PropertyContextType {
  properties: Property[];
  offers: Offer[];
  addProperty: (property: Omit<Property, "property_id" | "created_at" | "updated_at" | "nft_status" | "nft_mint" | "is_active">) => void;
  updateProperty: (propertyId: string, updates: { price?: number; metadata_uri?: string; is_active?: boolean }) => void;
  makeOffer: (propertyId: string, buyerPublicKey: PublicKey, amount: number, expirationDays: number) => void;
  isLoading: boolean;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

interface PropertyProviderProps {
  children: ReactNode;
}

export function PropertyProvider({ children }: PropertyProviderProps) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate API call to fetch properties and offers
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Wait for a short time to simulate network request
        await new Promise(resolve => setTimeout(resolve, 500));
        setProperties(mockProperties);
        setOffers(mockOffers);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const addProperty = (newPropertyData: Omit<Property, "property_id" | "created_at" | "updated_at" | "nft_status" | "nft_mint" | "is_active">) => {
    // Generate a random ID
    const propertyId = `PROP-${Math.floor(Math.random() * 10000)}`;
    const now = Date.now();
    
    const newProperty: Property = {
      ...newPropertyData,
      property_id: propertyId,
      is_active: true,
      created_at: now,
      updated_at: now,
      nft_status: "New",
      nft_mint: newPropertyData.owner,
    };
    
    setProperties(prevProperties => [...prevProperties, newProperty]);
  };

  const updateProperty = (propertyId: string, updates: { price?: number; metadata_uri?: string; is_active?: boolean }) => {
    setProperties(prevProperties => 
      prevProperties.map(property => {
        if (property.property_id === propertyId) {
          return {
            ...property,
            ...updates,
            updated_at: Date.now(),
          };
        }
        return property;
      })
    );
  };

  const makeOffer = (propertyId: string, buyerPublicKey: PublicKey, amount: number, expirationDays: number) => {
    // Find the property 
    const property = properties.find(p => p.property_id === propertyId);
    
    if (!property) {
      throw new Error(`Property with ID ${propertyId} not found`);
    }
    
    const now = Date.now();
    const expirationTime = now + (expirationDays * 24 * 60 * 60 * 1000);
    
    // Create new offer
    const newOffer: Offer = {
      offer_id: `OFFER-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      buyer: buyerPublicKey,
      property: property,
      amount: amount,
      status: 'Pending',
      created_at: now,
      updated_at: now,
      expiration_time: expirationTime,
    };
    
    setOffers(prevOffers => [...prevOffers, newOffer]);
  };

  return (
    <PropertyContext.Provider value={{ 
      properties, 
      offers,
      addProperty, 
      updateProperty, 
      makeOffer,
      isLoading 
    }}>
      {children}
    </PropertyContext.Provider>
  );
}

export const useProperties = () => {
  const context = useContext(PropertyContext);
  
  if (context === undefined) {
    throw new Error("useProperties must be used within a PropertyProvider");
  }
  
  return context;
}; 