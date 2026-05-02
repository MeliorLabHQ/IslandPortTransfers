import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

function getPropertySlug(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("property");
}

function withPropertySlug(url: string): string {
  const slug = getPropertySlug();
  if (!slug) return url;
  if (!url.startsWith("/api/")) return url;
  if (url.includes("property=")) return url;
  return url + (url.includes("?") ? "&" : "?") + "property=" + encodeURIComponent(slug);
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(withPropertySlug(url), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Build URL from query key
    let url = queryKey[0] as string;
    
    // If there's a second element and it's an object (query params), append them
    if (queryKey.length > 1 && typeof queryKey[1] === 'object' && queryKey[1] !== null) {
      const params = new URLSearchParams();
      const queryParams = queryKey[1] as Record<string, string>;
      
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value) { // Only add non-empty values
          params.append(key, value);
        }
      });
      
      const queryString = params.toString();
      if (queryString) {
        url += '?' + queryString;
      }
    }
    
    const res = await fetch(withPropertySlug(url), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
