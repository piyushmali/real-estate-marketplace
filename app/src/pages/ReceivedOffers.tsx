import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, X, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Offer } from "@/types/offer";
import { getPropertyOffers } from "@/services/offerService";
import { useProperties } from "@/context/PropertyContext";
import { useWallet } from "@/hooks/useWallet";
import RespondToOfferModal from "@/components/RespondToOfferModal";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

// Helper function to format wallet addresses
const formatWalletAddress = (address: string) => {
  if (!address) return '';
  return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
};

// Helper function to format dates
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

// Helper to get status badge styling
const getStatusStyles = (status: string) => {
  switch (status.toLowerCase()) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'accepted':
      return 'bg-green-100 text-green-800';
    case 'rejected':
      return 'bg-red-100 text-red-800';
    case 'expired':
      return 'bg-gray-100 text-gray-800';
    case 'completed':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export default function ReceivedOffers() {
  const { isAuthenticated, token } = useAuth();
  const { publicKey } = useWallet();
  const { properties, getProperties } = useProperties();
  const [allOffers, setAllOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [isRespondModalOpen, setIsRespondModalOpen] = useState(false);
  const { toast } = useToast();
  
  // Fetch properties owned by the user
  useEffect(() => {
    if (isAuthenticated) {
      getProperties();
    }
  }, [isAuthenticated, getProperties]);
  
  // Filter properties owned by the current user
  const myProperties = properties.filter(p => {
    const ownerString = typeof p.owner === 'string' ? p.owner : p.owner.toString();
    return publicKey && ownerString === publicKey;
  });
  
  const fetchAllOffers = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      if (!token) {
        setError("Authentication required");
        setIsLoading(false);
        return;
      }
      
      if (myProperties.length === 0) {
        console.log("No properties found");
        setAllOffers([]);
        setIsLoading(false);
        return;
      }
      
      console.log("Fetching offers for properties:", myProperties.map(p => p.property_id));
      
      // Create an array to collect all offers
      const allOffersArray: Offer[] = [];
      
      // For each property, fetch its offers
      for (const property of myProperties) {
        try {
          const propertyOffers = await getPropertyOffers(property.property_id, token);
          console.log(`Found ${propertyOffers.length} offers for property ${property.property_id}`);
          
          // Add offers to the collection with property information
          allOffersArray.push(...propertyOffers);
        } catch (err: any) {
          // Check if this is a 403 error (occurs when property ownership has changed)
          if (err.response && err.response.status === 403) {
            console.log(`Property ${property.property_id} is no longer owned by you. Refreshing properties list.`);
            // Refresh the properties list to get the updated ownership information
            getProperties();
          } else {
            console.error(`Error fetching offers for property ${property.property_id}:`, err);
          }
          // Continue with the next property even if one fails
        }
      }
      
      console.log("Combined offers:", allOffersArray);
      setAllOffers(allOffersArray);
      
      // If in development and no offers found, create mock offers for testing
      if (allOffersArray.length === 0 && process.env.NODE_ENV === 'development' && myProperties.length > 0) {
        console.log("Creating mock offers for development testing");
        
        // Generate different mock buyer wallets
        const mockBuyerWallets = [
          "BuyerWallet123456789ABCDEF",
          "DifferentBuyer987654321ZYXW",
          "ThirdBuyerXYZ123456789ABCD",
          "FourthBuyer567890ABCDEFGHIJ"
        ];
        
        // Generate a more realistic looking Solana wallet address
        const generateMockWallet = (index: number) => {
          // This creates a random Solana-like address - NOT a real address
          return mockBuyerWallets[index % mockBuyerWallets.length] || 
                 `${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
        };
        
        const mockOffers = myProperties.map((property, index) => ({
          id: `mock-offer-${index}`,
          property_id: property.property_id,
          buyer_wallet: generateMockWallet(index),
          amount: (15 + index) * LAMPORTS_PER_SOL,
          status: "pending",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          expiration_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }));
        setAllOffers(mockOffers);
      }
      
    } catch (err) {
      console.error("Error fetching offers:", err);
      setError("Failed to fetch offers. Please try again.");
      toast({
        title: "Error",
        description: "Failed to fetch your property offers"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch offers when properties are loaded
  useEffect(() => {
    if (isAuthenticated && token && myProperties.length > 0) {
      fetchAllOffers();
    }
  }, [isAuthenticated, token, myProperties.length]);
  
  // Handle refresh button click
  const handleRefresh = () => {
    fetchAllOffers();
  };
  
  // Handle respond button click
  const handleRespond = (offer: Offer) => {
    console.log("Responding to offer:", offer);
    setSelectedOffer(offer);
    setIsRespondModalOpen(true);
  };
  
  // Handle successful offer response
  const handleOfferResponseSuccess = () => {
    fetchAllOffers(); // Refresh offers list
    toast({
      title: "Success",
      description: "Your response to the offer has been processed successfully"
    });
  };
  
  // Find property details for a given property ID
  const getPropertyDetails = (propertyId: string) => {
    return myProperties.find(p => p.property_id === propertyId);
  };
  
  if (!isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 text-center">
        <div className="bg-white p-8 rounded-lg shadow-sm">
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">Connect Your Wallet</h2>
          <p className="text-neutral-600 mb-6">Please connect your wallet and sign in to view offers</p>
        </div>
      </div>
    );
  }
  
  return (
    <>
      {/* Page header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <div className="md:flex md:items-center md:justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold leading-7 text-neutral-900 sm:text-3xl sm:truncate">
                Received Offers
              </h2>
            </div>
            <div className="mt-4 flex md:mt-0 md:ml-4">
              <Button 
                variant="outline" 
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Offers on Your Properties</CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="bg-red-50 text-red-800 p-4 rounded-md mb-4">
                {error}
              </div>
            )}
            
            {isLoading ? (
              <div className="animate-pulse space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-12 bg-neutral-100 rounded"></div>
                ))}
              </div>
            ) : myProperties.length === 0 ? (
              <div className="text-center py-8">
                <h3 className="text-lg font-medium text-neutral-900">No properties found</h3>
                <p className="mt-2 text-sm text-neutral-600">You need to own properties to receive offers</p>
              </div>
            ) : allOffers.length === 0 ? (
              <div className="text-center py-8">
                <h3 className="text-lg font-medium text-neutral-900">No offers received</h3>
                <p className="mt-2 text-sm text-neutral-600">You haven't received any offers on your properties yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>Amount (SOL)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allOffers.map((offer) => {
                      const property = getPropertyDetails(offer.property_id);
                      const isPending = offer.status.toLowerCase() === 'pending';
                      
                      return (
                        <TableRow key={offer.id}>
                          <TableCell>
                            <div className="font-semibold">{offer.property_id}</div>
                            {property && <div className="text-xs text-gray-500">{property.location}</div>}
                          </TableCell>
                          <TableCell>
                            <div className="font-mono">{formatWalletAddress(offer.buyer_wallet)}</div>
                          </TableCell>
                          <TableCell>
                            {(offer.amount / LAMPORTS_PER_SOL).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusStyles(offer.status)}`}>
                              {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
                            </span>
                          </TableCell>
                          <TableCell>{formatDate(offer.created_at)}</TableCell>
                          <TableCell>{formatDate(offer.expiration_time)}</TableCell>
                          <TableCell className="text-right">
                            {isPending ? (
                              <div className="flex justify-end gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  className="bg-green-50 hover:bg-green-100 border-green-200"
                                  onClick={() => handleRespond(offer)}
                                >
                                  <Check className="h-4 w-4 mr-1 text-green-600" />
                                  Respond
                                </Button>
                              </div>
                            ) : offer.status.toLowerCase() === 'accepted' ? (
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                onClick={() => handleRespond(offer)}
                              >
                                Execute Sale
                              </Button>
                            ) : (
                              <span className="text-sm text-gray-500">No actions</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Respond to Offer Modal */}
      {selectedOffer && (
        <RespondToOfferModal
          offer={selectedOffer}
          visible={isRespondModalOpen}
          onClose={() => setIsRespondModalOpen(false)}
          onSuccess={handleOfferResponseSuccess}
          propertyNftMint={getPropertyDetails(selectedOffer.property_id)?.nft_mint}
        />
      )}
    </>
  );
} 