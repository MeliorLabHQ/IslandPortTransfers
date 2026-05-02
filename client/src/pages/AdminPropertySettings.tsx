import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Property {
  id: string; slug: string; name: string; email: string;
  logoUrl: string | null; primaryColor: string; status: string; plan: string; isDefault: boolean;
}

export default function AdminPropertySettings() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<Property>({ queryKey: ["/api/admin/property"] });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1e40af");

  useEffect(() => {
    if (data) {
      setName(data.name);
      setEmail(data.email);
      setLogoUrl(data.logoUrl || "");
      setPrimaryColor(data.primaryColor);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => apiRequest("PATCH", "/api/admin/property", { name, email, logoUrl: logoUrl || null, primaryColor }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/property"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/property"] });
      toast({ title: "Saved", description: "Property branding updated." });
    },
    onError: () => toast({ title: "Error", description: "Failed to save.", variant: "destructive" }),
  });

  return (
    <AdminLayout>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-heading font-semibold mb-1">Property Settings</h1>
        <p className="text-sm text-muted-foreground mb-6">Branding shown on your public booking page.</p>

        {isLoading ? <div className="text-muted-foreground">Loading...</div> : (
          <Card>
            <CardHeader><CardTitle>Branding</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="p-name">Property Name</Label>
                <Input id="p-name" data-testid="input-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="p-email">Contact Email</Label>
                <Input id="p-email" data-testid="input-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="p-logo">Logo URL</Label>
                <Input id="p-logo" data-testid="input-logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
                {logoUrl && <img src={logoUrl} alt="Logo preview" className="mt-2 h-16 object-contain" />}
              </div>
              <div>
                <Label htmlFor="p-color">Brand Color</Label>
                <div className="flex gap-2 items-center">
                  <Input id="p-color" data-testid="input-color" type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-20 h-10" />
                  <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1" />
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                <strong>Slug:</strong> <code>{data?.slug}</code>
                {data?.isDefault && <span className="ml-2">(Default property — used at root domain)</span>}
              </div>
              <div className="flex justify-end">
                <Button data-testid="button-save" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
