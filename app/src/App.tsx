// src/App.tsx
import { useState, useEffect } from "react";
import { Properties } from "@/pages/Properties";
import { useAuth } from "@/hooks/useAuth";
import { useProperties } from "@/hooks/useProperties";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Home, Wallet, KeyRound, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { PropertyCard } from "@/components/PropertyCard";
import { PropertyForm } from "@/components/PropertyForm";

function App() {
  const { token, authenticate, logout, error, loading, connected } = useAuth();
  const { fetchProperties } = useProperties();
  const [properties, setProperties] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  useEffect(() => {
    fetchProperties().then((fetchedProperties) => {
      // Deduplicate properties by property_id
      const uniqueProperties = Array.from(
        new Map(fetchedProperties.map((p) => [p.property_id, p])).values()
      );
      setProperties(uniqueProperties);
    });
  }, []);

  useEffect(() => {
    console.log("App - Wallet Connected:", connected);
  }, [connected]);

  const handleSign = () => {
    alert("Signing with Phantom (TBD)");
  };

  const handlePropertySubmit = (data: any) => {
    const newProperty = {
      property_id: Date.now().toString(),
      ...data
    };
    setProperties([newProperty, ...properties]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900">
            {/* Header */}
            <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6 shadow-lg">
              <div className="max-w-7xl mx-auto flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Home className="size-8 text-white" />
                  <h1 className="text-3xl font-bold tracking-tight">
                    Solana Property Marketplace
                  </h1>
                </div>
                <WalletMultiButton className="!bg-white !text-indigo-700 hover:!bg-gray-100 transition-colors duration-200 rounded-full shadow-md font-medium" />
              </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto p-8">
              {/* Authentication Section */}
              <div className="mb-10 bg-white p-6 rounded-xl shadow-md border border-gray-100">
                {!token ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Wallet className="size-6 text-indigo-600" />
                      <h2 className="text-xl font-bold text-gray-800">Wallet Authentication</h2>
                    </div>
                    <Button
                      onClick={authenticate}
                      disabled={loading || !connected}
                      className={cn(
                        "bg-gradient-to-r from-indigo-600 to-blue-600 text-white hover:from-indigo-700 hover:to-blue-700 w-fit rounded-full shadow-md transition-all duration-300",
                        (loading || !connected) && "bg-gray-400 text-gray-100 cursor-not-allowed opacity-70"
                      )}
                      size="lg"
                    >
                      {loading ? "Authenticating..." : "Authenticate with Phantom"}
                    </Button>
                    {error && (
                      <Badge variant="destructive" className="w-fit px-3 py-1 text-sm font-medium rounded-full">
                        {error}
                      </Badge>
                    )}
                    {!connected && (
                      <p className="text-gray-600 text-sm bg-gray-50 p-3 rounded-lg border-l-4 border-indigo-400">
                        Please connect your wallet using the button in the header to authenticate.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 mb-2">
                      <KeyRound className="size-6 text-green-600" />
                      <h2 className="text-xl font-bold text-gray-800">Authentication Status</h2>
                    </div>
                    <div className="flex items-center gap-3 bg-green-50 p-4 rounded-lg border border-green-200">
                      <Badge variant="default" className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-3 py-1 rounded-full shadow-sm">
                        Authenticated
                      </Badge>
                      <p className="text-sm text-gray-700 font-mono bg-white px-3 py-1 rounded-md border border-gray-200">
                        JWT Token: {token.slice(0, 20)}...
                      </p>
                    </div>
                    <Button
                      onClick={logout}
                      variant="destructive"
                      className="w-fit flex items-center gap-2 rounded-full"
                      size="sm"
                    >
                      <LogOut className="size-4" />
                      Logout
                    </Button>
                  </div>
                )}
              </div>

              {/* Transaction Signing Modal */}
              {token && (
                <div className="mb-10">
                  <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 rounded-full shadow-md transition-all duration-300">
                        Sign Transaction
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-white text-black border-0 shadow-2xl rounded-xl overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-purple-50 opacity-50 z-0"></div>
                      <DialogHeader className="relative z-10">
                        <DialogTitle className="text-xl font-bold text-indigo-800">Sign with Phantom</DialogTitle>
                      </DialogHeader>
                      <div className="relative z-10 bg-white p-4 rounded-lg shadow-sm border border-gray-100 my-2">
                        <p className="text-gray-700">Sign a transaction to proceed with your property purchase (mock for now).</p>
                      </div>
                      <div className="flex justify-end relative z-10 mt-2">
                        <Button
                          onClick={handleSign}
                          className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 rounded-full shadow-md transition-all duration-300"
                        >
                          Sign with Phantom
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              )}

              {/* Property Form */}
              {token && (
                <div className="mb-10">
                  <h2 className="text-2xl font-bold text-gray-800 mb-4">Add New Property</h2>
                  <PropertyForm onSubmit={handlePropertySubmit} />
                </div>
              )}

              {/* Property Filters */}
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Available Properties</h2>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {["all", "apartments", "houses", "villas", "commercial"].map((filter) => (
                    <Button 
                      key={filter}
                      onClick={() => setActiveFilter(filter)}
                      className={cn(
                        "rounded-full px-4 py-2 transition-all duration-200",
                        activeFilter === filter 
                          ? "bg-indigo-600 text-white shadow-md" 
                          : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
                      )}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* Property Grid */}
              <div className="flex flex-wrap gap-8 justify-start">
                {properties.map((property) => (
                  <PropertyCard key={property.property_id} property={property} />
                ))}
              </div>
            </main>
    </div>
  );
}

export default App;