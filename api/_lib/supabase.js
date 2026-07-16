// /api/_lib/supabase.js
// Service-role client — server-side only. Never expose this key
// to the browser; it bypasses RLS by design.
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
