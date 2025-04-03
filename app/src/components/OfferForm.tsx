// src/components/OfferForm.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Property } from '@/lib/api';

interface OfferFormProps {
  property: Property;
  onSubmit: (amount: number) => void;
  onCancel: () => void;
}

export const OfferForm = ({ property, onSubmit, onCancel }: OfferFormProps) => {
  const [amount, setAmount] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const offerAmount = parseFloat(amount);

    if (isNaN(offerAmount) || offerAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (offerAmount >= property.price) {
      setError('Offer amount must be less than the listing price');
      return;
    }

    onSubmit(offerAmount);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="amount">Offer Amount (USD)</Label>
        <Input
          id="amount"
          type="number"
          placeholder="Enter your offer amount"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setError('');
          }}
          className="w-full"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      <div className="flex justify-between items-center mt-6">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          Submit Offer
        </Button>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        <p>Property Details:</p>
        <p>Location: {property.location}</p>
        <p>Listing Price: ${property.price.toLocaleString()}</p>
      </div>
    </form>
  );
};