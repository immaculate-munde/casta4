import { createClient } from '@supabase/supabase-js';

let client;

export function isSupabaseServerConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseServer() {
  if (!isSupabaseServerConfigured()) {
    throw new Error('Supabase not configured on web server');
  }
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
