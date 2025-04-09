import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { PropertyGrid } from "@/components/PropertyGrid";
import { PropertyForm } from "@/components/PropertyForm";
import { Modal } from "@/components/Modal";
import { PropertyProvider, useProperties } from "@/context/PropertyContext";
import { useListPropertyButton } from "@/components/Layout";

// Intermediate component to handle data loading
function MarketplaceContent() {
  const { isAuthenticated } = useAuth();
  const { getProperties, isLoading } = useProperties();
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const { setHasPageButton } = useListPropertyButton();
  
  // Fetch properties when the component mounts
  useEffect(() => {
    getProperties();
  }, [getProperties]);
  
  // Set that this page has a List Property button
  useEffect(() => {
    setHasPageButton(true);
    return () => setHasPageButton(false);
  }, [setHasPageButton]);
  
  const handleOpenPropertyForm = () => {
    setShowPropertyForm(true);
  };
  
  const handleClosePropertyForm = () => {
    setShowPropertyForm(false);
  };
  
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Property Marketplace</h1>
          <p className="mt-1 text-gray-600">Browse and list real estate properties</p>
        </div>
        
        {/* Restore the original List Property button */}
        <button
          onClick={handleOpenPropertyForm}
          disabled={!isAuthenticated}
          className={`
            px-4 py-2 rounded-md flex items-center space-x-2
            ${isAuthenticated
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-300 cursor-not-allowed text-gray-500'}
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          <span>List Property</span>
        </button>
      </div>
      
      {!isAuthenticated && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                Connect and authenticate your wallet to list properties.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div>
        </div>
      ) : (
        <PropertyGrid />
      )}
      
      <Modal isOpen={showPropertyForm} onClose={handleClosePropertyForm}>
        <PropertyForm onClose={handleClosePropertyForm} />
      </Modal>
    </div>
  );
}

export default function Marketplace() {
  return (
    <PropertyProvider>
      <MarketplaceContent />
    </PropertyProvider>
  );
}
