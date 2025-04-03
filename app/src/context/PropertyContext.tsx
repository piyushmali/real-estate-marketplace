import { createContext, useState, useContext, ReactNode, useEffect } from "react";
import { mockProperties, Property } from "@/lib/mockData";

interface PropertyContextType {
  properties: Property[];
  addProperty: (property: Omit<Property, "property_id" | "created_at" | "updated_at" | "nft_status" | "nft_mint" | "is_active">) => void;
  isLoading: boolean;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

interface PropertyProviderProps {
  children: ReactNode;
}

export function PropertyProvider({ children }: PropertyProviderProps) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate API call to fetch properties
    const fetchProperties = async () => {
      setIsLoading(true);
      try {
        // Wait for a short time to simulate network request
        await new Promise(resolve => setTimeout(resolve, 500));
        setProperties(mockProperties);
      } catch (error) {
        console.error("Error fetching properties:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProperties();
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

  return (
    <PropertyContext.Provider value={{ properties, addProperty, isLoading }}>
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