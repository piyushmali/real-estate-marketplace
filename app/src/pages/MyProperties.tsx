import { useState, useEffect, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { PropertyGrid } from "@/components/PropertyGrid";
import { Pagination } from "@/components/Pagination";
import { WalletContext } from "@/context/WalletContext";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function MyProperties() {
  const { wallet } = useContext(WalletContext);
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const resultsPerPage = 8;
  
  // Fetch properties for connected wallet
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/properties/owner', wallet?.publicKey?.toString(), currentPage],
    queryFn: async () => {
      if (!wallet?.publicKey) {
        throw new Error('Wallet not connected');
      }
      
      const response = await fetch(`/api/properties/owner/${wallet.publicKey.toString()}?page=${currentPage}&limit=${resultsPerPage}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch properties');
      }
      
      return response.json();
    },
    enabled: !!wallet?.publicKey,
  });
  
  useEffect(() => {
    if (error) {
      toast({
        title: "Error fetching properties",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  }, [error, toast]);
  
  const properties = data?.properties || [];
  const totalResults = data?.total || 0;
  const totalPages = Math.ceil(totalResults / resultsPerPage);
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo(0, 0);
  };
  
  const handleListProperty = () => {
    toast({
      title: "Feature coming soon",
      description: "Property listing will be available in a future update"
    });
  };
  
  if (!wallet?.publicKey) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 text-center">
        <div className="bg-white p-8 rounded-lg shadow-sm">
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">Connect Your Wallet</h2>
          <p className="text-neutral-600 mb-6">Please connect your Solana wallet to view your properties</p>
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
                My Properties
              </h2>
            </div>
            <div className="mt-4 flex md:mt-0 md:ml-4">
              <Button onClick={handleListProperty} variant="secondary" className="bg-amber-500 hover:bg-amber-600 text-white">
                <Plus className="h-4 w-4 mr-1" />
                List Property
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <PropertyGrid properties={properties} isLoading={isLoading} />
        
        {!isLoading && totalResults === 0 && (
          <div className="mt-6 text-center py-10 bg-white rounded-lg shadow">
            <h3 className="text-lg font-medium text-neutral-900">No properties found</h3>
            <p className="mt-2 text-sm text-neutral-600">You don't have any properties listed yet</p>
            <Button onClick={handleListProperty} className="mt-4" variant="secondary">List a Property</Button>
          </div>
        )}
        
        {!isLoading && totalPages > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            totalResults={totalResults}
            resultsPerPage={resultsPerPage}
          />
        )}
      </div>
    </>
  );
}
