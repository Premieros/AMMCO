import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://yumeijsyiphzdsulsubf.supabase.co'

const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6Inl1bWVpanN5aXBoemRzdWxzdWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2ODk1ODAsImV4cCI6MjEwNjI2NTU4MH0.Hpy2VZpttnQGdrx6_6Y1c9w4iHG2HhopvFdrohk3BBE'

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization') || ''
  const accessToken = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : ''

  let refreshToken = ''
  try {
    const body = await request.json()
    refreshToken = String(body?.refreshToken || '')
  } catch {}

  if (!accessToken || !refreshToken) {
    return NextResponse.json(
      { error: 'جلسة Supabase غير مكتملة' },
      { status: 401 },
    )
  }

  const response = NextResponse.json({ ok: true })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (error || !data.user) {
    return NextResponse.json(
      { error: 'تعذر التحقق من جلسة المستخدم' },
      { status: 401 },
    )
  }

  return response
}
