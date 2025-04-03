import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { usePropertyActions } from "@/hooks/usePropertyActions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PropertyForm } from "@/components/PropertyForm";
import { PropertyCard } from "@/components/PropertyCard";
import { Property, Offer } from "@/lib/mockData";

interface OfferListProps {
  offers: Offer[];
  onAccept: (offerId: string) => void;
  onReject: (offerId: string) => void;
}

const OfferList = ({ offers, onAccept, onReject }: OfferListProps) => {
  return (
    <div className="space-y-4">
      {offers.map((offer) => (
        <div
          key={offer.offer_id}
          className="p-4 border rounded-lg bg-white shadow-sm space-y-2"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium">Offer Amount: ${offer.amount.toLocaleString()}</p>
              <p className="text-sm text-gray-500">
                From: {offer.buyer.toBase58().slice(0, 8)}...
              </p>
              <p className="text-sm text-gray-500">
                Expires: {new Date(offer.expiration_time).toLocaleDateString()}
              </p>
            </div>
            <div className="space-x-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReject(offer.offer_id)}
              >
                Reject
              </Button>
              <Button
                size="sm"
                onClick={() => onAccept(offer.offer_id)}
              >
                Accept
              </Button>
            </div>
          </div>
        </div>
      ))}
      {offers.length === 0 && (
        <p className="text-center text-gray-500 py-4">
          No offers received yet.
        </p>
      )}
    </div>
  );};

const MyProperties = () => {
  const { publicKey } = useWallet();
  const {
    getUserProperties,
    getPropertyOffers,
    respondToOffer,
    updateProperty,
    executeSale,
    listProperty,
  } = usePropertyActions();

  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [showOffersDialog, setShowOffersDialog] = useState(false);

  const userProperties = getUserProperties();

  const handleAddProperty = (formData: Omit<Property, 'property_id' | 'owner' | 'is_active' | 'created_at' | 'updated_at' | 'nft_mint'>) => {
    listProperty(formData);
  };

  const handleViewOffers = (property: Property) => {
    setSelectedProperty(property);
    setShowOffersDialog(true);
  };

  const handleAcceptOffer = (offerId: string) => {
    respondToOffer(offerId, true);
  };

  const handleRejectOffer = (offerId: string) => {
    respondToOffer(offerId, false);
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
      setShowOffersDialog(false);
    }
  };

  if (!publicKey) {
    return (
      <div className="container mx-auto py-8 text-center">
        <p className="text-gray-500">Please connect your wallet to view your properties.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">My Properties</h1>
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
        {userProperties.map((property) => (
          <div key={property.property_id} className="relative">
            <PropertyCard
              property={property}
              onUpdateProperty={handleUpdateProperty}
              onExecuteSale={handleExecuteSale}
              offers={getPropertyOffers(property.property_id)}
            />
            <Button
              className="mt-2 w-full"
              variant="outline"
              onClick={() => handleViewOffers(property)}
            >
              View Offers
            </Button>
          </div>
        ))}
      </div>

      {userProperties.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No Properties Listed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              You haven't listed any properties yet. Click the "List New Property" button to get started.
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={showOffersDialog} onOpenChange={setShowOffersDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Property Offers</DialogTitle>
          </DialogHeader>
          {selectedProperty && (
            <OfferList
              offers={getPropertyOffers(selectedProperty.property_id)}
              onAccept={handleAcceptOffer}
              onReject={handleRejectOffer}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyProperties;