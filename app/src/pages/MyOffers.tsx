import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";

// Mock offer data
const mockOffers = [
  {
    id: "offer1",
    property_id: "PROP-12345",
    property_location: "123 Main St, New York, NY",
    seller_wallet: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
    price: 240000,
    status: "Pending",
    created_at: new Date().getTime() - 2 * 24 * 60 * 60 * 1000,
  },
  {
    id: "offer2",
    property_id: "PROP-67890",
    property_location: "456 Oak Ave, Miami, FL",
    seller_wallet: "2q7pyhPwAwZ3QMfZrnAbDhnh9mDUqycszcpf86VgQxhD",
    price: 435000,
    status: "Accepted",
    created_at: new Date().getTime() - 5 * 24 * 60 * 60 * 1000,
  },
];

// Helper function to format wallet addresses
const formatWalletAddress = (address: string) => {
  if (!address) return '';
  return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
};

export default function MyOffers() {
  const { connected, publicKey } = useWallet();
  const [isLoading, setIsLoading] = useState(true);
  
  // Simulate loading state
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);
  
  if (!connected) {
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
            <CardTitle>Your Sent Offers</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="animate-pulse space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-neutral-100 rounded"></div>
                ))}
              </div>
            ) : mockOffers.length === 0 ? (
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
                      <TableHead>Seller</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockOffers.map((offer) => {
                      const offerDate = new Date(offer.created_at).toLocaleDateString();
                      
                      return (
                        <TableRow key={offer.id}>
                          <TableCell>
                            <div>
                              <div className="font-semibold">{formatWalletAddress(offer.property_id)}</div>
                              <div className="text-sm text-gray-500">{offer.property_location}</div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono">
                            {formatWalletAddress(offer.seller_wallet)}
                          </TableCell>
                          <TableCell>
                            ${offer.price.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              offer.status === "Pending" 
                                ? "bg-yellow-100 text-yellow-800" 
                                : offer.status === "Accepted" 
                                  ? "bg-green-100 text-green-800"
                                  : "bg-gray-100 text-gray-800"
                            }`}>
                              {offer.status}
                            </span>
                          </TableCell>
                          <TableCell>{offerDate}</TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {}}
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
