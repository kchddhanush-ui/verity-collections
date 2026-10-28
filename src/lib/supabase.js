import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim();

function validateConfig() {
  if (!url || !key) return 'Supabase is not configured. Add your project URL and publishable key to .env.local, then restart npm run dev.';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.protocol === 'http:')) throw new Error();
  } catch { return 'VITE_SUPABASE_URL must be your Supabase project URL.'; }
  if (key.startsWith('sb_publishable_')) return '';
  try {
    const raw = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    if (JSON.parse(atob(raw)).role === 'anon') return '';
  } catch { /* Not a browser-safe legacy anon key. */ }
  return 'Use a Supabase publishable key (or legacy anon key). Secret and service_role keys must never be used in this browser app.';
}

export const configurationError = validateConfig();
export const supabase = configurationError ? null : createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
