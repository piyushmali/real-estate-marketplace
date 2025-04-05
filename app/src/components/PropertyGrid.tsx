import { PropertyCard } from "./PropertyCard";
import { useProperties } from "@/context/PropertyContext";
import { useEffect, useState } from "react";
import { Property } from "@/context/PropertyContext";
import MakeOfferModal from "./MakeOfferModal";
import { useAuth } from "../contexts/AuthContext";

export function PropertyGrid() {
  const { properties, getProperties, isLoading, error, addProperty } = useProperties();
  const { token } = useAuth();
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  
  // Fetch properties when component mounts
  useEffect(() => {
    getProperties();
  }, [getProperties]);
  
  // Handle property update
  const handleUpdateProperty = (updatedProperty: Property) => {
    // Update the property in the local state by replacing the old one
    addProperty(updatedProperty);
  };

  // Handle make offer button click
  const handleMakeOffer = (property: Property) => {
    setSelectedProperty(property);
    setShowOfferModal(true);
  };

  // Handle offer modal close
  const handleCloseOfferModal = () => {
    setShowOfferModal(false);
  };

  // Handle successful offer creation
  const handleOfferSuccess = () => {
    // You can refresh properties or offers if needed
    getProperties();
  };
  
  // Loading state
  if (isLoading && properties.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <h3 className="text-xl font-semibold text-gray-700">Loading properties...</h3>
      </div>
    );
  }
  
  // Error state
  if (error && properties.length === 0) {
    return (
      <div className="text-center py-16 text-red-500">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h3 className="text-xl font-semibold">Error loading properties</h3>
        <p className="mt-2">{error}</p>
        <p className="mt-2 text-gray-600">Showing available mock properties instead</p>
      </div>
    );
  }
  
  // Empty state
  if (properties.length === 0) {
    return (
      <div className="text-center py-16">
        <h3 className="text-xl font-semibold text-gray-700">No properties found</h3>
        <p className="text-gray-500 mt-2">Try listing a new property</p>
      </div>
    );
  }
  
  return (
    <>
      <div className="grid gap-8 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 mx-auto max-w-7xl px-4 py-6">
        {properties.map((property) => (
          <PropertyCard 
            key={property.property_id} 
            property={property} 
            onUpdateProperty={handleUpdateProperty}
            onMakeOffer={handleMakeOffer}
          />
        ))}
      </div>

      {/* Make Offer Modal */}
      {selectedProperty && (
        <MakeOfferModal
          propertyId={selectedProperty.property_id}
          visible={showOfferModal}
          onClose={handleCloseOfferModal}
          onSuccess={handleOfferSuccess}
        />
      )}
    </>
  );
}
