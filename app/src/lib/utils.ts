import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatWalletAddress(address: string, start = 4, end = 4): string {
  if (!address) return '';
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

export function formatSOL(amount: number): string {
  return amount.toFixed(2);
}

export function calculateServiceFee(amount: number, feePercentage = 0.025): number {
  return amount * feePercentage;
}

export function getTruncatedDescription(description: string, maxLength = 100): string {
  if (description.length <= maxLength) return description;
  return description.substring(0, maxLength) + '...';
}

export function getPropertyStatusBadgeProps(status: string) {
  switch (status.toLowerCase()) {
    case 'active':
      return { variant: 'success' as const, label: 'Active' };
    case 'pending':
    case 'offer pending':
      return { variant: 'warning' as const, label: 'Offer Pending' };
    case 'sold':
      return { variant: 'destructive' as const, label: 'Sold' };
    default:
      return { variant: 'outline' as const, label: status };
  }
}
