import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Offer } from "@/types/offer";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getPropertyOffers } from "@/services/offerService";
import RespondToOfferModal from "./RespondToOfferModal";

interface PropertyOffersTableProps {
  propertyId: string;
  nftMint?: string;
}

export default function PropertyOffersTable({ propertyId, nftMint }: PropertyOffersTableProps) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchOffers = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get token from localStorage or sessionStorage
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token) {
        console.error("No auth token found");
        setError("Authentication required");
        setIsLoading(false);
        return;
      }
      
      console.log(`Fetching offers for property: ${propertyId} with token: ${token.substring(0, 10)}...`);
      
      try {
        const fetchedOffers = await getPropertyOffers(propertyId, token);
        console.log("Fetched offers:", fetchedOffers);
        setOffers(fetchedOffers);
      } catch (apiError) {
        console.error("API error:", apiError);
        
        // For testing/debugging - show a mock offer if API fails
        if (process.env.NODE_ENV === 'development') {
          console.log("Using mock offers data for development");
          const mockOffer: Offer = {
            id: "mock-offer-1",
            property_id: propertyId,
            buyer_wallet: "BuyerWalletAddress123456789",
            amount: 15 * LAMPORTS_PER_SOL,
            status: "pending",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            expiration_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
          };
          setOffers([mockOffer]);
        } else {
          throw apiError; // Re-throw in production
        }
      }
    } catch (err) {
      console.error("Error fetching property offers:", err);
      setError("Failed to fetch offers. Please try again.");
      toast({
        title: "Error",
        description: "Failed to fetch property offers",
        variant: "destructive" as any
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch offers on component mount
  useEffect(() => {
    console.log("PropertyOffersTable mounted for property:", propertyId);
    fetchOffers();
  }, [propertyId]);
  
  // Handle respond button click
  const handleRespond = (offer: Offer) => {
    console.log("Responding to offer:", offer);
    setSelectedOffer(offer);
    setIsModalOpen(true);
  };
  
  // Handle successful offer response
  const handleOfferResponseSuccess = () => {
    fetchOffers(); // Refresh offers list
    toast({
      title: "Success",
      description: "Your response to the offer has been processed successfully",
    });
  };
  
  // Format date helper
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
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
  
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-neutral-100 rounded"></div>
        ))}
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-50 text-red-800 p-4 rounded-md mb-4">
        {error}
      </div>
    );
  }
  
  if (offers.length === 0) {
    return (
      <div className="text-center py-8">
        <h3 className="text-lg font-medium text-neutral-900">No offers found</h3>
        <p className="mt-2 text-sm text-neutral-600">
          There are no offers for this property yet
        </p>
      </div>
    );
  }
  
  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>From</TableHead>
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
                  <div className="font-mono text-sm truncate max-w-[150px]">
                    {offer.buyer_wallet.substring(0, 6)}...{offer.buyer_wallet.substring(offer.buyer_wallet.length - 4)}
                  </div>
                </TableCell>
                <TableCell>
                  {(offer.amount / LAMPORTS_PER_SOL).toFixed(2)} SOL
                </TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusStyles(offer.status)}`}>
                    {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
                  </span>
                </TableCell>
                <TableCell>{formatDate(offer.created_at)}</TableCell>
                <TableCell>{formatDate(offer.expiration_time)}</TableCell>
                <TableCell className="text-right">
                  {offer.status.toLowerCase() === 'pending' && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleRespond(offer)}
                    >
                      Respond
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {/* Response Modal */}
      {selectedOffer && (
        <RespondToOfferModal
          offer={selectedOffer}
          visible={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={handleOfferResponseSuccess}
          propertyNftMint={nftMint}
        />
      )}
    </>
  );
} 