// Mock data for now; replace with PostgreSQL later
export const mockProperties = [
    {
      property_id: "property_001",
      price: 1000000,
      metadata_uri: "https://wallpaperaccess.com/full/2315968.jpg",
      location: "123 Main St",
      square_feet: 2000,
      bedrooms: 3,
      bathrooms: 2,
    },
    {
      property_id: "property_002",
      price: 1500000,
      metadata_uri: "https://wallpaperaccess.com/full/2315968.jpg",
      location: "456 Oak Ave",
      square_feet: 2500,
      bedrooms: 4,
      bathrooms: 3,
    },
    {
        property_id: "property_002",
        price: 1500000,
        metadata_uri: "https://wallpaperaccess.com/full/2315968.jpg",
        location: "456 Oak Ave",
        square_feet: 2500,
        bedrooms: 4,
        bathrooms: 3,
      },
      {
        property_id: "property_002",
        price: 1500000,
        metadata_uri: "https://wallpaperaccess.com/full/2315968.jpg",
        location: "456 Oak Ave",
        square_feet: 2500,
        bedrooms: 4,
        bathrooms: 3,
      },
  ];
  
  export const getProperties = async () => mockProperties;