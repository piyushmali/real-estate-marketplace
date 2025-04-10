import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Home, Bed, Bath, ArrowRight, MapPin, Edit, DollarSign, CheckCircle, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/hooks/useWallet";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

import { Property } from "@/context/PropertyContext";
import { Offer } from "@/lib/mockData";
import { UpdatePropertyForm } from "./UpdatePropertyForm";

interface PropertyCardProps {
  property: Property;
  onUpdateProperty?: (property: Property) => void;
  onMakeOffer?: (property: Property) => void;
  onExecuteSale?: (property: Property, offer: Offer) => void;
  offers?: Offer[];
}

export const PropertyCard = ({ property, onUpdateProperty, onMakeOffer, onExecuteSale, offers = [] }: PropertyCardProps) => {
  const { publicKey } = useWallet();
  const [showActions, setShowActions] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Detect mobile devices
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    // Initial check
    checkMobile();
    
    // Add event listener for resize
    window.addEventListener('resize', checkMobile);
    
    // Cleanup
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Handle tap/click on card for mobile devices
  const handleCardInteraction = () => {
    if (isMobile) {
      setShowActions(prev => !prev);
    }
  };

  // Handle both string and PublicKey formats for the owner
  const ownerString = typeof property.owner === 'string' 
    ? property.owner 
    : property.owner.toBase58?.() || property.owner.toString();

  // Convert publicKey to string safely
  const publicKeyString = publicKey 
    ? (publicKey.toBase58?.() || publicKey.toString()) 
    : "";
  
  // Check if current user is the owner
  const isOwner = publicKeyString && ownerString 
    ? publicKeyString === ownerString
    : false;
    
  const hasPendingOffers = offers.some(offer => offer.status === 'Pending');
  
  // Generate a consistent gradient based on property ID
  const gradientColors = [
    "from-blue-500 to-purple-600",
    "from-emerald-500 to-teal-600",
    "from-pink-500 to-rose-600",
    "from-amber-500 to-orange-600",
    "from-indigo-500 to-violet-600"
  ];
  
  // Use property_id hash to determine a consistent gradient color
  const hashCode = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  };
  
  const gradient = gradientColors[hashCode(property.property_id) % gradientColors.length];
  
  // Format the location for display (fallback to a default if empty or just "xsd"/"csd")
  const displayLocation = () => {
    if (!property.location || property.location === "xsd" || property.location === "csd") {
      return "Property Location Unavailable";
    }
    return property.location;
  };
  
  // Placeholder image URL if the metadata_uri is invalid
  const placeholderImage = "https://images.unsplash.com/photo-1582407947304-fd86f028f716?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&q=80";
  
  // Handle opening Update form
  const handleOpenUpdateForm = () => {
    setShowUpdateDialog(true);
  };
  
  // Handle successful property update
  const handleUpdateSuccess = (updatedProperty: Property) => {
    console.log("Property updated successfully:", updatedProperty);
    
    if (onUpdateProperty) {
      onUpdateProperty(updatedProperty);
    }
    setShowUpdateDialog(false);
  };
  
  // Make sure price is always displayed properly in SOL
  const formattedPrice = () => {
    // If price is likely in lamports (large number), convert to SOL
    if (property.price > 10000) {
      return (property.price / LAMPORTS_PER_SOL).toFixed(2);
    }
    // Otherwise, assume it's already in SOL
    return property.price.toFixed(2);
  };
  
  // Format property ID to be shorter and more readable
  const formatPropertyId = (id: string) => {
    if (!id) return '';
    if (id.length > 10) {
      return id.substring(0, 7) + '...';
    }
    return id;
  };
  
  // Recalculate price whenever property changes
  useEffect(() => {
    // Log to verify we're getting updated property data
    console.log(`PropertyCard: property ${property.property_id} price updated to ${property.price}`);
  }, [property.price, property.property_id]);
  
  return (
    <>
      <Card 
        className="w-full h-[380px] flex flex-col overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.02] rounded-xl border-2 border-gray-200 shadow-md relative touch-manipulation backdrop-blur-sm bg-white/90"
        onMouseEnter={() => !isMobile && setShowActions(true)}
        onMouseLeave={() => !isMobile && setShowActions(false)}
        onClick={handleCardInteraction}
      >
        {/* Mobile action hint */}
        {isMobile && !showActions && (
          <div className="absolute right-2 top-2 z-10 bg-white/80 rounded-full p-1 shadow-sm">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
          </div>
        )}

        {/* Header and Property Information - Now at the top */}
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <MapPin className="size-4 text-rose-500" />
              <CardTitle className="text-base font-bold line-clamp-1">{displayLocation()}</CardTitle>
            </div>
            <Badge className="bg-white text-black border border-gray-200 font-bold text-sm px-2 py-1 rounded-md shadow-sm">
              {formattedPrice()} SOL
            </Badge>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <Hash className="h-3 w-3 text-gray-500" />
            <span className="text-xs text-gray-600 font-mono">{property.property_id}</span>
          </div>
        </CardHeader>
        
        {/* Property Features - In the middle */}
        <CardContent className="py-0 px-4 flex-grow">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="flex flex-col items-center p-2 bg-gray-50 rounded-lg shadow-sm">
              <Home className="size-5 text-blue-600 mb-1" />
              <span className="font-medium">{property.square_feet > 0 ? property.square_feet.toLocaleString() : 'N/A'} ft²</span>
            </div>
            <div className="flex flex-col items-center p-2 bg-gray-50 rounded-lg shadow-sm">
              <Bed className="size-5 text-indigo-600 mb-1" />
              <span className="font-medium">{property.bedrooms > 0 ? property.bedrooms : 'N/A'} {property.bedrooms === 1 ? 'Bed' : 'Beds'}</span>
            </div>
            <div className="flex flex-col items-center p-2 bg-gray-50 rounded-lg shadow-sm">
              <Bath className="size-5 text-teal-600 mb-1" />
              <span className="font-medium">{property.bathrooms > 0 ? property.bathrooms : 'N/A'} {property.bathrooms === 1 ? 'Bath' : 'Baths'}</span>
            </div>
          </div>
        </CardContent>
        
        {/* Image - Now at the bottom */}
        <div className="relative w-full h-40 mt-2 overflow-hidden">
          <div className={cn("absolute inset-0 bg-gradient-to-r", gradient, "opacity-40")}></div>
          {!imageError ? (
            <img
              src={property.metadata_uri}
              alt={`Property in ${displayLocation()}`}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <img
              src={placeholderImage}
              alt="Property"
              className="w-full h-full object-cover"
            />
          )}
        </div>
        
        {/* Footer - At the very bottom */}
        <CardFooter className="pt-3 pb-4 px-4 border-t mt-auto">
          <div className="w-full flex justify-between gap-3">
            {isOwner ? (
              <Button
                variant="outline"
                className="flex items-center gap-1 rounded-md h-10 px-4"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenUpdateForm();
                }}
              >
                <Edit className="h-4 w-4" />
                Update
              </Button>
            ) : (
              <Button
                variant="outline"
                className="flex items-center gap-1 rounded-md h-10 px-4"
                onClick={(e) => {
                  e.stopPropagation();
                  onMakeOffer?.(property);
                }}
              >
                <DollarSign className="h-4 w-4" />
                Make Offer
              </Button>
            )}
            
            <Button 
              className="flex items-center gap-2 bg-black text-white hover:bg-gray-800 rounded-md h-10 px-4 text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md"
              onClick={() => setShowDetailsDialog(true)}
            >
              View Details
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </CardFooter>
      </Card>
      
      {/* Property Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="sm:max-w-[600px] bg-white rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{displayLocation()}</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <div className="relative w-full h-60 overflow-hidden rounded-lg mb-4">
              {!imageError ? (
                <img
                  src={property.metadata_uri}
                  alt={`Property in ${displayLocation()}`}
                  className="w-full h-full object-cover"
                  onError={() => setImageError(true)}
                />
              ) : (
                <img
                  src={placeholderImage}
                  alt="Property"
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                <Badge className="bg-white/90 text-black font-bold text-md px-3 py-1 rounded-full shadow-md">
                  {formattedPrice()} SOL
                </Badge>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg">
                <Home className="size-6 text-blue-600 mb-2" />
                <span className="font-medium text-lg">{property.square_feet > 0 ? property.square_feet.toLocaleString() : 'N/A'} ft²</span>
                <span className="text-gray-500 text-sm">Square Feet</span>
              </div>
              <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg">
                <Bed className="size-6 text-indigo-600 mb-2" />
                <span className="font-medium text-lg">{property.bedrooms > 0 ? property.bedrooms : 'N/A'}</span>
                <span className="text-gray-500 text-sm">{property.bedrooms === 1 ? 'Bedroom' : 'Bedrooms'}</span>
              </div>
              <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg">
                <Bath className="size-6 text-teal-600 mb-2" />
                <span className="font-medium text-lg">{property.bathrooms > 0 ? property.bathrooms : 'N/A'}</span>
                <span className="text-gray-500 text-sm">{property.bathrooms === 1 ? 'Bathroom' : 'Bathrooms'}</span>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-md font-semibold text-gray-700">Property ID</h3>
                <p className="font-mono text-sm">{property.property_id}</p>
              </div>
              <div>
                <h3 className="text-md font-semibold text-gray-700">Owner</h3>
                <p className="font-mono text-sm truncate">{ownerString}</p>
              </div>
              <div>
                <h3 className="text-md font-semibold text-gray-700">NFT Metadata</h3>
                <p className="text-sm truncate">
                  <a href={property.metadata_uri} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {property.metadata_uri}
                  </a>
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-4 mt-6">
              {isOwner && (
                <Button 
                  variant="outline" 
                  onClick={handleOpenUpdateForm}
                  className="flex items-center gap-2"
                >
                  <Edit className="size-4" />
                  Update Property
                </Button>
              )}
              {!isOwner && (
                <Button 
                  onClick={() => onMakeOffer?.(property)}
                  className="flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700"
                >
                  <DollarSign className="size-4" />
                  Make an Offer
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Update Property Dialog */}
      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent className="sm:max-w-[600px] bg-white">
          <DialogHeader>
            <DialogTitle>Update Property</DialogTitle>
          </DialogHeader>
          
          <UpdatePropertyForm 
            property={property}
            onUpdateSuccess={handleUpdateSuccess}
            onCancel={() => setShowUpdateDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};