import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { formatWalletAddress, getPropertyStatusBadgeProps } from "@/lib/utils";
import { Property } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface PropertyCardProps {
  property: Property;
  onViewDetails: (property: Property) => void;
}

export function PropertyCard({ property, onViewDetails }: PropertyCardProps) {
  const { 
    property_id, 
    location, 
    price, 
    owner_wallet, 
    bedrooms, 
    bathrooms, 
    square_feet, 
    is_active,
    metadata_uri 
  } = property;
  
  // Parse metadata URI for additional information
  const metadata = {
    title: "Property Title",
    description: "Beautiful property with stunning views and modern amenities.",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60"
  };
  
  try {
    const parsedMetadata = JSON.parse(atob(metadata_uri.split(',')[1]));
    if (parsedMetadata.title) metadata.title = parsedMetadata.title;
    if (parsedMetadata.description) metadata.description = parsedMetadata.description;
    if (parsedMetadata.image) metadata.image = parsedMetadata.image;
  } catch (e) {
    // Fallback to defaults if metadata parsing fails
  }
  
  const status = is_active ? "active" : "sold";
  const statusProps = getPropertyStatusBadgeProps(status);

  return (
    <Card className="overflow-hidden flex flex-col transition-all hover:shadow-md">
      <div className="relative">
        <img
          src={metadata.image}
          alt={metadata.title}
          className="h-48 w-full object-cover"
        />
        
        {/* Status badge */}
        <div className="absolute top-2 left-2">
          <Badge variant={statusProps.variant}>{statusProps.label}</Badge>
        </div>
        
        {/* Price badge */}
        <div className="absolute bottom-2 left-2">
          <div className="rounded bg-neutral-900 bg-opacity-75 px-2 py-1">
            <span className="text-white font-semibold font-mono">{(price / 1000000000).toFixed(2)} SOL</span>
          </div>
        </div>
      </div>
      
      <CardContent className="flex-1 p-4">
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-medium text-neutral-900">{metadata.title}</h3>
          <div className="flex items-center">
            <span className="material-icons text-sm text-neutral-400">subdirectory_arrow_right</span>
            <span className="text-xs text-neutral-500 ml-1 font-mono truncate" title={owner_wallet}>
              {formatWalletAddress(owner_wallet)}
            </span>
          </div>
        </div>
        
        <p className="mt-1 text-sm text-neutral-500">{location}</p>
        
        <div className="mt-4 flex items-center justify-between text-sm text-neutral-700">
          <div className="flex items-center">
            <span className="material-icons text-sm text-neutral-400">king_bed</span>
            <span className="ml-1">{bedrooms} beds</span>
          </div>
          <div className="flex items-center">
            <span className="material-icons text-sm text-neutral-400">bathtub</span>
            <span className="ml-1">{bathrooms} baths</span>
          </div>
          <div className="flex items-center">
            <span className="material-icons text-sm text-neutral-400">square_foot</span>
            <span className="ml-1">{square_feet.toLocaleString()} sqft</span>
          </div>
        </div>
        
        <div className="mt-4 property-description-fade h-16 overflow-hidden relative">
          <p className="text-sm text-neutral-600">
            {metadata.description}
          </p>
          {/* Fade effect added via CSS */}
          <div className="absolute bottom-0 left-0 h-12 w-full bg-gradient-to-t from-white to-transparent"></div>
        </div>
      </CardContent>
      
      <CardFooter className="px-4 py-3 bg-neutral-50 border-t border-neutral-200">
        <Button 
          className="w-full" 
          onClick={() => onViewDetails(property)}
        >
          View Details
        </Button>
      </CardFooter>
    </Card>
  );
}
