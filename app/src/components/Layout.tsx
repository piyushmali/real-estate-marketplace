import { Link, Outlet, useLocation } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';

const Layout = () => {
  const location = useLocation();
  const { disconnect } = useWallet();
  const { authenticate, logout, token } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = [
    { path: '/', label: 'Properties' },
    { path: '/my-properties', label: 'My Properties' },
    { path: '/my-offers', label: 'My Offers' },
    { path: '/transactions', label: 'Transaction History' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="text-xl font-bold text-foreground">
                Real Estate NFT
              </Link>
              <div className="hidden md:flex ml-10 items-center space-x-6">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`text-sm font-medium transition-colors hover:text-foreground/80 ${location.pathname === item.path ? 'text-foreground border-b-2 border-foreground' : 'text-foreground/60'}`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="md:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="relative text-base hover:bg-transparent focus:outline-none"
                >
                  <span className="sr-only">Open menu</span>
                  <div className="w-5 h-5 flex flex-col justify-between">
                    <span className={`block h-0.5 w-5 bg-current transform transition duration-300 ease-in-out ${isMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
                    <span className={`block h-0.5 w-5 bg-current transition duration-300 ease-in-out ${isMenuOpen ? 'opacity-0' : ''}`} />
                    <span className={`block h-0.5 w-5 bg-current transform transition duration-300 ease-in-out ${isMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
                  </div>
                </Button>
              </div>
              <div className="hidden md:flex items-center space-x-4">
                <WalletMultiButton className="!bg-primary hover:!bg-primary/90 !h-9 !px-4 !py-2" />
                {token ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      logout();
                      disconnect();
                    }}
                    size="sm"
                  >
                    Sign Out
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={authenticate}
                    size="sm"
                  >
                    Authenticate
                  </Button>
                )}
              </div>
            </div>
          </div>
          {/* Mobile menu */}
          <div className={`md:hidden ${isMenuOpen ? 'block' : 'hidden'}`}>
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${location.pathname === item.path ? 'bg-primary/10 text-foreground' : 'text-foreground/60 hover:bg-primary/5 hover:text-foreground/80'}`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <div className="pt-4 space-y-2">
                <WalletMultiButton className="!bg-primary hover:!bg-primary/90 !h-9 !px-4 !py-2 w-full" />
                {token ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      logout();
                      disconnect();
                      setIsMenuOpen(false);
                    }}
                    className="w-full"
                  >
                    Sign Out
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      authenticate();
                      setIsMenuOpen(false);
                    }}
                    className="w-full"
                  >
                    Authenticate
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;