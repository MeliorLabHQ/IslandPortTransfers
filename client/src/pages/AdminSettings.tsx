import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Settings, Users, DollarSign, Percent, CreditCard, FlaskConical, Zap } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface LargePartySurcharge {
  amount: string;
  minPartySize: string;
}

interface TaxSettings {
  percentage: string;
}

interface StripeEnvironmentSettings {
  environment: "sandbox" | "live";
}

export default function AdminSettings() {
  const { toast } = useToast();
  const [surchargeAmount, setSurchargeAmount] = useState("");
  const [minPartySize, setMinPartySize] = useState("");
  const [taxPercentage, setTaxPercentage] = useState("");

  const { data: surchargeSettings, isLoading } = useQuery<LargePartySurcharge>({
    queryKey: ["/api/settings/large-party-surcharge"],
  });

  const { data: taxSettings, isLoading: taxLoading } = useQuery<TaxSettings>({
    queryKey: ["/api/settings/tax"],
  });

  const { data: stripeEnvSettings, isLoading: stripeEnvLoading } = useQuery<StripeEnvironmentSettings>({
    queryKey: ["/api/settings/stripe-environment"],
  });

  useEffect(() => {
    if (surchargeSettings) {
      setSurchargeAmount(surchargeSettings.amount);
      setMinPartySize(surchargeSettings.minPartySize);
    }
  }, [surchargeSettings]);

  useEffect(() => {
    if (taxSettings) {
      setTaxPercentage(taxSettings.percentage);
    }
  }, [taxSettings]);

  const saveSurchargeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/settings", {
        key: "large_party_surcharge_amount",
        value: surchargeAmount,
        description: "Additional fee charged when party size is equal to or exceeds the minimum threshold",
      });
      await apiRequest("POST", "/api/admin/settings", {
        key: "large_party_min_size",
        value: minPartySize,
        description: "Minimum number of travelers to trigger the large party surcharge",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/large-party-surcharge"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: "Surcharge settings saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const saveTaxMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/settings", {
        key: "tax_percentage",
        value: taxPercentage,
        description: "Tax percentage applied to all bookings",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/tax"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: "Tax settings saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save tax settings", variant: "destructive" });
    },
  });

  const handleSurchargeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!surchargeAmount || parseFloat(surchargeAmount) < 0) {
      toast({ title: "Please enter a valid surcharge amount", variant: "destructive" });
      return;
    }
    
    if (!minPartySize || parseInt(minPartySize) < 2) {
      toast({ title: "Minimum party size must be at least 2", variant: "destructive" });
      return;
    }
    
    saveSurchargeMutation.mutate();
  };

  const handleTaxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const taxValue = parseInt(taxPercentage);
    if (isNaN(taxValue) || taxValue < 0 || taxValue > 100) {
      toast({ title: "Please enter a valid tax percentage (0-100)", variant: "destructive" });
      return;
    }
    
    saveTaxMutation.mutate();
  };

  const switchStripeEnvMutation = useMutation({
    mutationFn: async (environment: "sandbox" | "live") => {
      return await apiRequest("POST", "/api/admin/settings/stripe-environment", { environment });
    },
    onSuccess: (_data, environment) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/stripe-environment"] });
      toast({
        title: `Stripe switched to ${environment === "live" ? "Live" : "Sandbox"}`,
        description: environment === "live"
          ? "Real payments will now be processed."
          : "Test payments will now be processed using sandbox keys.",
      });
    },
    onError: () => {
      toast({ title: "Failed to switch Stripe environment", variant: "destructive" });
    },
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-heading font-bold flex items-center gap-2">
            <Settings className="w-8 h-8" />
            Settings
          </h1>
          <p className="text-muted-foreground mt-1">Configure pricing rules and system options</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Large Party Surcharge
            </CardTitle>
            <CardDescription>
              Add an extra fee for bookings with larger groups
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground">Loading...</div>
            ) : (
              <form onSubmit={handleSurchargeSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="minPartySize" className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Minimum Party Size
                    </Label>
                    <Input
                      id="minPartySize"
                      data-testid="input-min-party-size"
                      type="number"
                      min="2"
                      step="1"
                      value={minPartySize}
                      onChange={(e) => setMinPartySize(e.target.value)}
                      placeholder="4"
                    />
                    <p className="text-xs text-muted-foreground">
                      Surcharge applies when party size is this number or more
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="surchargeAmount" className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Surcharge Amount (USD)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        id="surchargeAmount"
                        data-testid="input-surcharge-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={surchargeAmount}
                        onChange={(e) => setSurchargeAmount(e.target.value)}
                        placeholder="20"
                        className="pl-7"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Additional fee added to the booking total
                    </p>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-md p-4">
                  <p className="text-sm">
                    <strong>Current Setting:</strong> A ${surchargeAmount || "20"} surcharge will be added to bookings with {minPartySize || "4"} or more travelers.
                  </p>
                </div>

                <Button
                  type="submit"
                  data-testid="button-save-settings"
                  disabled={saveSurchargeMutation.isPending}
                >
                  {saveSurchargeMutation.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Percent className="w-5 h-5" />
              Tax
            </CardTitle>
            <CardDescription>
              Apply a tax percentage to all bookings
            </CardDescription>
          </CardHeader>
          <CardContent>
            {taxLoading ? (
              <div className="text-center py-4 text-muted-foreground">Loading...</div>
            ) : (
              <form onSubmit={handleTaxSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="taxPercentage" className="flex items-center gap-2">
                    <Percent className="w-4 h-4" />
                    Tax Percentage
                  </Label>
                  <div className="relative max-w-xs">
                    <Input
                      id="taxPercentage"
                      data-testid="input-tax-percentage"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={taxPercentage}
                      onChange={(e) => setTaxPercentage(e.target.value)}
                      placeholder="0"
                      className="pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This percentage will be applied to all booking totals
                  </p>
                </div>

                <div className="bg-muted/50 rounded-md p-4">
                  <p className="text-sm">
                    <strong>Current Setting:</strong> {taxPercentage || "0"}% tax will be added to all bookings.
                  </p>
                </div>

                <Button
                  type="submit"
                  data-testid="button-save-tax"
                  disabled={saveTaxMutation.isPending}
                >
                  {saveTaxMutation.isPending ? "Saving..." : "Save Tax Settings"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Stripe Environment
            </CardTitle>
            <CardDescription>
              Switch between sandbox (testing) and live (real payments) Stripe keys
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stripeEnvLoading ? (
              <div className="text-center py-4 text-muted-foreground">Loading...</div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">Current environment:</span>
                  {stripeEnvSettings?.environment === "live" ? (
                    <Badge data-testid="badge-stripe-environment" className="bg-green-600 text-white no-default-active-elevate">
                      <Zap className="w-3 h-3 mr-1" />
                      Live
                    </Badge>
                  ) : (
                    <Badge data-testid="badge-stripe-environment" variant="secondary">
                      <FlaskConical className="w-3 h-3 mr-1" />
                      Sandbox
                    </Badge>
                  )}
                </div>

                <div className="bg-muted/50 rounded-md p-4 space-y-1">
                  <p className="text-sm">
                    <strong>Sandbox:</strong> Uses test keys. No real money is charged. Use for development and staging.
                  </p>
                  <p className="text-sm">
                    <strong>Live:</strong> Uses live keys. Real payments are processed. Use for production only.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant={stripeEnvSettings?.environment === "sandbox" ? "default" : "outline"}
                    onClick={() => switchStripeEnvMutation.mutate("sandbox")}
                    disabled={switchStripeEnvMutation.isPending || stripeEnvSettings?.environment === "sandbox"}
                    data-testid="button-stripe-sandbox"
                  >
                    <FlaskConical className="w-4 h-4 mr-2" />
                    Use Sandbox
                  </Button>
                  <Button
                    variant={stripeEnvSettings?.environment === "live" ? "default" : "outline"}
                    onClick={() => switchStripeEnvMutation.mutate("live")}
                    disabled={switchStripeEnvMutation.isPending || stripeEnvSettings?.environment === "live"}
                    data-testid="button-stripe-live"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Use Live
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
