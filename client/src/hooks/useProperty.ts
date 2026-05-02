import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

export interface PublicProperty {
  id: string;
  slug: string;
  name: string;
  email: string;
  logoUrl: string | null;
  primaryColor: string;
}

function getPropertyQueryParam(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("property");
}

function buildPropertyUrl(): string {
  const slug = getPropertyQueryParam();
  return slug ? `/api/property?property=${encodeURIComponent(slug)}` : "/api/property";
}

/**
 * Fetches the active property (resolved by query param or subdomain on the server)
 * and applies its primary color to the document as a CSS variable.
 */
export function useProperty() {
  const { data: property, isLoading } = useQuery<PublicProperty>({
    queryKey: ["/api/property", getPropertyQueryParam() || "default"],
    queryFn: async () => {
      const res = await fetch(buildPropertyUrl(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load property");
      return res.json();
    },
  });

  useEffect(() => {
    if (!property?.primaryColor) return;
    document.documentElement.style.setProperty("--brand-color", property.primaryColor);
    if (property.name) {
      document.title = `${property.name} - Airport Transfers`;
    }
  }, [property]);

  return { property, isLoading };
}
