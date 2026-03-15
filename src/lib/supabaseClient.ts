import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Default client: includes user auth, used for DB and auth
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Lightweight client for calling Edge Functions without user JWT
// This avoids "Invalid JWT" errors when the session and project config
// get out of sync; functions that don't need per-user auth can use this.
export const supabaseFunctionsClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})