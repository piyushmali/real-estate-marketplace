import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/Badge';

const PropertyDetails = () => {
  const { id } = useParams();
  const { publicKey } = useWallet();
  const [offerAmount, setOfferAmount] = useState('');

  // TODO: Fetch property details using property ID
  const property = {
    id,
    owner: 'owner_pubkey',
    price: 100,
    metadata_uri: 'https://example.com',
    location: 'New York',
    square_feet: 2000,
    bedrooms: 3,
    bathrooms: 2,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  const handleMakeOffer = async () => {
    // TODO: Implement make offer functionality
    console.log('Making offer:', offerAmount);
  };

  const isOwner = publicKey?.toBase58() === property.owner;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Property Details</CardTitle>
          <Badge variant={property.is_active ? 'default' : 'secondary'}>
            {property.is_active ? 'Active' : 'Sold'}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Location</Label>
              <p className="text-sm text-gray-500">{property.location}</p>
            </div>
            <div>
              <Label>Price</Label>
              <p className="text-sm text-gray-500">{property.price} SOL</p>
            </div>
            <div>
              <Label>Square Feet</Label>
              <p className="text-sm text-gray-500">{property.square_feet}</p>
            </div>
            <div>
              <Label>Bedrooms</Label>
              <p className="text-sm text-gray-500">{property.bedrooms}</p>
            </div>
            <div>
              <Label>Bathrooms</Label>
              <p className="text-sm text-gray-500">{property.bathrooms}</p>
            </div>
            <div>
              <Label>Listed On</Label>
              <p className="text-sm text-gray-500">
                {new Date(property.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {!isOwner && property.is_active && (
            <Dialog>
              <DialogTrigger asChild>
                <Button className="w-full">Make Offer</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Make an Offer</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="amount">Offer Amount (SOL)</Label>
                    <Input
                      id="amount"
                      type="number"
                      value={offerAmount}
                      onChange={(e) => setOfferAmount(e.target.value)}
                      placeholder="Enter amount in SOL"
                    />
                  </div>
                  <Button onClick={handleMakeOffer}>Submit Offer</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardContent>
      </Card>

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Offers Received</CardTitle>
          </CardHeader>
          <CardContent>
            {/* TODO: Implement offers list */}
            <p className="text-sm text-gray-500">No offers yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PropertyDetails;