import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useContext, useState } from "react";
import { WalletContext } from "@/context/WalletContext";
import { apiRequest } from "@/lib/queryClient";
import { formatWalletAddress } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut, Copy, ExternalLink } from "lucide-react";

// This component is now deprecated, use ConnectWalletButton instead
export function LegacyWalletConnectButton() {
  const { wallet, connectWallet, disconnectWallet, signMessage } = useContext(WalletContext);
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  
  const handleConnect = async () => {
    if (wallet) return;
    
    try {
      setIsConnecting(true);
      await connectWallet();
      setIsConnecting(false);
      
      // Authenticate with backend
      if (wallet?.publicKey) {
        const timestamp = Date.now();
        const message = `Timestamp: ${timestamp}`;
        
        try {
          const signature = await signMessage(message);
          
          if (signature) {
            await apiRequest("POST", "/api/auth", {
              public_key: wallet.publicKey.toString(),
              signature: signature,
              timestamp: timestamp
            });
            
            toast({
              title: "Wallet connected & authenticated",
              description: "You're now connected to SolEstate marketplace",
              variant: "success"
            });
          }
        } catch (error) {
          toast({
            title: "Authentication failed",
            description: "Failed to authenticate with the server",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      setIsConnecting(false);
      toast({
        title: "Connection failed",
        description: error instanceof Error ? error.message : "Failed to connect wallet",
        variant: "destructive",
      });
    }
  };
  
  const handleDisconnect = () => {
    if (!wallet) return;
    disconnectWallet();
    toast({
      title: "Wallet disconnected",
      description: "Your wallet has been disconnected",
      variant: "default"
    });
  };
  
  const copyAddress = () => {
    if (!wallet?.publicKey) return;
    navigator.clipboard.writeText(wallet.publicKey.toString());
    toast({
      title: "Address copied",
      description: "Your wallet address has been copied to clipboard",
      variant: "success"
    });
  };
  
  const openExplorer = () => {
    if (!wallet?.publicKey) return;
    window.open(`https://explorer.solana.com/address/${wallet.publicKey.toString()}`, '_blank');
  };
  
  if (!wallet) {
    return (
      <Button 
        onClick={handleConnect}
        disabled={isConnecting}
      >
        {isConnecting ? "Connecting..." : "Connect Wallet"}
      </Button>
    );
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="border-neutral-300 flex items-center gap-2">
          <span className="font-mono">{formatWalletAddress(wallet.publicKey.toString())}</span>
          <span className="h-2 w-2 rounded-full bg-green-500"></span>
        </Button>
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
        <DropdownMenuItem onClick={handleDisconnect}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Disconnect</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
