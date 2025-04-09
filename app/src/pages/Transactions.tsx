import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, Check, Clock } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { getTransactionHistory } from "@/services/transactionService";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createContext, useContext } from "react";
import { Badge } from "@/components/ui/badge";

// Define Transaction type
interface Transaction {
  id: string;
  property_id: string;
  seller_wallet: string;
  buyer_wallet: string;
  price: number;
  timestamp: string;
  transaction_signature?: string;
  status?: 'confirmed' | 'pending';
}

// Helper function to format wallet addresses
const formatWalletAddress = (address: string) => {
  if (!address) return '';
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

// Helper function to format transaction signatures
const formatSignature = (signature: string) => {
  if (!signature) return '';
  return `${signature.substring(0, 6)}...${signature.substring(signature.length - 4)}`;
};

// Create a context to provide transaction refreshing functionality
type TransactionContextType = {
  refreshTransactions: () => Promise<void>;
};

export const TransactionContext = createContext<TransactionContextType | null>(null);

export function useTransactionRefresh() {
  return useContext(TransactionContext);
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Add auto-refresh interval for transaction data
  const AUTO_REFRESH_INTERVAL = 15000; // 15 seconds
  
  // Get auth token from localStorage
  const getAuthToken = (): string | null => {
    const token = localStorage.getItem('jwt_token');
    if (token) {
      return token;
    }
    
    // Try to get from session storage as fallback
    const sessionToken = sessionStorage.getItem('jwt_token');
    if (sessionToken) {
      return sessionToken;
    }
    
    return null;
  };
  
  // Make fetchTransactions a memoized callback so it can be used in the context
  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const token = getAuthToken();
      if (!token) {
        setError("Authentication required. Please login.");
        setIsLoading(false);
        return;
      }
      
      console.log("Fetching transaction history...");
      const fetchedTransactions = await getTransactionHistory(token);
      console.log("Fetched transactions:", fetchedTransactions);
      
      // Sort transactions by timestamp (newest first) to ensure most recent are at top
      const sortedTransactions = [...fetchedTransactions].sort((a, b) => {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
      
      console.log("Sorted transactions:", sortedTransactions);
      setTransactions(sortedTransactions);
    } catch (err) {
      console.error("Error fetching transactions:", err);
      setError("Failed to fetch transactions. Please try again.");
      toast({
        title: "Error",
        description: "Failed to fetch transaction history",
        variant: "destructive" as any
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]); // Only depends on toast so it stays stable
  
  // Fetch transactions on component mount
  useEffect(() => {
    console.log("Transactions page mounted");
    fetchTransactions();
    
    // Set up auto-refresh timer
    const refreshTimer = setInterval(() => {
      console.log("Auto-refreshing transaction data");
      fetchTransactions();
    }, AUTO_REFRESH_INTERVAL);
    
    // Cleanup function to clear interval when component unmounts
    return () => {
      console.log("Transactions page unmounting, clearing refresh timer");
      clearInterval(refreshTimer);
    };
  }, [fetchTransactions]);
  
  // Function to view transaction details in the Solana Explorer
  const handleViewTransaction = (transaction: Transaction) => {
    // Check if we have a transaction signature to use
    if (transaction.transaction_signature) {
      // Open the transaction in Solana Explorer using the actual signature
      window.open(`https://explorer.solana.com/tx/${transaction.transaction_signature}?cluster=devnet`, '_blank');
    } else {
      // Fallback to a demo link if no signature is available
      window.open(`https://explorer.solana.com/tx/${transaction.id}?cluster=devnet`, '_blank');
    }
  };
  
  return (
    <TransactionContext.Provider value={{ refreshTransactions: fetchTransactions }}>
      {/* Page header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <div className="md:flex md:items-center md:justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold leading-7 text-neutral-900 sm:text-3xl sm:truncate">
                Transaction History
              </h2>
            </div>
            <div className="mt-4 flex md:mt-0 md:ml-4">
              <Button 
                variant="outline"
                onClick={fetchTransactions}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="animate-spin mr-2">⟳</span>
                    Refreshing...
                  </>
                ) : (
                  'Refresh'
                )}
              </Button>
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
            ) : error ? (
              <div className="bg-red-50 text-red-800 p-4 rounded-md mb-4">
                {error}
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8">
                <h3 className="text-lg font-medium text-neutral-900">No transactions found</h3>
                <p className="mt-2 text-sm text-neutral-600">
                  There are no property transactions recorded yet
                </p>
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
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => {
                      const txDate = new Date(tx.timestamp).toLocaleDateString();
                      const price = tx.price / LAMPORTS_PER_SOL; // Convert lamports to SOL
                      
                      return (
                        <TableRow key={tx.id.toString()}>
                          <TableCell className="font-mono">
                            {tx.property_id}
                          </TableCell>
                          <TableCell className="font-mono">
                            {formatWalletAddress(tx.seller_wallet)}
                          </TableCell>
                          <TableCell className="font-mono">
                            {formatWalletAddress(tx.buyer_wallet)}
                          </TableCell>
                          <TableCell>
                            {price.toFixed(2)} SOL
                          </TableCell>
                          <TableCell>{txDate}</TableCell>
                          <TableCell>
                            {tx.status === 'confirmed' ? (
                              <Badge variant="success" className="flex items-center">
                                <Check className="h-3 w-3 mr-1" />
                                Confirmed
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="flex items-center">
                                <Clock className="h-3 w-3 mr-1" />
                                Pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleViewTransaction(tx)}
                              title={tx.transaction_signature || "No signature available"}
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
    </TransactionContext.Provider>
  );
}
