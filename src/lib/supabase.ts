import { createClient } from '@supabase/supabase-js'

let _supabase: ReturnType<typeof createClient> | null = null

export function getSupabase() {
  if (_supabase) return _supabase
  const url = process.env.NEXT_PUBLIC_CODER_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_CODER_SUPABASE_ANON_KEY
  const tenantId = process.env.NEXT_PUBLIC_CODER_SUPABASE_TENANT_ID
  if (!url || !anonKey || !tenantId) {
    throw new Error('Supabase environment is incomplete')
  }
  _supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: true, persistSession: true },
    global: { headers: { 'X-Instance-ID': tenantId } },
  })
  return _supabase
}
