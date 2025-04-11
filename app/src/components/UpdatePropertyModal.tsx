import { useState } from "react";
import { Property } from "@/lib/mockData";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/hooks/use-toast";
import { useProperties } from "@/context/PropertyContext";

interface UpdatePropertyModalProps {
  property: Property;
  isOpen: boolean;
  onClose: () => void;
}

export function UpdatePropertyModal({ property, isOpen, onClose }: UpdatePropertyModalProps) {
  const [price, setPrice] = useState(property.price.toString());
  const [metadata_uri, setMetadataUri] = useState(property.metadata_uri);
  const [isActive, setIsActive] = useState(property.is_active);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const { connected, publicKey } = useWallet();
  const { toast } = useToast();
  const { updateProperty } = useProperties();

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!price) {
      newErrors.price = "Price is required";
    } else {
      const priceValue = Number(price);
      if (isNaN(priceValue) || priceValue <= 0) {
        newErrors.price = "Please enter a valid price";
      }
    }
    
    if (!metadata_uri.trim()) {
      newErrors.metadata_uri = "Image URL is required";
    } else {
      try {
        new URL(metadata_uri);
      } catch (e) {
        newErrors.metadata_uri = "Please enter a valid URL";
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    if (!connected || !publicKey) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to update the property",
        variant: "destructive",
      });
      return;
    }
    
    if (publicKey.toString() !== property.owner.toString()) {
      toast({
        title: "Not authorized",
        description: "You are not the owner of this property",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // In a real implementation, we would call the Solana program update_property function here
      // For now, we'll just use the context function to update locally
      
      const updates = {
        price: Number(price),
        metadata_uri,
        is_active: isActive,
      };
      
      console.log("Updating property:", {
        property_id: property.property_id,
        ...updates
      });
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update the property in the context
      updateProperty(property.property_id, updates);
      
      toast({
        title: "Property Updated",
        description: "Your property has been updated successfully.",
      });
      
      // Add a small timeout to ensure the toast is displayed before closing
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (error) {
      console.error("Error updating property:", error);
      toast({
        title: "Error",
        description: "Failed to update your property. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Update Property</DialogTitle>
          <DialogDescription>
            Update your property information for {property.location}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={property.location}
              disabled
              className="bg-gray-100"
            />
            <p className="text-xs text-gray-500">The location cannot be changed.</p>
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="price">Price (USD)</Label>
            <Input
              id="price"
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g., 250000"
              className={errors.price ? "border-red-500" : ""}
            />
            {errors.price && (
              <p className="text-red-500 text-xs mt-1">{errors.price}</p>
            )}
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="metadata_uri">Image URL</Label>
            <Input
              id="metadata_uri"
              type="text"
              value={metadata_uri}
              onChange={(e) => setMetadataUri(e.target.value)}
              placeholder="Enter image URL"
              className={errors.metadata_uri ? "border-red-500" : ""}
            />
            {errors.metadata_uri && (
              <p className="text-red-500 text-xs mt-1">{errors.metadata_uri}</p>
            )}
            
            {metadata_uri && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-1">Image Preview:</p>
                <div className="h-20 w-full bg-gray-100 rounded overflow-hidden">
                  <img 
                    src={metadata_uri} 
                    alt="Property preview" 
                    className="h-full w-auto object-cover"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "https://via.placeholder.com/400x300?text=Invalid+Image";
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="isActive"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor="isActive">Property is active (available for offers)</Label>
          </div>
          
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-black text-white hover:bg-gray-800 rounded-[7px]">
              {isSubmitting ? "Updating..." : "Update Property"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}