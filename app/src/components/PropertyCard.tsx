import { Property } from "@/lib/mockData";
import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { MakeOfferModal } from "./MakeOfferModal";
import { UpdatePropertyModal } from "./UpdatePropertyModal";
import { Edit, ArrowRight } from "lucide-react";

interface PropertyCardProps {
  property: Property;
}

export function PropertyCard({ property }: PropertyCardProps) {
  const { connected, publicKey } = useWallet();
  const [isHovered, setIsHovered] = useState(false);
  const [showMakeOfferModal, setShowMakeOfferModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  
  // Check if current user is the owner of this property
  const isOwner = connected && publicKey && property.owner.toString() === publicKey.toString();

  // Format price with commas
  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(property.price);

  // Format wallet address
  const formatWalletAddress = (address: string) => {
    if (!address) return '';
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
  };

  return (
    <>
      <div 
        className="bg-white rounded-lg shadow-md overflow-hidden transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="relative">
          <img 
            src={property.metadata_uri} 
            alt={`Property in ${property.location}`}
            className="w-full h-48 object-cover"
          />
          <div className="absolute top-2 right-2 bg-blue-600 text-white px-2 py-1 rounded-md text-xs uppercase font-semibold">
            {property.nft_status}
          </div>
          
          {/* Update button for property owner */}
          {isOwner && isHovered && (
            <button 
              onClick={() => setShowUpdateModal(true)}
              className="absolute top-2 left-2 bg-white text-blue-600 hover:text-blue-800 p-2 rounded-full shadow-md transition-all duration-200 ease-in-out"
            >
              <Edit size={16} />
            </button>
          )}
        </div>
        
        <div className="p-4">
          <div className="flex justify-between items-start">
            <h3 className="text-lg font-semibold truncate">{property.location}</h3>
            <span className="font-bold text-lg text-blue-700">{formattedPrice}</span>
          </div>
          
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <span className="text-gray-700 mr-1">{property.bedrooms}</span>
                <span className="text-gray-500 text-sm">bed</span>
              </div>
              <div className="flex items-center">
                <span className="text-gray-700 mr-1">{property.bathrooms}</span>
                <span className="text-gray-500 text-sm">bath</span>
              </div>
              <div className="flex items-center">
                <span className="text-gray-700 mr-1">{property.square_feet}</span>
                <span className="text-gray-500 text-sm">sqft</span>
              </div>
            </div>
          </div>
          
          <div className="mt-1 text-xs text-gray-500">
            Owner: {formatWalletAddress(property.owner.toString())}
          </div>
          
          <div className="mt-4">
            {isHovered && !isOwner && property.is_active ? (
              // Show Make Offer button for non-owners on hover
              <button 
                onClick={() => setShowMakeOfferModal(true)}
                className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-md w-full transition-colors flex items-center justify-center"
              >
                Make Offer
              </button>
            ) : (
              // Default button
              <button 
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md w-full transition-colors flex items-center justify-center"
              >
                View Details
                <ArrowRight size={16} className="ml-2" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Make Offer Modal */}
      {showMakeOfferModal && (
        <MakeOfferModal 
          property={property}
          isOpen={showMakeOfferModal}
          onClose={() => setShowMakeOfferModal(false)}
        />
      )}

      {/* Update Property Modal */}
      {showUpdateModal && (
        <UpdatePropertyModal 
          property={property}
          isOpen={showUpdateModal}
          onClose={() => setShowUpdateModal(false)}
        />
      )}
    </>
  );
}
