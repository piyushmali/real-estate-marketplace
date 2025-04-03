import { useState, useEffect, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { WalletContext } from "@/context/WalletContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatWalletAddress } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink } from "lucide-react";

export default function MyOffers() {
  const { wallet } = useContext(WalletContext);
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const resultsPerPage = 10;
  
  // Fetch offers for connected wallet
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/offers/buyer', wallet?.publicKey?.toString(), currentPage],
    queryFn: async () => {
      if (!wallet?.publicKey) {
        throw new Error('Wallet not connected');
      }
      
      const response = await fetch(`/api/offers/buyer/${wallet.publicKey.toString()}?page=${currentPage}&limit=${resultsPerPage}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch offers');
      }
      
      return response.json();
    },
    enabled: !!wallet?.publicKey,
  });
  
  useEffect(() => {
    if (error) {
      toast({
        title: "Error fetching offers",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  }, [error, toast]);
  
  const offers = data?.offers || [];
  
  // Helper function to get status badge variant
  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'warning';
      case 'accepted':
        return 'success';
      case 'rejected':
        return 'destructive';
      case 'expired':
        return 'default';
      default:
        return 'outline';
    }
  };
  
  if (!wallet?.publicKey) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 text-center">
        <div className="bg-white p-8 rounded-lg shadow-sm">
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">Connect Your Wallet</h2>
          <p className="text-neutral-600 mb-6">Please connect your Solana wallet to view your offers</p>
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
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Your Submitted Offers</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="animate-pulse space-y-3">
                {[...Array(5)].map((_, i) => (
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
                      <TableHead>Property ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {offers.map((offer) => {
                      const createdDate = new Date(offer.created_at).toLocaleDateString();
                      const expiresDate = new Date(offer.expiration_time).toLocaleDateString();
                      
                      return (
                        <TableRow key={offer.id}>
                          <TableCell className="font-mono">
                            {formatWalletAddress(offer.property_id, 6, 4)}
                          </TableCell>
                          <TableCell className="font-mono">
                            {(offer.amount / 1000000000).toFixed(2)} SOL
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadgeVariant(offer.status)}>
                              {offer.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{createdDate}</TableCell>
                          <TableCell>{expiresDate}</TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => window.open(`https://explorer.solana.com/address/${offer.property_id}`, '_blank')}
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              View
                            </Button>
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
    </>
  );
}
