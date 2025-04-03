import { PropertyCard } from "./PropertyCard";
import { useProperties } from "@/context/PropertyContext";

export function PropertyGrid() {
  const { properties, isLoading } = useProperties();
  
  if (isLoading) {
    return (
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-lg h-72 animate-pulse"></div>
        ))}
      </div>
    );
  }
  
  if (properties.length === 0) {
    return (
      <div className="text-center py-16">
        <h3 className="text-xl font-semibold text-gray-700">No properties found</h3>
        <p className="text-gray-500 mt-2">Try listing a new property or adjusting your search filters</p>
      </div>
    );
  }
  
  return (
    <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {properties.map((property) => (
        <PropertyCard key={property.property_id} property={property} />
      ))}
    </div>
  );
}
