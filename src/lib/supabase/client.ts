import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const DEFAULT_URL = 'https://yumeijsyiphzdsulsubf.supabase.co'
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6Inl1bWVpanN5aXBoemRzdWxzdWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2ODk1ODAsImV4cCI6MjEwNjI2NTU4MH0.Hpy2VZpttnQGdrx6_6Y1c9w4iHG2HhopvFdrohk3BBE'

export function createClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  )
}
