import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/Badge';
import { useWallet } from '@/hooks/useWallet';

type OfferStatus = 'Pending' | 'Accepted' | 'Rejected' | 'Completed' | 'Expired';

interface Offer {
  id: string;
  property: {
    id: string;
    location: string;
    price: number;
  };
  amount: number;
  status: OfferStatus;
  created_at: string;
  expiration_time: string;
}

const getStatusColor = (status: OfferStatus) => {
  switch (status) {
    case 'Pending':
      return 'default';
    case 'Accepted':
      return 'success';
    case 'Rejected':
      return 'destructive';
    case 'Completed':
      return 'success';
    case 'Expired':
      return 'secondary';
  }
};

const MyOffers = () => {
  const { publicKey } = useWallet();

  // TODO: Fetch user's offers
  const offers: Offer[] = [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Offers</h1>

      {offers.length > 0 ? (
        <div className="grid gap-6">
          {offers.map((offer) => (
            <Card key={offer.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Offer for Property in {offer.property.location}
                </CardTitle>
                <Badge variant={getStatusColor(offer.status)}>
                  {offer.status}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Property Price:</span>
                      <span className="ml-2">{offer.property.price} SOL</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Your Offer:</span>
                      <span className="ml-2">{offer.amount} SOL</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Offered On:</span>
                      <span className="ml-2">
                        {new Date(offer.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Expires On:</span>
                      <span className="ml-2">
                        {new Date(offer.expiration_time).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <Link
                    to={`/property/${offer.property.id}`}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    View Property
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No Offers Made</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              You haven't made any offers yet. Browse properties to make your first offer.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MyOffers;