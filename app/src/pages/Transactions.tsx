import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatWalletAddress } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink } from "lucide-react";

export default function Transactions() {
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const resultsPerPage = 10;
  
  // Fetch transactions
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/transactions', currentPage],
    queryFn: async () => {
      const response = await fetch(`/api/transactions?page=${currentPage}&limit=${resultsPerPage}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }
      
      return response.json();
    },
  });
  
  if (error) {
    toast({
      title: "Error fetching transactions",
      description: error instanceof Error ? error.message : "Unknown error occurred",
      variant: "destructive",
    });
  }
  
  const transactions = data?.transactions || [];
  
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
            ) : transactions.length === 0 ? (
              <div className="text-center py-8">
                <h3 className="text-lg font-medium text-neutral-900">No transactions found</h3>
                <p className="mt-2 text-sm text-neutral-600">There are no completed transactions yet</p>
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
                    {transactions.map((tx) => {
                      const txDate = new Date(tx.timestamp).toLocaleDateString();
                      
                      return (
                        <TableRow key={tx.id}>
                          <TableCell className="font-mono">
                            {formatWalletAddress(tx.property_id, 6, 4)}
                          </TableCell>
                          <TableCell className="font-mono">
                            {formatWalletAddress(tx.seller_wallet)}
                          </TableCell>
                          <TableCell className="font-mono">
                            {formatWalletAddress(tx.buyer_wallet)}
                          </TableCell>
                          <TableCell className="font-mono">
                            {(tx.price / 1000000000).toFixed(2)} SOL
                          </TableCell>
                          <TableCell>{txDate}</TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => window.open(`https://explorer.solana.com/address/${tx.property_id}`, '_blank')}
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
