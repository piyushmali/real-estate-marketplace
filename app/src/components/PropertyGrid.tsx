import { useState } from "react";
import { PropertyCard } from "./PropertyCard";
import { PropertyDetail } from "./PropertyDetail";
import { Property } from "@shared/schema";
import { MakeOfferModal } from "./MakeOfferModal";

interface PropertyGridProps {
  properties: Property[];
  isLoading: boolean;
}

export function PropertyGrid({ properties, isLoading }: PropertyGridProps) {
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  
  const handleViewDetails = (property: Property) => {
    setSelectedProperty(property);
  };
  
  const handleCloseModal = () => {
    setSelectedProperty(null);
  };
  
  const handleMakeOffer = () => {
    setShowOfferModal(true);
  };
  
  const handleCloseOfferModal = () => {
    setShowOfferModal(false);
  };
  
  if (isLoading) {
    return (
      <div className="mt-6 grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="bg-white animate-pulse h-[400px] rounded-lg shadow"></div>
        ))}
      </div>
    );
  }
  
  if (properties.length === 0) {
    return (
      <div className="mt-6 text-center py-10 bg-white rounded-lg shadow">
        <h3 className="text-lg font-medium text-neutral-900">No properties found</h3>
        <p className="mt-2 text-sm text-neutral-600">Try adjusting your search filters</p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {properties.map((property) => (
          <PropertyCard
            key={property.id}
            property={property}
            onViewDetails={handleViewDetails}
          />
        ))}
      </div>
      
      {selectedProperty && (
        <PropertyDetail 
          property={selectedProperty} 
          isOpen={!!selectedProperty}
          onClose={handleCloseModal}
          onMakeOffer={handleMakeOffer}
        />
      )}
      
      {showOfferModal && selectedProperty && (
        <MakeOfferModal
          property={selectedProperty}
          isOpen={showOfferModal}
          onClose={handleCloseOfferModal}
        />
      )}
    </>
  );
}
