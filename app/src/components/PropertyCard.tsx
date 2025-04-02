import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Home, Bed, Bath, ArrowRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface Property {
  property_id: string;
  price: number;
  metadata_uri: string;
  location: string;
  square_feet: number;
  bedrooms: number;
  bathrooms: number;
}

export const PropertyCard = ({ property }: { property: Property }) => {
  // Generate a random gradient for each property card
  const gradientColors = [
    "from-blue-500 to-purple-600",
    "from-emerald-500 to-teal-600",
    "from-pink-500 to-rose-600",
    "from-amber-500 to-orange-600",
    "from-indigo-500 to-violet-600"
  ];
  
  const randomGradient = gradientColors[Math.floor(Math.random() * gradientColors.length)];
  
  return (
    <Card className="w-[360px] h-[380px] flex flex-col overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.02] rounded-xl border border-gray-200 m-4">
      <div className="relative w-full h-40 overflow-hidden">
        <div className={cn("absolute inset-0 bg-gradient-to-r", randomGradient, "opacity-40")}></div>
        <img
          src={property.metadata_uri}
          alt={`Property in ${property.location}`}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.src = "/api/placeholder/400/200";
          }}
        />
        <Badge className="absolute top-3 right-3 bg-white/90 text-black font-bold text-sm px-3 py-1 rounded-full shadow-md">
          ${property.price.toLocaleString()}
        </Badge>
      </div>
      
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-1 mb-1">
          <MapPin className="size-4 text-rose-500" />
          <CardTitle className="text-base font-bold line-clamp-1">{property.location}</CardTitle>
        </div>
      </CardHeader>
      
      <CardContent className="py-0 px-4 flex-grow">
        <div className="grid grid-cols-3 gap-3 text-sm mt-2">
          <div className="flex flex-col items-center p-2 bg-gray-50 rounded-lg">
            <Home className="size-5 text-blue-600 mb-1" />
            <span className="font-medium">{property.square_feet.toLocaleString()} ft²</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-gray-50 rounded-lg">
            <Bed className="size-5 text-indigo-600 mb-1" />
            <span className="font-medium">{property.bedrooms} Beds</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-gray-50 rounded-lg">
            <Bath className="size-5 text-teal-600 mb-1" />
            <span className="font-medium">{property.bathrooms} Baths</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3 font-mono">ID: {property.property_id}</p>
      </CardContent>
      
      <CardFooter className="pt-3 pb-4 px-4 border-t mt-auto">
        <Button className="ml-auto flex items-center gap-2 bg-black text-white hover:bg-gray-800 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md">
          View Details
          <ArrowRight className="size-4" />
        </Button>
      </CardFooter>
    </Card>
  );
};