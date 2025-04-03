import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilterSection } from "@/components/FilterSection";
import { PropertyGrid } from "@/components/PropertyGrid";
import { Pagination } from "@/components/Pagination";
import { Property } from "@shared/schema";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function Marketplace() {
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    location: "",
    priceRange: "",
    bedrooms: "",
    bathrooms: "",
    squareFeet: "",
  });
  
  const resultsPerPage = 8;
  
  // Parse filter values
  const getApiFilters = () => {
    const apiFilters: Record<string, string> = {};
    
    if (filters.location) {
      apiFilters.location = filters.location;
    }
    
    if (filters.priceRange) {
      const [minPrice, maxPrice] = filters.priceRange.split('-');
      if (minPrice) apiFilters.minPrice = minPrice;
      if (maxPrice) apiFilters.maxPrice = maxPrice;
    }
    
    if (filters.bedrooms) {
      apiFilters.minBedrooms = filters.bedrooms;
    }
    
    if (filters.bathrooms) {
      apiFilters.minBathrooms = filters.bathrooms;
    }
    
    if (filters.squareFeet) {
      apiFilters.minSquareFeet = filters.squareFeet;
    }
    
    return apiFilters;
  };
  
  // Fetch properties
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/properties', filters, currentPage],
    queryFn: async () => {
      const response = await fetch(`/api/properties?${new URLSearchParams({
        ...getApiFilters(),
        page: currentPage.toString(),
        limit: resultsPerPage.toString()
      })}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch properties');
      }
      
      return response.json();
    },
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
  
  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };
  
  const handleListProperty = () => {
    toast({
      title: "Feature coming soon",
      description: "Property listing will be available in a future update"
    });
  };
  
  return (
    <>
      {/* Page header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <div className="md:flex md:items-center md:justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold leading-7 text-neutral-900 sm:text-3xl sm:truncate">
                Property Marketplace
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
        <FilterSection onFilter={handleFilterChange} />
        
        <PropertyGrid properties={properties} isLoading={isLoading} />
        
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
