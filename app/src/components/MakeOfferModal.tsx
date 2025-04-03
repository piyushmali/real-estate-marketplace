import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Property } from "@/lib/mockData";
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
import { useWallet } from "@/hooks/useWallet";
import { formatWalletAddress } from "@/lib/utils";
import { useProperties } from "@/context/PropertyContext";
import { PublicKey } from "@solana/web3.js";

interface MakeOfferModalProps {
  property: Property;
  isOpen: boolean;
  onClose: () => void;
}

export function MakeOfferModal({ property, isOpen, onClose }: MakeOfferModalProps) {
  const { wallet } = useContext(WalletContext);
  const { toast } = useToast();
  const [offerAmount, setOfferAmount] = useState("");
  const [expirationDays, setExpirationDays] = useState("7");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const { connected, publicKey } = useWallet();
  const { makeOffer } = useProperties();
  
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };
  
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!offerAmount) {
      newErrors.offerAmount = "Offer amount is required";
    } else {
      const amount = Number(offerAmount);
      if (isNaN(amount) || amount <= 0) {
        newErrors.offerAmount = "Please enter a valid amount";
      }
    }
    
    if (!expirationDays) {
      newErrors.expirationDays = "Expiration days are required";
    } else {
      const days = Number(expirationDays);
      if (isNaN(days) || days < 1 || days > 30) {
        newErrors.expirationDays = "Please enter a valid number of days (1-30)";
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    if (!connected || !publicKey) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to make an offer",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // In a real implementation, we would call the Solana program make_offer function here
      // For now, we'll just use the context function
      
      const amount = Number(offerAmount);
      const days = Number(expirationDays);
      
      // Create a PublicKey from the string
      const buyer = new PublicKey(publicKey);
      
      console.log("Making offer:", {
        property_id: property.property_id,
        amount,
        expiration_days: days,
        buyer: buyer.toString(),
      });
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Add the offer using the context function
      makeOffer(property.property_id, buyer, amount, days);
      
      toast({
        title: "Offer Submitted",
        description: `Your offer of ${formatPrice(amount)} has been submitted successfully.`,
      });
      
      onClose();
    } catch (error) {
      console.error("Error making offer:", error);
      toast({
        title: "Error",
        description: "Failed to submit your offer. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Make an Offer</DialogTitle>
          <DialogDescription>
            Submit your offer for {property.location}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid gap-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Property:</span>
              <span className="text-sm">{property.location}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Listed Price:</span>
              <span className="text-sm font-semibold">{formatPrice(property.price)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Owner:</span>
              <span className="text-sm font-mono">{formatWalletAddress(property.owner.toString())}</span>
            </div>
          </div>
          
          <div className="border-t my-4" />
          
          <div className="grid gap-2">
            <Label htmlFor="offerAmount">Your Offer Amount (USD)</Label>
            <Input
              id="offerAmount"
              type="number"
              value={offerAmount}
              onChange={(e) => setOfferAmount(e.target.value)}
              placeholder="e.g., 250000"
              className={errors.offerAmount ? "border-red-500" : ""}
            />
            {errors.offerAmount && (
              <p className="text-red-500 text-xs mt-1">{errors.offerAmount}</p>
            )}
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="expirationDays">Offer Expires In (Days)</Label>
            <Input
              id="expirationDays"
              type="number"
              value={expirationDays}
              onChange={(e) => setExpirationDays(e.target.value)}
              placeholder="e.g., 7"
              min="1"
              max="30"
              className={errors.expirationDays ? "border-red-500" : ""}
            />
            {errors.expirationDays && (
              <p className="text-red-500 text-xs mt-1">{errors.expirationDays}</p>
            )}
            <p className="text-xs text-gray-500">Your offer will expire after this many days if not accepted.</p>
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
          
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Offer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
