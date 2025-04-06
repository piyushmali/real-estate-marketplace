export interface Offer {
  id: string;
  property_id: string;
  buyer_wallet: string;
  seller_wallet?: string;
  amount: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  created_at: string;
  updated_at: string;
  expiration_time: string;
} 