type MaybeString = string | undefined;

const DEFAULT_SUPABASE_URL = 'https://svqbfxdhpsmioaosuhkb.supabase.co';

const pickFirstNonEmpty = (...values: MaybeString[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
};

export type BrowserSupabaseConfig = {
  url: string;
  key?: string;
};

export const getBrowserSupabaseConfig = (): BrowserSupabaseConfig => {
  const env = import.meta.env;

  const configuredUrl = pickFirstNonEmpty(
    env.VITE_SUPABASE_URL,
    env.VITE_PUBLIC_SUPABASE_URL,
    env.VITE_NEXT_PUBLIC_SUPABASE_URL
  );
  const url = configuredUrl || DEFAULT_SUPABASE_URL;

  const key = pickFirstNonEmpty(
    env.VITE_SUPABASE_KEY,
    env.VITE_SUPABASE_ANON_KEY,
    env.VITE_PUBLIC_SUPABASE_ANON_KEY,
    env.VITE_NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return { url, key: key || undefined };
};

export const buildSupabaseAuthHeaders = (key?: string): Record<string, string> =>
  key
    ? {
        Authorization: `Bearer ${key}`,
        apikey: key,
      }
    : {};
