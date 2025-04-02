import { useEffect, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { endpoint, wallets } from "@/lib/wallet";
import { useWalletConnection } from "@/hooks/useWallet";
import { useProperties } from "@/hooks/useProperties";
import { PropertyCard } from "@/components/PropertyCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import "@solana/wallet-adapter-react-ui/styles.css";

function App() {
  const { publicKey, connected } = useWalletConnection();
  const { fetchProperties } = useProperties();
  const [properties, setProperties] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetchProperties()
      .then(setProperties)
      .finally(() => setIsLoading(false));
  }, []);

  const handleSign = () => {
    alert("Signing with Phantom (TBD)");
  };

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <header className="bg-primary text-primary-foreground sticky top-0 z-10 shadow-md">
              <div className="max-w-7xl mx-auto flex justify-between items-center px-6 py-4">
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                  <span className="hidden sm:inline">Solana</span> Property Marketplace
                </h1>
                <WalletMultiButton className="!bg-white !text-black hover:!bg-gray-200 transition-colors duration-200" />
              </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6">
              {connected && (
                <div className="mb-8 bg-card rounded-lg p-4 shadow">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-medium mb-1">Wallet Connected</h2>
                      <p className="text-sm text-muted-foreground font-mono break-all">
                        {publicKey?.toBase58()}
                      </p>
                    </div>
                    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="whitespace-nowrap">
                          Sign Transaction
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Sign with Phantom</DialogTitle>
                        </DialogHeader>
                        <p>Sign a transaction to proceed (mock for now).</p>
                        <div className="flex justify-end mt-4">
                          <Button onClick={handleSign}>
                            Sign
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              )}

              {/* Property Section */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold mb-4">Featured Properties</h2>
                
                {isLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-96 rounded-lg bg-muted animate-pulse"></div>
                    ))}
                  </div>
                ) : properties.length === 0 ? (
                  <div className="text-center py-12 bg-muted/30 rounded-lg">
                    <p className="text-lg text-muted-foreground">No properties found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {properties.map((property) => (
                      <PropertyCard key={property.property_id} property={property} />
                    ))}
                  </div>
                )}
              </div>
            </main>
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;