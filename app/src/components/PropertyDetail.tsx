import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Property } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { formatWalletAddress, getPropertyStatusBadgeProps } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import { useState } from "react";

interface PropertyDetailProps {
  property: Property;
  isOpen: boolean;
  onClose: () => void;
  onMakeOffer: () => void;
}

export function PropertyDetail({ property, isOpen, onClose, onMakeOffer }: PropertyDetailProps) {
  const [selectedImage, setSelectedImage] = useState(0);
  
  const { 
    property_id, 
    location, 
    price, 
    owner_wallet, 
    bedrooms, 
    bathrooms, 
    square_feet, 
    is_active,
    metadata_uri,
    created_at
  } = property;
  
  // Parse metadata URI for additional information
  const metadata = {
    title: "Property Title",
    description: "Beautiful property with stunning views and modern amenities.",
    images: [
      "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1584622781564-1d987f7333c1?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80",
      "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80",
      "https://images.unsplash.com/photo-1576941089067-2de3c901e126?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80"
    ]
  };
  
  try {
    const parsedMetadata = JSON.parse(atob(metadata_uri.split(',')[1]));
    if (parsedMetadata.title) metadata.title = parsedMetadata.title;
    if (parsedMetadata.description) metadata.description = parsedMetadata.description;
    if (parsedMetadata.images) metadata.images = parsedMetadata.images;
  } catch (e) {
    // Fallback to defaults if metadata parsing fails
  }
  
  const status = is_active ? "active" : "sold";
  const statusProps = getPropertyStatusBadgeProps(status);
  
  // Format date
  const listedDate = new Date(created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <div className="bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Property images */}
            <div className="bg-neutral-100 rounded-lg overflow-hidden">
              <img 
                src={metadata.images[selectedImage]} 
                className="w-full h-96 object-cover" 
                alt={metadata.title} 
              />
              
              {/* Thumbnails */}
              <div className="flex mt-2 space-x-2 p-2">
                {metadata.images.map((image, index) => (
                  <div 
                    key={index}
                    className={`h-16 w-16 rounded-md overflow-hidden cursor-pointer ${
                      selectedImage === index ? 'border-2 border-primary' : ''
                    }`}
                    onClick={() => setSelectedImage(index)}
                  >
                    <img 
                      src={image} 
                      className="w-full h-full object-cover" 
                      alt={`Thumbnail ${index + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>
            
            {/* Property details */}
            <div className="px-4 py-5 sm:px-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold text-neutral-900">{metadata.title}</h3>
                  <p className="mt-1 text-neutral-500">{location}</p>
                </div>
                <div className="bg-primary-50 p-2 rounded-md">
                  <span className="text-xl font-mono font-bold text-primary-700">
                    {(price / 1000000000).toFixed(2)} SOL
                  </span>
                </div>
              </div>
              
              <div className="mt-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="border rounded-lg p-3">
                    <div className="text-lg font-semibold">{bedrooms}</div>
                    <div className="text-xs text-neutral-500">Bedrooms</div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="text-lg font-semibold">{bathrooms}</div>
                    <div className="text-xs text-neutral-500">Bathrooms</div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="text-lg font-semibold">{square_feet.toLocaleString()}</div>
                    <div className="text-xs text-neutral-500">Sq Ft</div>
                  </div>
                </div>
              </div>
              
              <div className="mt-6">
                <h4 className="font-medium text-neutral-900">Description</h4>
                <p className="mt-2 text-sm text-neutral-600">{metadata.description}</p>
              </div>
              
              <div className="mt-6">
                <h4 className="font-medium text-neutral-900">Owner</h4>
                <div className="mt-2 flex items-center">
                  <div className="bg-primary-100 rounded-full p-2">
                    <span className="material-icons text-primary-500">account_circle</span>
                  </div>
                  <div className="ml-3">
                    <span className="text-sm font-mono text-neutral-800">{formatWalletAddress(owner_wallet)}</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-6">
                <h4 className="font-medium text-neutral-900">Blockchain Details</h4>
                <div className="mt-2 text-sm">
                  <div className="flex justify-between py-1">
                    <span className="text-neutral-500">Property ID:</span>
                    <span className="font-mono text-neutral-800">{property_id}</span>
                  </div>
                  <div className="flex justify-between py-1 border-t border-neutral-100">
                    <span className="text-neutral-500">Listed:</span>
                    <span className="text-neutral-800">{listedDate}</span>
                  </div>
                  <div className="flex justify-between py-1 border-t border-neutral-100">
                    <span className="text-neutral-500">Status:</span>
                    <Badge variant={statusProps.variant}>{statusProps.label}</Badge>
                  </div>
                </div>
              </div>
              
              <div className="mt-8 space-y-3">
                <Button 
                  onClick={onMakeOffer} 
                  variant="secondary" 
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                  disabled={!is_active}
                >
                  Make an Offer
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => window.open(`https://explorer.solana.com/address/${property_id}`, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on Explorer
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
