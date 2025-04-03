import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink } from "lucide-react";

// Mock transaction data
const mockTransactions = [
  {
    id: "tx1",
    property_id: "PROP-12345",
    seller_wallet: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
    buyer_wallet: "2q7pyhPwAwZ3QMfZrnAbDhnh9mDUqycszcpf86VgQxhD",
    price: 250000,
    timestamp: new Date().getTime() - 24 * 60 * 60 * 1000,
  },
  {
    id: "tx2",
    property_id: "PROP-67890",
    seller_wallet: "2q7pyhPwAwZ3QMfZrnAbDhnh9mDUqycszcpf86VgQxhD",
    buyer_wallet: "3rULXe4mYVB6tkB5EZexNQEJv6DQtKjZqxEBqRt8h6cU",
    price: 450000,
    timestamp: new Date().getTime() - 7 * 24 * 60 * 60 * 1000,
  },
];

// Helper function to format wallet addresses
const formatWalletAddress = (address: string) => {
  if (!address) return '';
  return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
};

export default function Transactions() {
  const [isLoading, setIsLoading] = useState(true);
  
  // Simulate loading state
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);
  
  return (
    <>
      {/* Page header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <div className="md:flex md:items-center md:justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold leading-7 text-neutral-900 sm:text-3xl sm:truncate">
                Transaction History
              </h2>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Recent Property Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="animate-pulse space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-neutral-100 rounded"></div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property ID</TableHead>
                      <TableHead>Seller</TableHead>
                      <TableHead>Buyer</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockTransactions.map((tx) => {
                      const txDate = new Date(tx.timestamp).toLocaleDateString();
                      
                      return (
                        <TableRow key={tx.id}>
                          <TableCell className="font-mono">
                            {formatWalletAddress(tx.property_id)}
                          </TableCell>
                          <TableCell className="font-mono">
                            {formatWalletAddress(tx.seller_wallet)}
                          </TableCell>
                          <TableCell className="font-mono">
                            {formatWalletAddress(tx.buyer_wallet)}
                          </TableCell>
                          <TableCell>
                            ${tx.price.toLocaleString()}
                          </TableCell>
                          <TableCell>{txDate}</TableCell>
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
