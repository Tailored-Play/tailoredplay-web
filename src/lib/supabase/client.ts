import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sanitizes Supabase URL by trimming whitespace, stripping any accidental `/rest/v1`
 * path suffix (commonly copied from PostgREST endpoint in Supabase settings), and removing trailing slashes.
 */
export function sanitizeSupabaseUrl(rawUrl?: string): string {
  if (!rawUrl) return "";
  return rawUrl.trim().replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

export function isSupabaseConfigured(): boolean {
  const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return Boolean(url && key && url.startsWith("http"));
}

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!browserClient) {
    const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();
    browserClient = createBrowserClient(url, key);
  }
  return browserClient;
}
