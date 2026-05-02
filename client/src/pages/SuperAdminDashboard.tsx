import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LogOut, Plus, ExternalLink } from "lucide-react";

interface Property {
  id: string;
  slug: string;
  name: string;
  email: string;
  logoUrl: string | null;
  primaryColor: string;
  status: string;
  plan: string;
  isDefault: boolean;
  createdAt: string;
}

interface SuperAdminMe { id: string; email: string; name: string }

export default function SuperAdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1e40af");

  const { data: me, isLoading: meLoading } = useQuery<SuperAdminMe>({
    queryKey: ["/api/super-admin/me"],
    retry: false,
  });

  const { data: properties, isLoading } = useQuery<Property[]>({
    queryKey: ["/api/super-admin/properties"],
    enabled: !!me,
  });

  const createMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/super-admin/properties", { name, slug, email, primaryColor }),
    onSuccess: () => {
      toast({ title: "Property created", description: `${name} is ready to use.` });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/properties"] });
      setOpen(false); setName(""); setSlug(""); setEmail(""); setPrimaryColor("#1e40af");
    },
    onError: async (err: any) => {
      let msg = "Failed to create property";
      try { const r = await err?.response?.json?.(); if (r?.error) msg = r.error; } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/super-admin/logout"),
    onSuccess: () => { queryClient.clear(); setLocation("/super-admin/login"); },
  });

  if (meLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!me) { setLocation("/super-admin/login"); return null; }

  const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-heading font-semibold">Platform Admin</h1>
            <p className="text-sm text-muted-foreground">Signed in as {me.email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => logoutMutation.mutate()} data-testid="button-logout">
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-heading font-semibold">Properties</h2>
            <p className="text-sm text-muted-foreground">Each property is a hotel/villa with its own branded booking page.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-property"><Plus className="w-4 h-4 mr-2" />New Property</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Property</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="p-name">Name</Label>
                  <Input id="p-name" data-testid="input-name" value={name} onChange={(e) => { setName(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} placeholder="Sandals St. Lucia" />
                </div>
                <div>
                  <Label htmlFor="p-slug">Subdomain Slug</Label>
                  <Input id="p-slug" data-testid="input-slug" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="sandals" />
                  <p className="text-xs text-muted-foreground mt-1">Will be reachable at <code>{slug || "slug"}.islandporttransfers.com</code> or <code>?property={slug || "slug"}</code> in dev.</p>
                </div>
                <div>
                  <Label htmlFor="p-email">Contact Email</Label>
                  <Input id="p-email" data-testid="input-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@sandals.com" />
                </div>
                <div>
                  <Label htmlFor="p-color">Brand Color</Label>
                  <div className="flex gap-2 items-center">
                    <Input id="p-color" data-testid="input-color" type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-20 h-10" />
                    <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button data-testid="button-submit-create" onClick={() => createMutation.mutate()} disabled={!name || !slug || !email || createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading properties...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {properties?.map((p) => (
              <Card key={p.id} data-testid={`card-property-${p.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{p.name}</CardTitle>
                    {p.isDefault && <Badge variant="secondary">Default</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-4 h-4 rounded-sm border" style={{ backgroundColor: p.primaryColor }} />
                    <span className="font-mono text-xs">{p.primaryColor}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">{p.email}</div>
                  <div className="text-xs text-muted-foreground">
                    Slug: <code>{p.slug}</code>
                  </div>
                  <a href={`/?property=${p.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" data-testid={`link-preview-${p.id}`}>
                    Preview booking page <ExternalLink className="w-3 h-3" />
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
