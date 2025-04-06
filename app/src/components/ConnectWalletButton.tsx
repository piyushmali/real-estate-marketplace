import { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/hooks/useAuth";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Copy, ExternalLink, LogOut } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export function ConnectWalletButton() {
  const { connected, connectWallet, disconnectWallet, publicKey, needsAuthentication, setAuthenticated } = useWallet();
  const { authenticate, token, logout, loading, error, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Display error from useAuth hook
  useEffect(() => {
    if (error) {
      setErrorMessage(error);
      setShowError(true);
      const timer = setTimeout(() => {
        setShowError(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Auto-authenticate when needed
  useEffect(() => {
    if (connected && needsAuthentication && !isAuthenticated && !loading) {
      console.log("Wallet needs authentication - automatically authenticating");
      handleAuthenticate();
    }
  }, [connected, needsAuthentication, isAuthenticated, loading]);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      setErrorMessage(null);
      await connectWallet();
      // Authentication will happen automatically in useAuth hook if needed
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect wallet";
      setErrorMessage(message);
      setShowError(true);
      console.error("Failed to connect wallet:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setErrorMessage(null);
      await disconnectWallet();
      if (token) {
        logout();
      }
      toast({
        title: "Wallet disconnected",
        description: "Your wallet has been disconnected"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to disconnect wallet";
      setErrorMessage(message);
      setShowError(true);
      console.error("Failed to disconnect wallet:", error);
    }
  };

  const handleLogout = async () => {
    try {
      setErrorMessage(null);
      logout();
      toast({
        title: "Signed out",
        description: "You have been signed out successfully"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sign out";
      setErrorMessage(message);
      setShowError(true);
      console.error("Failed to sign out:", error);
    }
  };

  const handleAuthenticate = async () => {
    try {
      setErrorMessage(null);
      if (connected && (!isAuthenticated || needsAuthentication)) {
        await authenticate();
        // Mark as authenticated so we don't keep prompting
        setAuthenticated();
        toast({
          title: "Authenticated",
          description: "You have been authenticated successfully"
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed";
      setErrorMessage(message);
      setShowError(true);
    }
  };

  const copyAddress = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey);
    toast({
      title: "Address copied",
      description: "Your wallet address has been copied to clipboard"
    });
  };

  const openExplorer = () => {
    if (!publicKey) return;
    window.open(`https://explorer.solana.com/address/${publicKey}`, '_blank');
  };

  // Truncate wallet address for display
  const truncatedAddress = publicKey ? 
    `${publicKey.substring(0, 4)}...${publicKey.substring(publicKey.length - 4)}` : 
    "";

  if (!connected) {
    return (
      <div className="relative">
        <button
          disabled={isConnecting}
          onClick={handleConnect}
          className="bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 px-4 rounded"
        >
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </button>
        
        {/* Error message tooltip */}
        {showError && errorMessage && (
          <div className="absolute top-full mt-2 right-0 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded shadow-md z-50 w-64">
            <p className="text-sm">{errorMessage}</p>
          </div>
        )}
      </div>
    );
  }

  if (connected && (!isAuthenticated || needsAuthentication)) {
    return (
      <div className="relative">
        <button
          disabled={loading}
          onClick={handleAuthenticate}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        >
          {loading ? "Authenticating..." : `Authenticate ${truncatedAddress}`}
        </button>
        
        {/* Error message tooltip */}
        {showError && errorMessage && (
          <div className="absolute top-full mt-2 right-0 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded shadow-md z-50 w-64">
            <p className="text-sm">{errorMessage}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex items-center">
            <span>{truncatedAddress}</span>
            <span className="ml-2 h-2 w-2 rounded-full bg-green-500"></span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={copyAddress}>
            <Copy className="mr-2 h-4 w-4" />
            <span>Copy Address</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openExplorer}>
            <ExternalLink className="mr-2 h-4 w-4" />
            <span>View on Explorer</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign Out</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDisconnect}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Disconnect Wallet</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      {/* Error message tooltip */}
      {showError && errorMessage && (
        <div className="absolute top-full mt-2 right-0 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded shadow-md z-50 w-64">
          <p className="text-sm">{errorMessage}</p>
        </div>
      )}
    </div>
  );
} 