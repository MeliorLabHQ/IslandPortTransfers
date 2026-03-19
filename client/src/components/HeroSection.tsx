import { Calendar, MapPin, Users, Plane, Check, Link as LinkIcon, Building2, Mail, Ship, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import heroImage from "@assets/30189_1773942664009.jpg";
import type { Hotel, Port } from "@shared/schema";

export default function HeroSection() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("hotel");
  const [currentStep, setCurrentStep] = useState(1);
  
  // Common fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [partySize, setPartySize] = useState("1");
  const [flightNumber, setFlightNumber] = useState("");
  const [vehicleClass, setVehicleClass] = useState("");
  const [selectedPort, setSelectedPort] = useState("");
  
  // Hotel tab specific
  const [selectedHotel, setSelectedHotel] = useState("");
  const [hotelSearchOpen, setHotelSearchOpen] = useState(false);
  
  // Destination link tab specific
  const [destinationLink, setDestinationLink] = useState("");

  // Fetch hotels for dropdown
  const { data: hotels } = useQuery<Hotel[]>({
    queryKey: ["/api/hotels"],
  });

  // Fetch ports for dropdown
  const { data: ports } = useQuery<Port[]>({
    queryKey: ["/api/ports"],
  });

  // Fetch port-hotel rate for pricing display (hotel bookings only)
  const { data: portHotelRate } = useQuery<{ price: string | null }>({
    queryKey: [`/api/port-hotel-rate?portId=${selectedPort}&hotelId=${selectedHotel}`],
    enabled: activeTab === "hotel" && !!selectedPort && !!selectedHotel,
  });

  // Fetch large party surcharge settings
  const { data: surchargeSettings } = useQuery<{ amount: string; minPartySize: string }>({
    queryKey: ["/api/settings/large-party-surcharge"],
  });

  // Fetch tax settings
  const { data: taxSettings } = useQuery<{ percentage: string }>({
    queryKey: ["/api/settings/tax"],
  });

  // Calculate total price including surcharge and tax
  const calculateTotalPrice = () => {
    if (!portHotelRate?.price) return null;
    const basePrice = parseFloat(portHotelRate.price);
    const minPartySize = surchargeSettings ? parseInt(surchargeSettings.minPartySize) : 4;
    const surchargeAmount = surchargeSettings ? parseFloat(surchargeSettings.amount) : 20;
    const taxPercentage = taxSettings ? parseInt(taxSettings.percentage) : 0;
    const currentPartySize = parseInt(partySize) || 1;
    
    const surcharge = currentPartySize >= minPartySize ? surchargeAmount : 0;
    const subtotal = basePrice + surcharge;
    const taxAmount = (subtotal * taxPercentage) / 100;
    const total = subtotal + taxAmount;
    
    return { basePrice, surcharge, taxAmount, taxPercentage, total };
  };

  const getPickupLocation = () => {
    const port = ports?.find(p => p.id === selectedPort);
    return port?.name || "Airport";
  };

  const getDropoffLocation = () => {
    if (activeTab === "hotel") {
      const hotel = hotels?.find(h => h.id === selectedHotel);
      return hotel?.name || "";
    }
    return destinationLink || "";
  };

  const createBookingMutation = useMutation({
    mutationFn: async () => {
      const pickupDateTime = date && time ? new Date(`${date}T${time}`) : new Date(date);
      
      const response = await apiRequest("POST", "/api/bookings", {
        bookingType: activeTab,
        customerName: fullName,
        customerEmail: email,
        customerPhone: contactNumber,
        pickupLocation: getPickupLocation(),
        dropoffLocation: getDropoffLocation(),
        hotelId: activeTab === "hotel" ? selectedHotel : null,
        destinationLink: activeTab === "destination" ? destinationLink : null,
        arrivalPortId: selectedPort || null,
        pickupDate: pickupDateTime.toISOString(),
        partySize: parseInt(partySize),
        flightNumber,
        vehicleClass,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (activeTab === "destination") {
        setLocation(`/booking/confirmation?ref=${data.referenceNumber}`);
      } else {
        toast({
          title: "Booking created!",
          description: `Your booking reference is ${data.referenceNumber}. We'll contact you shortly.`,
        });
        resetForm();
      }
    },
    onError: () => {
      toast({
        title: "Booking failed",
        description: "There was an error creating your booking. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setCurrentStep(1);
    setFullName("");
    setEmail("");
    setContactNumber("");
    setDate("");
    setTime("");
    setPartySize("1");
    setFlightNumber("");
    setVehicleClass("");
    setSelectedPort("");
    setSelectedHotel("");
    setDestinationLink("");
  };

  const validateStep1 = () => {
    if (!selectedPort) {
      toast({
        title: "Arrival port required",
        description: "Please select your port of arrival.",
        variant: "destructive",
      });
      return false;
    }
    if (activeTab === "hotel" && !selectedHotel) {
      toast({
        title: "Hotel required",
        description: "Please select a hotel from the dropdown.",
        variant: "destructive",
      });
      return false;
    }
    if (activeTab === "destination" && !destinationLink) {
      toast({
        title: "Destination link required",
        description: "Please enter your Airbnb or Google Maps link.",
        variant: "destructive",
      });
      return false;
    }
    if (!date || !time || !partySize || !flightNumber || !vehicleClass) {
      toast({
        title: "Required fields missing",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!fullName || !email || !contactNumber) {
      toast({
        title: "Required fields missing",
        description: "Please fill in all contact details.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (currentStep === 1 && validateStep1()) {
      setCurrentStep(2);
    } else if (currentStep === 2 && validateStep2()) {
      setCurrentStep(3);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const [isRedirectingToStripe, setIsRedirectingToStripe] = useState(false);

  const handleCheckout = async () => {
    if (activeTab === "hotel") {
      // Hotel bookings: Redirect to Stripe for payment first
      setIsRedirectingToStripe(true);
      try {
        const pricing = calculateTotalPrice();
        const response = await fetch("/api/hotel-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hotelId: selectedHotel,
            portId: selectedPort,
            customerName: fullName,
            customerEmail: email,
            customerPhone: contactNumber,
            pickupDate: date,
            pickupTime: time,
            partySize: parseInt(partySize),
            vehicleClass,
            flightNumber,
            totalAmount: pricing?.total.toFixed(2) || "0",
            basePrice: pricing?.basePrice || 0,
            surcharge: pricing?.surcharge || 0,
            taxAmount: pricing?.taxAmount || 0,
          }),
        });
        
        const data = await response.json();
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          throw new Error(data.error || "Failed to create checkout session");
        }
      } catch (error) {
        setIsRedirectingToStripe(false);
        toast({
          title: "Checkout failed",
          description: "There was an error redirecting to payment. Please try again.",
          variant: "destructive",
        });
      }
    } else {
      // Destination bookings: Create booking directly (admin will send payment link later)
      createBookingMutation.mutate();
    }
  };

  const getVehicleClassName = () => {
    switch (vehicleClass) {
      case "standard": return "Standard (1-3 Pax)";
      case "luxury": return "Luxury (1-4 Pax)";
      case "minivan": return "Minivan (4+ Pax)";
      default: return vehicleClass;
    }
  };

  return (
    <div className="relative min-h-[600px] lg:min-h-[700px] overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.3)), url(${heroImage})`,
        }}
      />
      
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="text-white">
            <div className="mb-6">
              <h1 className="text-3xl lg:text-5xl font-heading font-semibold mb-4 leading-tight">
                Premium Airport Transfers in St. Lucia
              </h1>
              <p className="text-lg text-white/80">
                Book your comfortable ride from the airport to your destination in under 60 seconds.
              </p>
            </div>
          </div>

          <div className="w-full max-w-md lg:max-w-lg mx-auto lg:mx-0 lg:ml-auto">
            <div className="bg-white rounded-lg p-6 lg:p-8" style={{ boxShadow: "var(--shadow-xl)" }}>
              
              {/* Step 1: Location Selection with Tabs */}
              {currentStep === 1 && (
                <>
                  <div className="mb-6">
                    <h2 className="text-2xl font-heading font-semibold text-foreground mb-2">
                      Book Your Transfer
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Select your destination type and fill in the details below.
                    </p>
                  </div>

                  <Tabs value={activeTab} onValueChange={(value) => {
                    setActiveTab(value);
                    setSelectedHotel("");
                    setDestinationLink("");
                  }} className="mb-4">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="hotel" data-testid="tab-hotel" className="gap-2">
                        <Building2 className="w-4 h-4" />
                        Hotel
                      </TabsTrigger>
                      <TabsTrigger value="destination" data-testid="tab-destination" className="gap-2">
                        <LinkIcon className="w-4 h-4" />
                        Destination Link
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="hotel" className="mt-4 space-y-4">
                      <div>
                        <Label className="text-sm font-medium mb-1.5 block">
                          Select Hotel <span className="text-destructive">*</span>
                        </Label>
                        <Popover open={hotelSearchOpen} onOpenChange={setHotelSearchOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={hotelSearchOpen}
                              data-testid="select-hotel"
                              className="h-12 w-full justify-between font-normal"
                            >
                              <div className="flex items-center">
                                <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                                {selectedHotel
                                  ? hotels?.find((hotel) => hotel.id === selectedHotel)?.name
                                  : "Search for your hotel..."}
                              </div>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[400px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Type hotel name..." />
                              <CommandList>
                                <CommandEmpty>No hotel found.</CommandEmpty>
                                <CommandGroup>
                                  {hotels?.map((hotel) => (
                                    <CommandItem
                                      key={hotel.id}
                                      value={hotel.name}
                                      onSelect={() => {
                                        setSelectedHotel(hotel.id);
                                        setHotelSearchOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          selectedHotel === hotel.id ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      {hotel.name}
                                      {hotel.zone && <span className="text-muted-foreground ml-2">- {hotel.zone}</span>}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="destination" className="mt-4 space-y-4">
                      <div>
                        <Label className="text-sm font-medium mb-1.5 block">
                          Airbnb or Google Maps Link <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            data-testid="input-destination-link"
                            placeholder="Paste your Airbnb or Google Maps link"
                            className="pl-10 h-12"
                            value={destinationLink}
                            onChange={(e) => setDestinationLink(e.target.value)}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Share your accommodation link so we can find your location
                        </p>
                      </div>
                    </TabsContent>
                  </Tabs>

                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium mb-1.5 block">
                        Port of Arrival <span className="text-destructive">*</span>
                      </Label>
                      <Select value={selectedPort} onValueChange={setSelectedPort}>
                        <SelectTrigger data-testid="select-port" className="h-12">
                          <Ship className="w-4 h-4 mr-2 text-muted-foreground" />
                          <SelectValue placeholder="Select airport or ferry terminal" />
                        </SelectTrigger>
                        <SelectContent>
                          {ports?.map((port) => (
                            <SelectItem key={port.id} value={port.id}>
                              {port.name} ({port.code})
                            </SelectItem>
                          ))}
                          {(!ports || ports.length === 0) && (
                            <SelectItem value="no-ports" disabled>
                              No ports available
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="date" className="text-sm font-medium mb-1.5 block">
                          Pickup Date <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="date"
                            data-testid="input-date"
                            type="date"
                            className="pl-10 h-12"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="time" className="text-sm font-medium mb-1.5 block">
                          Pickup Time <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="time"
                          data-testid="input-time"
                          type="time"
                          className="h-12"
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="partySize" className="text-sm font-medium mb-1.5 block">
                          Passengers <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="partySize"
                            data-testid="input-party-size"
                            type="number"
                            min="1"
                            max="8"
                            className="pl-10 h-12"
                            value={partySize}
                            onChange={(e) => setPartySize(e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="flightNumber" className="text-sm font-medium mb-1.5 block">
                          Flight/Ferry # <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <Plane className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="flightNumber"
                            data-testid="input-flight-number"
                            placeholder="AA1234"
                            className="pl-10 h-12"
                            value={flightNumber}
                            onChange={(e) => setFlightNumber(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-medium mb-1.5 block">
                        Vehicle Type <span className="text-destructive">*</span>
                      </Label>
                      <Select value={vehicleClass} onValueChange={setVehicleClass}>
                        <SelectTrigger data-testid="select-vehicle-class" className="h-12">
                          <SelectValue placeholder="Select vehicle type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">Standard (1-3 Passengers)</SelectItem>
                          <SelectItem value="luxury">Luxury (1-4 Passengers)</SelectItem>
                          <SelectItem value="minivan">Minivan (4+ Passengers)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      data-testid="button-next-step1"
                      className="w-full h-12 text-base font-semibold"
                      onClick={handleNext}
                    >
                      Continue
                    </Button>
                  </div>
                </>
              )}

              {/* Step 2: Personal Information */}
              {currentStep === 2 && (
                <>
                  <div className="mb-6">
                    <h2 className="text-2xl font-heading font-semibold text-foreground mb-2">
                      Your Contact Details
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      We'll use this information to confirm your booking.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="fullName" className="text-sm font-medium mb-1.5 block">
                        Full Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="fullName"
                        data-testid="input-full-name"
                        placeholder="Enter your full name"
                        className="h-12"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor="email" className="text-sm font-medium mb-1.5 block">
                        Email <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="email"
                        data-testid="input-email"
                        type="email"
                        placeholder="your.email@example.com"
                        className="h-12"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor="contactNumber" className="text-sm font-medium mb-1.5 block">
                        Phone Number <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="contactNumber"
                        data-testid="input-contact-number"
                        type="tel"
                        placeholder="+1 (234) 567-8900"
                        className="h-12"
                        value={contactNumber}
                        onChange={(e) => setContactNumber(e.target.value)}
                      />
                    </div>

                    <div className="flex gap-3 pt-4">
                      <Button
                        data-testid="button-back-step2"
                        variant="outline"
                        className="flex-1 h-12 text-base font-semibold"
                        onClick={handleBack}
                      >
                        Back
                      </Button>
                      <Button
                        data-testid="button-next-step2"
                        className="flex-1 h-12 text-base font-semibold"
                        onClick={handleNext}
                      >
                        Review Booking
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {/* Step 3: Confirmation */}
              {currentStep === 3 && (
                <>
                  <div className="mb-6">
                    <h2 className="text-2xl font-heading font-semibold text-foreground mb-2">
                      Confirm Your Booking
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Review your booking details below.
                    </p>
                  </div>

                  <div className="border border-border rounded-md p-6 mb-6">
                    {activeTab === "hotel" ? (
                      (() => {
                        const pricing = calculateTotalPrice();
                        return (
                          <>
                            <h3 className="text-center text-lg font-semibold text-foreground mb-2">
                              Booking Fee
                            </h3>
                            {pricing ? (
                              <>
                                <div className="text-center text-5xl font-bold text-primary mb-2">
                                  ${pricing.total.toFixed(2)}
                                </div>
                                {(pricing.surcharge > 0 || pricing.taxAmount > 0) && (
                                  <div className="text-center text-sm text-muted-foreground mb-4">
                                    <span className="block">Base rate: ${pricing.basePrice.toFixed(2)}</span>
                                    {pricing.surcharge > 0 && (
                                      <span className="block text-amber-600 dark:text-amber-400">
                                        + ${pricing.surcharge.toFixed(2)} large party fee ({partySize}+ travelers)
                                      </span>
                                    )}
                                    {pricing.taxAmount > 0 && (
                                      <span className="block text-muted-foreground">
                                        + ${pricing.taxAmount.toFixed(2)} tax ({pricing.taxPercentage}%)
                                      </span>
                                    )}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="text-center text-5xl font-bold text-primary mb-6">
                                Quote pending
                              </div>
                            )}
                          </>
                        );
                      })()
                    ) : (
                      <>
                        <div className="flex items-center justify-center mb-3">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <Mail className="w-6 h-6 text-primary" />
                          </div>
                        </div>
                        <h3 className="text-center text-lg font-semibold text-foreground mb-2">
                          Custom Quote Required
                        </h3>
                        <p className="text-center text-sm text-muted-foreground mb-4">
                          Since you're traveling to a custom destination, we'll send you a personalized pricing quote via email after you submit this booking.
                        </p>
                        <div className="bg-muted/50 rounded-md p-3 mb-4">
                          <p className="text-center text-xs text-muted-foreground">
                            Please check your email at <strong className="text-foreground">{email}</strong> for your quote and payment link.
                          </p>
                        </div>
                      </>
                    )}

                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-foreground">
                          <strong>Pickup:</strong> {getPickupLocation()}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-foreground">
                          <strong>Destination:</strong> {activeTab === "hotel" 
                            ? hotels?.find(h => h.id === selectedHotel)?.name 
                            : "Custom Location (link provided)"}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-foreground">
                          <strong>Date & Time:</strong> {date} at {time}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-foreground">
                          <strong>Passengers:</strong> {partySize}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-foreground">
                          <strong>Vehicle:</strong> {getVehicleClassName()}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-foreground">
                          <strong>Flight:</strong> {flightNumber}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      data-testid="button-back-step3"
                      variant="outline"
                      className="flex-1 h-12 text-base font-semibold"
                      onClick={handleBack}
                    >
                      Back
                    </Button>
                    <Button
                      data-testid="button-checkout"
                      className="flex-1 h-12 text-base font-semibold"
                      onClick={handleCheckout}
                      disabled={createBookingMutation.isPending || isRedirectingToStripe}
                    >
                      {isRedirectingToStripe 
                        ? "Redirecting to payment..." 
                        : createBookingMutation.isPending 
                          ? "Processing..." 
                          : activeTab === "hotel" 
                            ? "Pay & Confirm" 
                            : "Submit Booking"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
