import { Property } from "@/lib/mockData";

interface PropertyCardProps {
  property: Property;
}

export function PropertyCard({ property }: PropertyCardProps) {
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
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="relative">
        <img 
          src={property.metadata_uri} 
          alt={`Property in ${property.location}`}
          className="w-full h-48 object-cover"
        />
        <div className="absolute top-2 right-2 bg-blue-600 text-white px-2 py-1 rounded-md text-xs uppercase font-semibold">
          {property.nft_status}
        </div>
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
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md w-full transition-colors">
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}
