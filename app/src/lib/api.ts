import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';

export interface PropertyFormData {
  property_id: string;
  owner_wallet: string;
  price: number;
  metadata_uri: string;
  location: string;
  square_feet: number;
  bedrooms: number;
  bathrooms: number;
}

export interface Property extends PropertyFormData {
  id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Track created properties locally if API connection fails
const localProperties: Property[] = [];

export const propertyApi = {
  // Create a new property 
  createProperty: async (data: PropertyFormData) => {
    console.log('Creating property with data:', data);
    
    try {
      // Add a timeout to the axios request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await axios.post<Property>(
        `${API_BASE_URL}/properties`,
        data,
        { signal: controller.signal }
      );
      
      clearTimeout(timeoutId);
      console.log('Property created successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error creating property:', error);
      
      // Create a local record as fallback
      const now = new Date().toISOString();
      // Generate uuid for fallback
      const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      
      const newProperty: Property = {
        ...data,
        id: uuid,
        is_active: true,
        created_at: now,
        updated_at: now
      };
      
      localProperties.push(newProperty);
      console.log('Created property in local storage due to error:', newProperty);
      return newProperty;
    }
  },

  // Get all properties
  getProperties: async () => {
    // First return local properties immediately for fast rendering
    if (localProperties.length > 0) {
      console.log('Using local properties for fast render:', localProperties.length);
      
      // Then try to fetch from API in background
      setTimeout(async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await axios.get<Property[]>(`${API_BASE_URL}/properties`, {
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (response.data && response.data.length > 0) {
            console.log('Background fetch: Updated properties from API');
            // Could dispatch an event or update state here
          }
        } catch (error) {
          console.error('Background fetch error:', error);
        }
      }, 100);
      
      return localProperties;
    }
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await axios.get<Property[]>(`${API_BASE_URL}/properties`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response.data;
    } catch (error) {
      console.error('Error fetching properties:', error);
      
      // Return mock data as final fallback
      return [
        {
          id: "mock-1",
          property_id: "mock-property-001",
          owner_wallet: "mock-wallet",
          price: 850000,
          metadata_uri: "https://wallpaperaccess.com/full/2315968.jpg",
          location: "123 Mock Street",
          square_feet: 1800,
          bedrooms: 3,
          bathrooms: 2,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];
    }
  },

  // Get a single property by ID
  getPropertyById: async (propertyId: string) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await axios.get<Property>(`${API_BASE_URL}/properties/${propertyId}`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response.data;
    } catch (error) {
      console.error(`Error fetching property with ID ${propertyId}:`, error);
      
      // Check local storage
      const localProperty = localProperties.find(p => p.id === propertyId);
      if (localProperty) {
        return localProperty;
      }
      
      return null;
    }
  },

  // Update a property
  updateProperty: async (propertyId: string, updates: Partial<PropertyFormData>) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await axios.put<Property>(
        `${API_BASE_URL}/properties/${propertyId}`,
        updates,
        { signal: controller.signal }
      );
      
      clearTimeout(timeoutId);
      return response.data;
    } catch (error) {
      console.error(`Error updating property with ID ${propertyId}:`, error);
      
      // Update local property if exists
      const localPropertyIndex = localProperties.findIndex(p => p.id === propertyId);
      if (localPropertyIndex >= 0) {
        const updatedProperty = {
          ...localProperties[localPropertyIndex],
          ...updates,
          updated_at: new Date().toISOString()
        } as Property;
        
        localProperties[localPropertyIndex] = updatedProperty;
        return updatedProperty;
      }
      
      throw error;
    }
  }
};