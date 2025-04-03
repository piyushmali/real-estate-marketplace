import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalResults: number;
  resultsPerPage: number;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalResults,
  resultsPerPage
}: PaginationProps) {
  const startResult = (currentPage - 1) * resultsPerPage + 1;
  const endResult = Math.min(currentPage * resultsPerPage, totalResults);
  
  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };
  
  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };
  
  // Create array of page numbers to display
  const pageNumbers = [];
  const maxPageButtons = 5;
  
  if (totalPages <= maxPageButtons) {
    // Show all pages if we have fewer than maxPageButtons
    for (let i = 1; i <= totalPages; i++) {
      pageNumbers.push(i);
    }
  } else {
    // Always show first page
    pageNumbers.push(1);
    
    // Calculate start and end of truncated page range
    let startPage = Math.max(2, currentPage - 1);
    let endPage = Math.min(totalPages - 1, currentPage + 1);
    
    // Adjust if we're at the start or end
    if (currentPage <= 2) {
      endPage = 4;
    } else if (currentPage >= totalPages - 1) {
      startPage = totalPages - 3;
    }
    
    // Add ellipsis before truncated range if needed
    if (startPage > 2) {
      pageNumbers.push(-1); // -1 represents ellipsis
    }
    
    // Add the truncated range
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }
    
    // Add ellipsis after truncated range if needed
    if (endPage < totalPages - 1) {
      pageNumbers.push(-2); // -2 represents ellipsis (using a different value for key)
    }
    
    // Always show last page
    if (totalPages > 1) {
      pageNumbers.push(totalPages);
    }
  }
  
  return (
    <div className="mt-6 flex items-center justify-between border-t border-neutral-200 bg-white px-4 py-3 sm:px-6">
      {/* Mobile view */}
      <div className="flex flex-1 justify-between sm:hidden">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={currentPage === 1}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          onClick={handleNext}
          disabled={currentPage === totalPages}
        >
          Next
        </Button>
      </div>
      
      {/* Desktop view */}
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-neutral-700">
            Showing <span className="font-medium">{startResult}</span> to{" "}
            <span className="font-medium">{endResult}</span> of{" "}
            <span className="font-medium">{totalResults}</span> results
          </p>
        </div>
        <div>
          <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
            {/* Previous button */}
            <Button
              variant="outline"
              className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
              onClick={handlePrevious}
              disabled={currentPage === 1}
            >
              <span className="sr-only">Previous</span>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            
            {/* Page numbers */}
            {pageNumbers.map((page, index) => {
              if (page < 0) {
                // Render ellipsis
                return (
                  <span
                    key={page}
                    className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 focus:outline-offset-0"
                  >
                    ...
                  </span>
                );
              }
              
              // Render page number
              return (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold focus:z-20 ${
                    currentPage === page
                      ? "z-10 bg-primary text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      : "text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-offset-0"
                  }`}
                  onClick={() => onPageChange(page)}
                >
                  {page}
                </Button>
              );
            })}
            
            {/* Next button */}
            <Button
              variant="outline"
              className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
              onClick={handleNext}
              disabled={currentPage === totalPages}
            >
              <span className="sr-only">Next</span>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </nav>
        </div>
      </div>
    </div>
  );
}
