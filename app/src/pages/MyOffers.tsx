import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Offer } from "@/types/offer";
import { getUserOffers } from "@/services/offerService";
import { Link } from "wouter";
import ExecuteSaleModal from "@/components/ExecuteSaleModal";
import { useProperties } from "@/context/PropertyContext";
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8080';

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

export default function MyOffers() {
  const { isAuthenticated, token } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [isExecuteSaleModalOpen, setIsExecuteSaleModalOpen] = useState(false);
  const [propertyNftMint, setPropertyNftMint] = useState<string>("");
  // Get properties from useProperties hook
  const { properties } = useProperties();
  
  const fetchOffers = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      if (!token) {
        setError("Authentication required");
        setIsLoading(false);
        return;
      }
      
      const fetchedOffers = await getUserOffers(token);
      setOffers(fetchedOffers);
      console.log("Fetched offers:", fetchedOffers);
    } catch (err) {
      console.error("Error fetching offers:", err);
      setError("Failed to fetch offers. Please try again.");
      toast({
        title: "Error",
        description: "Failed to fetch your offers",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch offers on component mount
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchOffers();
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated, token]);
  
  // Handle refresh button click
  const handleRefresh = () => {
    fetchOffers();
  };
  
  // Fetch NFT mint address for a specific property
  const fetchPropertyNftMint = async (propertyId: string): Promise<string> => {
    try {
      if (!token) {
        throw new Error("Authentication token is required");
      }
      
      console.log(`Fetching NFT mint address for property: ${propertyId}`);
      
      const response = await axios.get(
        `${API_URL}/api/properties/${propertyId}/nft-mint`,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (response.status === 200 && response.data.nft_mint_address) {
        console.log(`Got NFT mint address: ${response.data.nft_mint_address}`);
        return response.data.nft_mint_address;
      } else {
        throw new Error("NFT mint address not found in response");
      }
    } catch (err) {
      console.error("Error fetching NFT mint address:", err);
      return "";
    }
  };
  
  // Handle execute sale button click
  const handleExecuteSale = async (offer: Offer) => {
    // First try to get NFT mint from properties context
    const property = getPropertyDetails(offer.property_id);
    let mintAddress = "";
    
    if (property && property.nft_mint) {
      mintAddress = property.nft_mint.toString();
    } else {
      // If not found in context, try to fetch directly from backend
      try {
        mintAddress = await fetchPropertyNftMint(offer.property_id);
      } catch (err) {
        console.warn(`Error fetching NFT mint address: ${err.message}`);
      }
    }
    
    // If we still don't have a mint address, use fallback
    if (!mintAddress) {
      console.warn(`Property NFT mint not found for ${offer.property_id}. Using test NFT mint.`);
      
      // Use a valid Solana address format for testing
      mintAddress = "11111111111111111111111111111111";
      
      toast({
        title: "Test Mode",
        description: "Using a test NFT mint address since property data is incomplete",
      });
    }
    
    setPropertyNftMint(mintAddress);
    setSelectedOffer(offer);
    setIsExecuteSaleModalOpen(true);
  };
  
  // Handle successful sale execution
  const handleSaleExecutionSuccess = () => {
    fetchOffers(); // Refresh offers list
    toast({
      title: "Success",
      description: "The property sale has been completed successfully"
    });
  };
  
  // Find property details for a given property ID
  const getPropertyDetails = (propertyId: string) => {
    const property = properties.find(p => p.property_id === propertyId);
    if (!property) {
      console.warn(`Property not found for ID: ${propertyId}`);
    }
    return property;
  };
  
  if (!isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 text-center">
        <div className="bg-white p-8 rounded-lg shadow-sm">
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">Connect Your Wallet</h2>
          <p className="text-neutral-600 mb-6">Please connect your wallet and sign in to view your offers</p>
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
                My Offers
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
            <CardTitle>Your Sent Offers</CardTitle>
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
            ) : offers.length === 0 ? (
              <div className="text-center py-8">
                <h3 className="text-lg font-medium text-neutral-900">No offers found</h3>
                <p className="mt-2 text-sm text-neutral-600">You haven't made any offers yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {offers.map((offer) => (
                      <TableRow key={offer.id}>
                        <TableCell>
                          <div className="font-semibold">{offer.property_id}</div>
                        </TableCell>
                        <TableCell>
                          ${offer.amount.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusStyles(offer.status)}`}>
                            {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
                          </span>
                        </TableCell>
                        <TableCell>{formatDate(offer.created_at)}</TableCell>
                        <TableCell>{formatDate(offer.expiration_time)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Link to={`/properties/${offer.property_id}`}>
                              <Button 
                                variant="ghost" 
                                size="sm"
                              >
                                <ExternalLink className="h-4 w-4 mr-1" />
                                View Property
                              </Button>
                            </Link>
                            
                            {offer.status.toLowerCase() === 'accepted' && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                onClick={() => handleExecuteSale(offer)}
                              >
                                Execute Sale
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Execute Sale Modal */}
      {selectedOffer && (
        <ExecuteSaleModal
          offer={selectedOffer}
          visible={isExecuteSaleModalOpen}
          onClose={() => setIsExecuteSaleModalOpen(false)}
          onSuccess={handleSaleExecutionSuccess}
          propertyNftMint={propertyNftMint}
        />
      )}
    </>
  );
}
