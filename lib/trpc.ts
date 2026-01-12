import { createTRPCReact } from "@trpc/react-query";
import { createTRPCClient, httpLink } from "@trpc/client";
import type { AppRouter } from "@/backend/trpc/app-router";
import superjson from "superjson";
import { supabase } from "@/lib/supabase";
import { getApiBaseUrl } from "@/constants/config";

export const trpc = createTRPCReact<AppRouter>();

let currentAccessToken: string | null = null;
export function setTRPCAccessToken(token: string | null) {
  currentAccessToken = token || null;
  console.log('[tRPC] setTRPCAccessToken', { hasToken: !!currentAccessToken });
}

// Helper to get current access token
async function getAccessToken(): Promise<string | null> {
  // Always favor the directly set token first
  if (currentAccessToken) {
    return currentAccessToken;
  }

  // Final fallback for race conditions: get from Supabase
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('[tRPC] getSession error:', error.message);
      return null;
    }

    if (session?.access_token) {
      currentAccessToken = session.access_token;
      return session.access_token;
    }
  } catch (error) {
    console.error('[tRPC] Critical error getting session:', error);
  }

  return null;
}

const linkConfig = httpLink({
  url: `${getApiBaseUrl()}/api/trpc`,
  transformer: superjson,
  headers: async () => {
    // getAccessToken handles its own caching/fallback
    const token = await getAccessToken();

    if (!token) {
      return {};
    }

    return {
      authorization: `Bearer ${token}`
    };
  },
})

export const trpcClient = trpc.createClient({
  links: [linkConfig],
});

export const trpcVanillaClient = createTRPCClient<AppRouter>({
  links: [linkConfig],
});
