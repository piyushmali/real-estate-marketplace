import { useState } from "react";
import { PropertyCard } from "@/components/PropertyCard";
import { PropertyForm } from "@/components/PropertyForm";
import { OfferForm } from "@/components/OfferForm";
import { useWallet } from "@/hooks/useWallet";
import { usePropertyActions } from "@/hooks/usePropertyActions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Property } from "@/lib/mockData";

export default function Properties() {
  const { publicKey } = useWallet();
  const {
    properties,
    listProperty,
    updateProperty,
    makeOffer,
    executeSale,
    getPropertyOffers,
  } = usePropertyActions();

  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [showOfferDialog, setShowOfferDialog] = useState(false);

  const handleAddProperty = (formData: Omit<Property, 'property_id' | 'owner' | 'is_active' | 'created_at' | 'updated_at' | 'nft_mint'>) => {
    listProperty(formData);
  };

  const handleMakeOffer = (property: Property) => {
    setSelectedProperty(property);
    setShowOfferDialog(true);
  };

  const handleOfferSubmit = (amount: number) => {
    if (selectedProperty) {
      makeOffer(selectedProperty, amount);
      setShowOfferDialog(false);
      setSelectedProperty(null);
    }
  };

  const handleUpdateProperty = (property: Property) => {
    // TODO: Implement property update dialog
    console.log('Update property:', property);
  };

  const handleExecuteSale = (property: Property) => {
    const offers = getPropertyOffers(property.property_id);
    const acceptedOffer = offers.find(offer => offer.status === 'Accepted');
    if (acceptedOffer) {
      executeSale(property, acceptedOffer);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Property Listings</h1>
        
        <Dialog>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center">
        {properties.map((property) => (
          <PropertyCard
            key={property.property_id}
            property={property}
            onUpdateProperty={handleUpdateProperty}
            onMakeOffer={handleMakeOffer}
            onExecuteSale={handleExecuteSale}
            offers={getPropertyOffers(property.property_id)}
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