import { Property } from "@/lib/mockData";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, HomeIcon, RulerIcon, BedDoubleIcon, ShowerHeadIcon, WalletIcon, MapPinIcon, ExternalLink, Pencil } from "lucide-react";

interface PropertyDetailModalProps {
  property: Property;
  isOpen: boolean;
  onClose: () => void;
  onMakeOffer: () => void;
  isOwner: boolean;
  onEdit?: () => void;
}

export function PropertyDetailModal({ property, isOpen, onClose, onMakeOffer, isOwner, onEdit }: PropertyDetailModalProps) {
  // Format price with commas
  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(property.price);

  // Format dates
  const createdDate = new Date(property.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Format wallet address
  const formatWalletAddress = (address: string) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{property.location}</DialogTitle>
          <div className="flex items-center space-x-2 mt-1">
            <MapPinIcon className="h-4 w-4 text-gray-500" />
            <span className="text-gray-500 text-sm">{property.location}</span>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left column - Image */}
          <div className="space-y-4">
            <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
              <img 
                src={property.metadata_uri} 
                alt={property.location} 
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "https://via.placeholder.com/800x600?text=Image+Not+Available";
                }}
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="flex items-center gap-1">
                <BedDoubleIcon className="h-3 w-3" /> {property.bedrooms} beds
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <ShowerHeadIcon className="h-3 w-3" /> {property.bathrooms} baths
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <RulerIcon className="h-3 w-3" /> {property.square_feet.toLocaleString()} sq ft
              </Badge>
            </div>
          </div>

          {/* Right column - Details */}
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold">{formattedPrice}</h3>
              <div className="mt-1">
                <Badge 
                  variant={property.is_active ? "success" : "secondary"}
                  className="uppercase"
                >
                  {property.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start space-x-2">
                <WalletIcon className="h-5 w-5 text-gray-500 mt-0.5" />
                <div>
                  <h4 className="font-medium">Owner</h4>
                  <p className="text-sm font-mono">{formatWalletAddress(property.owner.toString())}</p>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <HomeIcon className="h-5 w-5 text-gray-500 mt-0.5" />
                <div>
                  <h4 className="font-medium">Property ID</h4>
                  <p className="text-sm font-mono">{property.property_id}</p>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <CalendarIcon className="h-5 w-5 text-gray-500 mt-0.5" />
                <div>
                  <h4 className="font-medium">Listed on</h4>
                  <p className="text-sm">{createdDate}</p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <h4 className="font-medium mb-2">NFT Details</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Status</span>
                  <span className="text-sm font-medium">{property.nft_status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Mint Address</span>
                  <span className="text-sm font-mono">{formatWalletAddress(property.nft_mint.toString())}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-6">
          {!isOwner && property.is_active && (
            <Button 
              onClick={onMakeOffer}
              className="sm:flex-1 bg-amber-500 hover:bg-amber-600"
            >
              Make an Offer
            </Button>
          )}
          
          {isOwner && (
            <Button 
              variant="outline" 
              className="sm:flex-1 border-blue-500 text-blue-600 hover:bg-blue-50"
              onClick={onEdit}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit Property
            </Button>
          )}
          
          <Button 
            variant="outline" 
            className="sm:flex-1"
            onClick={() => window.open(`https://explorer.solana.com/address/${property.nft_mint.toString()}`, '_blank')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View on Explorer
          </Button>
          
          <Button 
            variant="secondary" 
            onClick={onClose}
            className="sm:flex-1"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 