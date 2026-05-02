import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [done, setDone] = useState<{ name: string; slug: string } | null>(null);

  const [propertyName, setPropertyName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1e40af");
  const [ownerUsername, setOwnerUsername] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");

  // Auto-derive slug while user hasn't manually edited it
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(propertyName));
  }, [propertyName, slugTouched]);

  // Debounced slug availability check
  useEffect(() => {
    if (!slug || slug.length < 3) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/signup/slug-available?slug=${encodeURIComponent(slug)}`);
        const j = await res.json();
        if (j.available) setSlugStatus("available");
        else if (j.reason === "invalid") setSlugStatus("invalid");
        else setSlugStatus("taken");
      } catch {
        setSlugStatus("idle");
      }
    }, 350);
    return () => clearTimeout(t);
  }, [slug]);

  const signupMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/signup", {
        propertyName,
        slug,
        contactEmail,
        primaryColor,
        ownerUsername,
        ownerEmail,
        ownerPassword,
      }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      setDone({ name: data.property.name, slug: data.property.slug });
    },
    onError: async (err: any) => {
      let msg = "Sign-up failed. Please try again.";
      try {
        const r = await err?.response?.json?.();
        if (r?.error) msg = r.error;
      } catch {}
      toast({ title: "Couldn't create your account", description: msg, variant: "destructive" });
    },
  });

  const canSubmit =
    propertyName.length >= 2 &&
    slug.length >= 3 &&
    slugStatus === "available" &&
    /\S+@\S+\.\S+/.test(contactEmail) &&
    ownerUsername.length >= 3 &&
    /\S+@\S+\.\S+/.test(ownerEmail) &&
    ownerPassword.length >= 8 &&
    !signupMutation.isPending;

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
        <Card className="w-full max-w-lg" data-testid="card-signup-success">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Thanks for signing up!</CardTitle>
            <CardDescription>
              Your property <strong>{done.name}</strong> is awaiting approval.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Our team reviews every new signup to keep the platform high quality. You'll receive an
              email at <strong>{contactEmail}</strong> as soon as your property is approved (usually
              within 1 business day).
            </p>
            <p>
              Once approved, you can log in at <code>/admin/login</code> with the username and
              password you just set.
            </p>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setLocation("/")} data-testid="button-back-home">
                Back to home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-heading font-semibold">List your property</h1>
          <p className="text-muted-foreground mt-2">
            Create a branded airport-transfer booking page for your hotel, villa, or resort in St. Lucia.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tell us about your property</CardTitle>
            <CardDescription>You'll be able to customize everything else from your dashboard once approved.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label htmlFor="propertyName">Property name</Label>
              <Input
                id="propertyName"
                data-testid="input-property-name"
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
                placeholder="Sandals Grande St. Lucia"
              />
            </div>

            <div>
              <Label htmlFor="slug">Booking page URL</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">yoursite.com/?property=</span>
                <Input
                  id="slug"
                  data-testid="input-slug"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(slugify(e.target.value));
                  }}
                  placeholder="sandals"
                  className="flex-1"
                />
              </div>
              <div className="text-xs mt-1 h-4" data-testid="text-slug-status">
                {slugStatus === "checking" && (
                  <span className="text-muted-foreground inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Checking availability…
                  </span>
                )}
                {slugStatus === "available" && (
                  <span className="text-green-600 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Available
                  </span>
                )}
                {slugStatus === "taken" && (
                  <span className="text-destructive inline-flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Already taken
                  </span>
                )}
                {slugStatus === "invalid" && (
                  <span className="text-destructive inline-flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Lowercase letters, numbers, dashes only (3+ chars)
                  </span>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="contactEmail">Property contact email</Label>
              <Input
                id="contactEmail"
                data-testid="input-contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="info@sandals.com"
              />
              <p className="text-xs text-muted-foreground mt-1">Used as the from-name on customer emails.</p>
            </div>

            <div>
              <Label htmlFor="primaryColor">Brand color</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="primaryColor"
                  data-testid="input-primary-color"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-20 h-10 p-1"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 font-mono"
                />
              </div>
            </div>

            <div className="border-t pt-5 space-y-5">
              <h3 className="font-semibold">Your owner account</h3>
              <div>
                <Label htmlFor="ownerUsername">Username</Label>
                <Input
                  id="ownerUsername"
                  data-testid="input-owner-username"
                  value={ownerUsername}
                  onChange={(e) => setOwnerUsername(e.target.value)}
                  placeholder="sandals_admin"
                />
              </div>
              <div>
                <Label htmlFor="ownerEmail">Your email</Label>
                <Input
                  id="ownerEmail"
                  data-testid="input-owner-email"
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="you@sandals.com"
                />
              </div>
              <div>
                <Label htmlFor="ownerPassword">Password</Label>
                <Input
                  id="ownerPassword"
                  data-testid="input-owner-password"
                  type="password"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              data-testid="button-submit-signup"
              disabled={!canSubmit}
              onClick={() => signupMutation.mutate()}
            >
              {signupMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating your account…
                </>
              ) : (
                "Submit for approval"
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Already have an account?{" "}
              <Link href="/admin/login" className="text-primary hover:underline" data-testid="link-login">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
