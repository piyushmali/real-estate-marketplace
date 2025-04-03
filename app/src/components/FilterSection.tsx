import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Search, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

interface FilterSectionProps {
  onFilter: (filters: {
    location: string;
    priceRange: string;
    bedrooms: string;
    bathrooms: string;
    squareFeet: string;
  }) => void;
}

export function FilterSection({ onFilter }: FilterSectionProps) {
  const [location, setLocation] = useState("");
  const [priceRange, setPriceRange] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [squareFeet, setSquareFeet] = useState("");
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFilter({
      location,
      priceRange,
      bedrooms,
      bathrooms,
      squareFeet,
    });
  };
  
  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative rounded-md">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <Input
                  type="text"
                  placeholder="Search by location"
                  className="pl-10"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* Price Filter */}
              <div className="w-full">
                <Select value={priceRange} onValueChange={setPriceRange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Price (Any)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Price (Any)</SelectItem>
                    <SelectItem value="0-500000000000">Under 0.5 SOL</SelectItem>
                    <SelectItem value="500000000000-1000000000000">0.5 - 1 SOL</SelectItem>
                    <SelectItem value="1000000000000-2000000000000">1 - 2 SOL</SelectItem>
                    <SelectItem value="2000000000000-9999999999999">2+ SOL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Beds Filter */}
              <div className="w-full">
                <Select value={bedrooms} onValueChange={setBedrooms}>
                  <SelectTrigger>
                    <SelectValue placeholder="Beds (Any)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Beds (Any)</SelectItem>
                    <SelectItem value="1">1+ bed</SelectItem>
                    <SelectItem value="2">2+ beds</SelectItem>
                    <SelectItem value="3">3+ beds</SelectItem>
                    <SelectItem value="4">4+ beds</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Baths Filter */}
              <div className="w-full">
                <Select value={bathrooms} onValueChange={setBathrooms}>
                  <SelectTrigger>
                    <SelectValue placeholder="Baths (Any)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Baths (Any)</SelectItem>
                    <SelectItem value="1">1+ bath</SelectItem>
                    <SelectItem value="2">2+ baths</SelectItem>
                    <SelectItem value="3">3+ baths</SelectItem>
                    <SelectItem value="4">4+ baths</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Square Feet Filter */}
              <div className="w-full">
                <Select value={squareFeet} onValueChange={setSquareFeet}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sq Ft (Any)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Sq Ft (Any)</SelectItem>
                    <SelectItem value="1000">1000+ sq ft</SelectItem>
                    <SelectItem value="1500">1500+ sq ft</SelectItem>
                    <SelectItem value="2000">2000+ sq ft</SelectItem>
                    <SelectItem value="3000">3000+ sq ft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* More Filters Button */}
              <div className="w-full">
                <Button type="submit" variant="outline" className="w-full">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  Apply Filters
                </Button>
              </div>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
