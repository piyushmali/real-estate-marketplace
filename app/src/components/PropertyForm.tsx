import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { PublicKey } from "@solana/web3.js";
import { useProperties } from "@/context/PropertyContext";

interface PropertyFormProps {
  onClose: () => void;
}

export function PropertyForm({ onClose }: PropertyFormProps) {
  const { connected, publicKey } = useWallet();
  const { addProperty } = useProperties();
  const [formData, setFormData] = useState({
    location: "",
    price: "",
    square_feet: "",
    bedrooms: "",
    bathrooms: "",
    metadata_uri: "https://picsum.photos/400/300", // Default image URL
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.location.trim()) newErrors.location = "Location is required";
    if (!formData.price) newErrors.price = "Price is required";
    else if (isNaN(Number(formData.price)) || Number(formData.price) <= 0) {
      newErrors.price = "Price must be a positive number";
    }
    
    if (!formData.square_feet) newErrors.square_feet = "Square feet is required";
    else if (isNaN(Number(formData.square_feet)) || Number(formData.square_feet) <= 0) {
      newErrors.square_feet = "Square feet must be a positive number";
    }
    
    if (!formData.bedrooms) newErrors.bedrooms = "Bedrooms is required";
    else if (isNaN(Number(formData.bedrooms)) || Number(formData.bedrooms) <= 0) {
      newErrors.bedrooms = "Bedrooms must be a positive number";
    }
    
    if (!formData.bathrooms) newErrors.bathrooms = "Bathrooms is required";
    else if (isNaN(Number(formData.bathrooms)) || Number(formData.bathrooms) <= 0) {
      newErrors.bathrooms = "Bathrooms must be a positive number";
    }
    
    if (!formData.metadata_uri.trim()) {
      newErrors.metadata_uri = "Image URL is required";
    } else {
      try {
        new URL(formData.metadata_uri);
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
      // Convert string values to appropriate types
      addProperty({
        location: formData.location,
        price: Number(formData.price),
        square_feet: Number(formData.square_feet),
        bedrooms: Number(formData.bedrooms),
        bathrooms: Number(formData.bathrooms),
        metadata_uri: formData.metadata_uri,
        owner: new PublicKey(publicKey),
      });
      
      onClose();
    } catch (error) {
      console.error("Error adding property:", error);
      setErrors({ general: "Failed to add property. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-center">List a New Property</h2>
      
      <form onSubmit={handleSubmit}>
        {errors.general && (
          <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">
            {errors.general}
          </div>
        )}
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="location">
            Location
          </label>
          <input
            type="text"
            id="location"
            name="location"
            value={formData.location}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg ${errors.location ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="e.g., 123 Main St, New York, NY"
          />
          {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location}</p>}
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="price">
            Price (USD)
          </label>
          <input
            type="number"
            id="price"
            name="price"
            value={formData.price}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg ${errors.price ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="e.g., 500000"
            min="1"
          />
          {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price}</p>}
        </div>
        
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="bedrooms">
              Bedrooms
            </label>
            <input
              type="number"
              id="bedrooms"
              name="bedrooms"
              value={formData.bedrooms}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg ${errors.bedrooms ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="e.g., 3"
              min="1"
            />
            {errors.bedrooms && <p className="text-red-500 text-xs mt-1">{errors.bedrooms}</p>}
          </div>
          
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="bathrooms">
              Bathrooms
            </label>
            <input
              type="number"
              id="bathrooms"
              name="bathrooms"
              value={formData.bathrooms}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg ${errors.bathrooms ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="e.g., 2"
              min="1"
              step="0.5"
            />
            {errors.bathrooms && <p className="text-red-500 text-xs mt-1">{errors.bathrooms}</p>}
          </div>
          
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="square_feet">
              Sq. Feet
            </label>
            <input
              type="number"
              id="square_feet"
              name="square_feet"
              value={formData.square_feet}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg ${errors.square_feet ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="e.g., 2000"
              min="1"
            />
            {errors.square_feet && <p className="text-red-500 text-xs mt-1">{errors.square_feet}</p>}
          </div>
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="metadata_uri">
            Image URL
          </label>
          <input
            type="text"
            id="metadata_uri"
            name="metadata_uri"
            value={formData.metadata_uri}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg ${errors.metadata_uri ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="Enter a valid image URL"
          />
          {errors.metadata_uri && <p className="text-red-500 text-xs mt-1">{errors.metadata_uri}</p>}
          
          {formData.metadata_uri && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1">Image Preview:</p>
              <div className="h-20 w-full bg-gray-100 rounded overflow-hidden">
                <img 
                  src={formData.metadata_uri} 
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
        
        <div className="flex justify-end space-x-4 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Listing..." : "List Property"}
          </button>
        </div>
      </form>
    </div>
  );
} 