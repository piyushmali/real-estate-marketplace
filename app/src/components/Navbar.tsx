import { Link } from "wouter";
import { ConnectWalletButton } from "./ConnectWalletButton";

export function Navbar() {
  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-2.5">
      <div className="flex flex-wrap justify-between items-center mx-auto max-w-screen-xl">
        <Link href="/" className="flex items-center">
          <span className="text-blue-800 font-semibold text-xl">SolEstate</span>
        </Link>
        
        <div className="flex items-center">
          <div className="hidden md:flex md:space-x-8 mr-8">
            <Link href="/marketplace" className="text-gray-700 hover:text-blue-700">
              Marketplace
            </Link>
            <Link href="/my-properties" className="text-gray-700 hover:text-blue-700">
              My Properties
            </Link>
            <Link href="/my-offers" className="text-gray-700 hover:text-blue-700">
              My Offers
            </Link>
            <Link href="/transactions" className="text-gray-700 hover:text-blue-700">
              Transactions
            </Link>
          </div>
          
          <ConnectWalletButton />
        </div>
      </div>
    </nav>
  );
} 