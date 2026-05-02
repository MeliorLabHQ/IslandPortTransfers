import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import AdminLogin from "@/pages/AdminLogin";
import AdminBookings from "@/pages/AdminBookings";
import AdminBookingDetail from "@/pages/AdminBookingDetail";
import AdminDrivers from "@/pages/AdminDrivers";
import AdminHotels from "@/pages/AdminHotels";
import AdminZones from "@/pages/AdminZones";
import AdminRates from "@/pages/AdminRates";
import AdminPricingRules from "@/pages/AdminPricingRules";
import AdminSettings from "@/pages/AdminSettings";
import AdminEmails from "@/pages/AdminEmails";
import AdminUsers from "@/pages/AdminUsers";
import AdminPropertySettings from "@/pages/AdminPropertySettings";
import SuperAdminLogin from "@/pages/SuperAdminLogin";
import SuperAdminDashboard from "@/pages/SuperAdminDashboard";
import Signup from "@/pages/Signup";
import BookingConfirmation from "@/pages/BookingConfirmation";
import NotFound from "@/pages/not-found";
import { useProperty } from "@/hooks/useProperty";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/bookings" component={AdminBookings} />
      <Route path="/admin/bookings/:id" component={AdminBookingDetail} />
      <Route path="/admin/drivers" component={AdminDrivers} />
      <Route path="/admin/hotels" component={AdminHotels} />
      <Route path="/admin/zones" component={AdminZones} />
      <Route path="/admin/rates" component={AdminRates} />
      <Route path="/admin/pricing-rules" component={AdminPricingRules} />
      <Route path="/admin/emails" component={AdminEmails} />
      <Route path="/admin/settings" component={AdminSettings} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/property" component={AdminPropertySettings} />
      <Route path="/super-admin/login" component={SuperAdminLogin} />
      <Route path="/super-admin/properties" component={SuperAdminDashboard} />
      <Route path="/super-admin" component={SuperAdminDashboard} />
      <Route path="/signup" component={Signup} />
      <Route path="/booking/confirmation" component={BookingConfirmation} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PropertyBrandingProvider({ children }: { children: React.ReactNode }) {
  // Loads the active property and applies brand color/title as a side effect.
  useProperty();
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PropertyBrandingProvider>
          <Toaster />
          <Router />
        </PropertyBrandingProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
