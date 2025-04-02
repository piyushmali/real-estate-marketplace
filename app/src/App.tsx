// src/App.tsx
import { useEffect, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { endpoint } from "@/lib/wallet";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { useAuth } from "@/hooks/useAuth";
import { useProperties } from "@/hooks/useProperties";
import { PropertyCard } from "@/components/PropertyCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import "@solana/wallet-adapter-react-ui/styles.css";

function App() {
  const { token, authenticate, logout, error, loading, connected } = useAuth();
  const { fetchProperties } = useProperties();
  const [properties, setProperties] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
            {/* Header */}
            <header className="bg-black text-white p-6 shadow-md">
              <div className="max-w-7xl mx-auto flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight">
                  Solana Property Marketplace
                </h1>
                <WalletMultiButton className="!bg-white !text-black hover:!bg-gray-200 transition-colors duration-200 rounded-md" />
              </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto p-6">
              {/* Authentication Section */}
              <div className="mb-8">
                {!token ? (
                  <div className="flex flex-col gap-3">
                    <Button
                      onClick={authenticate}
                      disabled={loading || !connected}
                      className={cn(
                        "bg-black text-white hover:bg-gray-800 w-fit",
                        (loading || !connected) && "bg-gray-600 text-gray-300 cursor-not-allowed"
                      )}
                      size="lg"
                    >
                      {loading ? "Authenticating..." : "Authenticate with Phantom"}
                    </Button>
                    {error && (
                      <Badge variant="destructive" className="w-fit">
                        {error}
                      </Badge>
                    )}
                    {!connected && (
                      <p className="text-gray-600 text-sm">
                        Please connect your wallet to authenticate.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="bg-green-600 text-white">
                        Authenticated
                      </Badge>
                      <p className="text-sm text-gray-700">
                        JWT Token: {token.slice(0, 20)}...
                      </p>
                    </div>
                    <Button
                      onClick={logout}
                      variant="destructive"
                      className="w-fit"
                      size="sm"
                    >
                      Logout
                    </Button>
                  </div>
                )}
              </div>

              {/* Transaction Signing Modal */}
              {token && (
                <div className="mb-8">
                  <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-black text-white hover:bg-gray-800">
                        Sign Transaction
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-white text-black">
                      <DialogHeader>
                        <DialogTitle>Sign with Phantom</DialogTitle>
                      </DialogHeader>
                      <p>Sign a transaction to proceed (mock for now).</p>
                      <Button
                        onClick={handleSign}
                        className="bg-black text-white hover:bg-gray-800"
                      >
                        Sign
                      </Button>
                    </DialogContent>
                  </Dialog>
                </div>
              )}

              {/* Property Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {properties.map((property) => (
                  <PropertyCard key={property.property_id} property={property} />
                ))}
              </div>
            </main>
    </div>
  );
}

export default App;