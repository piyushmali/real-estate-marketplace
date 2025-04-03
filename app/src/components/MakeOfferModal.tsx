import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Property } from "@shared/schema";
import { useContext, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateServiceFee } from "@/lib/utils";
import { WalletContext } from "@/context/WalletContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

interface MakeOfferModalProps {
  property: Property;
  isOpen: boolean;
  onClose: () => void;
}

export function MakeOfferModal({ property, isOpen, onClose }: MakeOfferModalProps) {
  const { wallet } = useContext(WalletContext);
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [expiration, setExpiration] = useState("24");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const parsedAmount = parseFloat(amount) || 0;
  const serviceFee = calculateServiceFee(parsedAmount);
  const totalAmount = parsedAmount + serviceFee;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!wallet?.publicKey) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to make an offer",
        variant: "destructive",
      });
      return;
    }
    
    if (parsedAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid offer amount",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Calculate expiration time
      const expirationHours = parseInt(expiration);
      const expirationDate = new Date();
      expirationDate.setHours(expirationDate.getHours() + expirationHours);
      
      // Convert SOL to lamports (1 SOL = 10^9 lamports)
      const amountInLamports = Math.floor(parsedAmount * 1000000000);
      
      await apiRequest("POST", "/api/offers", {
        property_id: property.property_id,
        buyer_wallet: wallet.publicKey.toString(),
        amount: amountInLamports,
        expiration_time: expirationDate.toISOString(),
        note: note,
      });
      
      toast({
        title: "Offer submitted",
        description: "Your offer has been successfully submitted",
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/offers/buyer"] });
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${property.id}/offers`] });
      
      onClose();
    } catch (error) {
      toast({
        title: "Error submitting offer",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Make an Offer</DialogTitle>
          <DialogDescription>
            Submit your offer for {property.metadata_uri ? JSON.parse(atob(property.metadata_uri.split(',')[1])).title : "Property"} at {property.location}.
          </DialogDescription>
        </DialogHeader>
        
        <div className="bg-neutral-50 p-3 rounded-md mb-4">
          <div className="flex items-center justify-between">
            <span className="text-neutral-700">Listing Price:</span>
            <span className="font-mono font-medium">{(property.price / 1000000000).toFixed(2)} SOL</span>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="offer-amount">Your Offer Amount (SOL)</Label>
            <div className="relative">
              <Input
                id="offer-amount"
                type="number"
                placeholder="0.00"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pr-12"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-neutral-500 sm:text-sm">SOL</span>
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="offer-expiration">Offer Expiration</Label>
            <Select value={expiration} onValueChange={setExpiration}>
              <SelectTrigger>
                <SelectValue placeholder="Select expiration time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24">24 hours</SelectItem>
                <SelectItem value="48">48 hours</SelectItem>
                <SelectItem value="72">3 days</SelectItem>
                <SelectItem value="168">7 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="offer-note">Note to Seller (Optional)</Label>
            <Textarea
              id="offer-note"
              placeholder="Add any additional information for the seller..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          
          <div className="bg-neutral-50 p-3 rounded-md">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-700">Service Fee (2.5%):</span>
              <span className="font-mono">{serviceFee.toFixed(2)} SOL</span>
            </div>
            <div className="flex items-center justify-between font-medium mt-2">
              <span className="text-neutral-700">Total:</span>
              <span className="font-mono">{totalAmount.toFixed(2)} SOL</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-3 pt-2">
            <Button 
              type="submit" 
              className="w-full bg-amber-500 hover:bg-amber-600 text-white"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit Offer"}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              className="w-full" 
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
