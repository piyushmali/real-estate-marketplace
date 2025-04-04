import { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Property } from "@/context/PropertyContext";
import { Check, X } from "lucide-react";

interface UpdatePropertyFormProps {
  property: Property;
  onClose: () => void;
  onSuccess?: (updatedProperty: Property) => void;
}

export function UpdatePropertyForm({ property, onClose, onSuccess }: UpdatePropertyFormProps) {
  const { connected, publicKey } = useWallet();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    price: '',
    metadata_uri: '',
    is_active: true
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form with current property data
  useEffect(() => {
    setFormData({
      price: property.price.toString(),
      metadata_uri: property.metadata_uri || '',
      is_active: true // Default to active
    });
  }, [property]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear error for this field when user types
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const toggleActiveStatus = () => {
    setFormData(prev => ({ ...prev, is_active: !prev.is_active }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (formData.price && (isNaN(Number(formData.price)) || Number(formData.price) <= 0)) {
      newErrors.price = "Price must be a positive number";
    }
    
    if (formData.metadata_uri) {
      try {
        const url = new URL(formData.metadata_uri);
        if (!url.protocol.startsWith('http')) {
          newErrors.metadata_uri = "Image URL must use HTTP or HTTPS protocol";
        }
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
      setErrors({ general: "Please connect your wallet first" });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Create updated property object for local state update
      const updatedProperty: Property = {
        ...property,
        price: formData.price ? Number(formData.price) : property.price,
        metadata_uri: formData.metadata_uri || property.metadata_uri,
        // is_active is not stored in our Property type but would be updated on chain
      };
      
      // Simulate blockchain delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({
        title: "Property Updated!",
        description: "Your property details have been successfully updated.",
      });
      
      if (onSuccess) {
        onSuccess(updatedProperty);
      }
      
      onClose();
    } catch (err) {
      console.error("Error updating property:", err);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: `Could not update property: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit}>
        {errors.general && (
          <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">
            {errors.general}
          </div>
        )}
        
        <div className="mb-4">
          <Label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="price">
            Price (SOL) - Optional
          </Label>
          <Input
            type="number"
            id="price"
            name="price"
            value={formData.price}
            onChange={handleChange}
            className={`w-full border rounded-lg ${errors.price ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="e.g., 10"
            min="0.001"
            step="0.001"
          />
          {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price}</p>}
        </div>
        
        <div className="mb-4">
          <Label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="metadata_uri">
            Image URL - Optional
          </Label>
          <Input
            type="text"
            id="metadata_uri"
            name="metadata_uri"
            value={formData.metadata_uri}
            onChange={handleChange}
            className={`w-full border rounded-lg ${errors.metadata_uri ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="e.g., https://example.com/image.jpg"
          />
          {errors.metadata_uri && <p className="text-red-500 text-xs mt-1">{errors.metadata_uri}</p>}
        </div>
        
        <div className="mb-6">
          <Label className="block text-gray-700 text-sm font-medium mb-2">
            Active Listing
          </Label>
          
          <div 
            className="flex cursor-pointer items-center py-2"
            onClick={toggleActiveStatus}
            role="checkbox"
            aria-checked={formData.is_active}
            tabIndex={0}
            onKeyPress={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                toggleActiveStatus();
              }
            }}
          >
            <div className={`mr-3 flex h-6 w-12 items-center rounded-full p-1 ${formData.is_active ? 'bg-blue-600' : 'bg-gray-300'}`}>
              <div className={`h-4 w-4 rounded-full bg-white transition-transform ${formData.is_active ? 'translate-x-6' : 'translate-x-0'}`}></div>
            </div>
            <div className="flex flex-col">
              <span className="font-medium">{formData.is_active ? 'Active' : 'Inactive'}</span>
              <span className="text-xs text-gray-500">
                {formData.is_active 
                  ? "Your property is visible to potential buyers" 
                  : "Your property will be hidden from the marketplace"}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-4 mt-8">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-500 text-white hover:bg-blue-600"
          >
            {isSubmitting ? "Updating..." : "Update Property"}
          </Button>
        </div>
      </form>
    </div>
  );
} 