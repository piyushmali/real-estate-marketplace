// src/hooks/usePropertyActions.ts
import { useState } from 'react';
import { Property, Offer, mockProperties, mockOffers } from '@/lib/mockData';
import { useWallet } from './useWallet';

export const usePropertyActions = () => {
  const { publicKey } = useWallet();
  const [properties, setProperties] = useState<Property[]>(mockProperties);
  const [offers, setOffers] = useState<Offer[]>(mockOffers);

  const listProperty = (propertyData: Omit<Property, 'property_id' | 'owner' | 'is_active' | 'created_at' | 'updated_at' | 'nft_mint'>) => {
    if (!publicKey) {
      throw new Error('Please connect your wallet before listing a property.');
    }

    const newProperty: Property = {
      ...propertyData,
      property_id: `PROP-${Date.now()}`,
      owner: publicKey,
      is_active: true,
      created_at: Date.now(),
      updated_at: Date.now(),
      nft_mint: publicKey, // In a real implementation, this would be a new NFT mint
    };

    setProperties([...properties, newProperty]);
  };

  const updateProperty = (propertyId: string, updates: Partial<Property>) => {
    setProperties(properties.map(property =>
      property.property_id === propertyId
        ? { ...property, ...updates, updated_at: Date.now() }
        : property
    ));
  };

  const makeOffer = (property: Property, amount: number) => {
    if (!publicKey) return;

    const newOffer: Offer = {
      offer_id: `OFFER-${Date.now()}`,
      buyer: publicKey,
      property,
      amount,
      status: 'Pending',
      created_at: Date.now(),
      updated_at: Date.now(),
      expiration_time: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days from now
    };

    setOffers([...offers, newOffer]);
  };

  const respondToOffer = (offerId: string, accept: boolean) => {
    setOffers(offers.map(offer =>
      offer.offer_id === offerId
        ? { ...offer, status: accept ? 'Accepted' : 'Rejected', updated_at: Date.now() }
        : offer
    ));
  };

  const executeSale = (property: Property, offer: Offer) => {
    if (offer.status !== 'Accepted') return;

    // Update property ownership and status
    setProperties(properties.map(p =>
      p.property_id === property.property_id
        ? { ...p, owner: offer.buyer, is_active: false, updated_at: Date.now() }
        : p
    ));

    // Update offer status
    setOffers(offers.map(o =>
      o.offer_id === offer.offer_id
        ? { ...o, status: 'Completed', updated_at: Date.now() }
        : o
    ));
  };

  const getPropertyOffers = (propertyId: string) => {
    return offers.filter(offer => offer.property.property_id === propertyId);
  };

  const getUserProperties = () => {
    if (!publicKey) return [];
    return properties.filter(property => property.owner.toBase58() === publicKey.toBase58());
  };

  const getUserOffers = () => {
    if (!publicKey) return [];
    return offers.filter(offer => offer.buyer.toBase58() === publicKey.toBase58());
  };

  return {
    properties,
    offers,
    listProperty,
    updateProperty,
    makeOffer,
    respondToOffer,
    executeSale,
    getPropertyOffers,
    getUserProperties,
    getUserOffers,
  };
};