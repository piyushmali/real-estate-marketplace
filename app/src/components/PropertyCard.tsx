import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Home, Bed, Bath, ArrowRight } from "lucide-react";

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
  return (
    <Card className="w-full max-h-80 flex flex-col overflow-hidden transition-all duration-300 hover:shadow-lg">
      <div className="relative w-full h-28 overflow-hidden">
        <img
          src={property.metadata_uri}
          alt={`Property in ${property.location}`}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.src = "/api/placeholder/400/200";
          }}
        />
        <Badge className="absolute top-2 right-2 bg-black/70 text-white text-xs font-medium">
          ${property.price.toLocaleString()}
        </Badge>
      </div>
      
      <CardHeader className="py-1 px-3">
        <CardTitle className="text-sm font-semibold line-clamp-1">{property.location}</CardTitle>
      </CardHeader>
      
      <CardContent className="py-0 px-3 flex-grow">
        <div className="grid grid-cols-3 gap-1 text-xs">
          <div className="flex items-center gap-1">
            <Home className="size-3 text-muted-foreground" />
            <span>{property.square_feet.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1">
            <Bed className="size-3 text-muted-foreground" />
            <span>{property.bedrooms} Beds</span>
          </div>
          <div className="flex items-center gap-1">
            <Bath className="size-3 text-muted-foreground" />
            <span>{property.bathrooms} Baths</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">ID: {property.property_id}</p>
      </CardContent>
      
      <CardFooter className="pt-1 pb-2 px-3 border-t mt-auto">
        <Button variant="ghost" size="sm" className="ml-auto flex items-center gap-1 text-xs px-2 py-0 h-6">
          View Details
          <ArrowRight className="size-3" />
        </Button>
      </CardFooter>
    </Card>
  );
};