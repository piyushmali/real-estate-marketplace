import { useEffect, useState } from "react";
import { PropertyCard } from "@/components/PropertyCard";
import { PropertyForm } from "@/components/PropertyForm";
import { OfferForm } from "@/components/OfferForm";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Property, PropertyFormData, propertyApi } from "@/lib/api";
import { testDatabaseConnection } from "@/lib/db";
import { toast } from "sonner";
import * as z from "zod";

// Import the property form schema from PropertyForm
const propertyFormSchema = z.object({
  price: z.string().transform((val) => Number(val)),
  location: z.string().min(1, "Location is required"),
  square_feet: z.string().transform((val) => Number(val)),
  bedrooms: z.string().transform((val) => Number(val)),
  bathrooms: z.string().transform((val) => Number(val)),
  metadata_uri: z.string().url("Please enter a valid image URL"),
  property_id: z.string().min(1, "Property ID is required"),
});

type PropertyFormValues = z.infer<typeof propertyFormSchema>;

// Mock properties for initial rendering
const mockProperties = [
  {
    id: "mock-1",
    property_id: "mock-property-001",
    owner_wallet: "mock-wallet",
    price: 850000,
    metadata_uri: "https://wallpaperaccess.com/full/2315968.jpg",
    location: "Sample Property 1",
    square_feet: 1800,
    bedrooms: 3,
    bathrooms: 2,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "mock-2",
    property_id: "mock-property-002",
    owner_wallet: "mock-wallet",
    price: 1250000,
    metadata_uri: "https://wallpaperaccess.com/full/2315968.jpg",
    location: "Sample Property 2",
    square_feet: 2200,
    bedrooms: 4,
    bathrooms: 3,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

export default function Properties() {
  const { publicKey } = useWallet();
  const [properties, setProperties] = useState<Property[]>(mockProperties); // Start with mock data
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [isDbConnected, setIsDbConnected] = useState(false);

  // Try to load real properties in the background
  const fetchProperties = async () => {
    try {
      const fetchedProperties = await propertyApi.getProperties();
      if (fetchedProperties && fetchedProperties.length > 0) {
        setProperties(fetchedProperties);
        return true;
      }
    } catch (error) {
      console.error("Error fetching properties:", error);
    }
    return false;
  };

  useEffect(() => {
    // Start with mock data, then try to get real data
    const loadRealData = async () => {
      try {
        const success = await fetchProperties();
        if (success) {
          console.log("Successfully loaded real property data");
        } else {
          console.log("Using mock property data");
        }
      } catch (err) {
        console.error("Error loading properties:", err);
      }
    };
    
    loadRealData();
  }, []);

  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [showOfferDialog, setShowOfferDialog] = useState(false);

  const handleAddProperty = async (formData: PropertyFormValues) => {
    if (!publicKey) {
      toast.error("Please connect your wallet first");
      return;
    }

    setIsSubmitting(true);
    try {
      const propertyData: PropertyFormData = {
        property_id: formData.property_id,
        owner_wallet: publicKey.toString(),
        price: formData.price,
        metadata_uri: formData.metadata_uri,
        location: formData.location,
        square_feet: formData.square_feet,
        bedrooms: formData.bedrooms,
        bathrooms: formData.bathrooms
      };
      
      const newProperty = await propertyApi.createProperty(propertyData);
      
      // Always update UI immediately with the new property
      setProperties(prevProperties => [newProperty, ...prevProperties]);
      
      toast.success("Property listed successfully!");
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error creating property:", error);
      toast.error("Failed to list property");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMakeOffer = (property: Property) => {
    setSelectedProperty(property);
    setShowOfferDialog(true);
  };

  const handleOfferSubmit = (amount: number) => {
    if (selectedProperty) {
      // TODO: Implement real offer submission with the API
      toast.success(`Offer of $${amount} submitted!`);
      setShowOfferDialog(false);
      setSelectedProperty(null);
    }
  };

  const handleUpdateProperty = (property: Property) => {
    // TODO: Implement property update dialog
    console.log('Update property:', property);
  };

  const handleTestDbConnection = async () => {
    setIsTestingDb(true);
    try {
      const success = await testDatabaseConnection();
      if (success) {
        setIsDbConnected(true);
        toast.success("Database connection successful! You can now add properties.");
        // Force a refresh of properties after successful connection
        fetchProperties();
      } else {
        setIsDbConnected(false);
        toast.error("Database connection test failed. Using mock data.");
      }
    } catch (error) {
      console.error("Error testing database connection:", error);
      setIsDbConnected(false);
      toast.error("Error testing database connection. Using mock data.");
    } finally {
      setIsTestingDb(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Property Listings</h1>
          {!isDbConnected && (
            <p className="text-sm text-yellow-600 mt-1">
              Using sample data. Click "Test DB Connection" to use real database.
            </p>
          )}
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleTestDbConnection} 
            disabled={isTestingDb}
          >
            {isTestingDb ? "Testing DB..." : "Test DB Connection"}
          </Button>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>List New Property</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>List New Property</DialogTitle>
              </DialogHeader>
              <PropertyForm onSubmit={handleAddProperty} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center">
        {properties.map((property) => (
          <PropertyCard
            key={property.id}
            property={property}
            onUpdateProperty={handleUpdateProperty}
            onMakeOffer={handleMakeOffer}
          />
        ))}
      </div>

      {properties.length === 0 && (
        <p className="text-center text-gray-500 mt-8">
          No properties listed yet. Add your first property above!
        </p>
      )}

      <Dialog open={showOfferDialog} onOpenChange={setShowOfferDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Make an Offer</DialogTitle>
          </DialogHeader>
          {selectedProperty && (
            <OfferForm
              property={selectedProperty}
              onSubmit={handleOfferSubmit}
              onCancel={() => setShowOfferDialog(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}