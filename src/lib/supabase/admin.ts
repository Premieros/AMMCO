import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const REQUIRED_PROJECT_REF = 'yumeijsyiphzdsulsubf'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY

  if (!url || !secret) {
    throw new Error('AMMCO Supabase server configuration is missing')
  }

  if (!url.includes(REQUIRED_PROJECT_REF)) {
    throw new Error('STOP_AND_RECONCILE: Supabase project is not AMMCO')
  }

  return createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
