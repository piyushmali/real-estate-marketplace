import { useState } from "react";
import { PropertyCard } from "@/components/PropertyCard";
import { PropertyForm } from "@/components/PropertyForm";

interface Property {
  property_id: string;
  price: number;
  metadata_uri: string;
  location: string;
  square_feet: number;
  bedrooms: number;
  bathrooms: number;
}

export function Properties() {
  const [properties, setProperties] = useState<Property[]>([]);

  const handleAddProperty = (formData: Omit<Property, 'property_id'>) => {
    const newProperty = {
      ...formData,
      property_id: `PROP-${Date.now()}`, // Generate a unique ID
    };
    setProperties([...properties, newProperty]);
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Property Listings</h1>
      
      <div className="mb-12">
        <PropertyForm
          onSubmit={handleAddProperty}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center">
        {properties.map((property) => (
          <PropertyCard
            key={property.property_id}
            property={property}
          />
        ))}
      </div>

      {properties.length === 0 && (
        <p className="text-center text-gray-500 mt-8">
          No properties listed yet. Add your first property above!
        </p>
      )}
    </div>
  );
}