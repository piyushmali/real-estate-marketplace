import { Link } from "wouter";
import { ConnectWalletButton } from "./ConnectWalletButton";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, Home, Menu, X, Plus } from "lucide-react";
import { useState, useEffect } from "react";
import { useListPropertyButton } from "@/components/Layout";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose
} from "@/components/ui/sheet";

export function Navbar() {
  const { isAuthenticated, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { hasPageButton } = useListPropertyButton();

  // Track window size for responsive behavior
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    // Initial check
    checkIfMobile();
    
    // Add event listener
    window.addEventListener("resize", checkIfMobile);
    
    // Cleanup
    return () => window.removeEventListener("resize", checkIfMobile);
  }, []);

  const navLinks = [
    { name: "Marketplace", path: "/" },
    { name: "My Properties", path: "/my-properties" },
    { name: "My Offers", path: "/my-offers" },
    { name: "Received Offers", path: "/received-offers" },
    { name: "Transactions", path: "/transactions" },
  ];
  
  return (
    <nav className="bg-white border-b border-blue-600 shadow-sm px-4 py-2.5 sticky top-0 z-50">
      <div className="flex flex-wrap justify-between items-center mx-auto max-w-screen-xl">
        <Link href="/" className="flex items-center">
          <img 
            src="/solulab.png" 
            alt="Solulab Logo" 
            className="h-10 mr-2" 
          />
          <span className="text-blue-800 font-semibold text-xl">Solulab Real Estate</span>
        </Link>
        
        <div className="flex items-center">
          {/* Desktop Navigation */}
          <div className="hidden md:flex md:space-x-8 mr-8">
            {navLinks.map((link) => (
              <Link 
                key={link.path} 
                href={link.path} 
                className="text-blue-700 hover:text-blue-900 text-xl font-semibold"
              >
                {link.name}
              </Link>
            ))}
          </div>
          
          <div className="flex items-center space-x-4">
            {isAuthenticated && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={logout}
                className="hidden md:flex items-center"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </Button>
            )}
            <ConnectWalletButton />
            
            {/* List Property Button - Only show if no button exists in the page */}
            {!hasPageButton && isAuthenticated && (
              <Link href="/list-property">
                <Button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="h-4 w-4" />
                  <span className="hidden md:inline">List Property</span>
                  <span className="md:hidden">List</span>
                </Button>
              </Link>
            )}
            
            {/* Mobile Menu Button */}
            <Sheet>
              <SheetTrigger asChild>
                <Button 
                  variant="secondary" 
                  size="icon" 
                  className="md:hidden bg-blue-100 hover:bg-blue-200 border border-blue-200"
                  aria-label="Toggle menu"
                >
                  <Menu className="h-6 w-6 text-blue-700" />
                </Button>
              </SheetTrigger>
              <SheetContent 
                side="left" 
                className="w-[280px] sm:w-[350px] border-none p-0"
                style={{ backgroundColor: '#1a2d58' }}
              >
                <SheetHeader className="mb-6 p-4">
                  <SheetTitle className="text-left text-xl font-bold text-white">
                    <div className="flex items-center">
                      <img 
                        src="/solulab.png" 
                        alt="Solulab Logo" 
                        className="h-8 mr-2" 
                      />
                      Solulab Real Estate
                    </div>
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col space-y-4 py-4">
                  {navLinks.map((link) => (
                    <SheetClose key={link.path} asChild>
                      <Link 
                        href={link.path}
                        className="flex items-center py-3 px-8 text-lg font-medium text-blue-400 hover:text-blue-300"
                      >
                        {link.name}
                      </Link>
                    </SheetClose>
                  ))}
                  
                  {/* Add List Property button to mobile menu if authenticated */}
                  {!hasPageButton && isAuthenticated && (
                    <SheetClose asChild>
                      <Link href="/list-property">
                        <div className="flex items-center py-3 px-8 text-lg font-medium text-blue-400 hover:text-blue-300">
                          <Plus className="mr-2 h-4 w-4" />
                          List Property
                        </div>
                      </Link>
                    </SheetClose>
                  )}
                  
                  {isAuthenticated && (
                    <SheetClose asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={logout}
                        className="flex items-center mt-4 mx-4 justify-start bg-transparent border-white text-white hover:bg-blue-800 hover:text-white"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                      </Button>
                    </SheetClose>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
} 