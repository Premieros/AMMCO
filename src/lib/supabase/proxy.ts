import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const DEFAULT_URL = 'https://yumeijsyiphzdsulsubf.supabase.co'
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1bWVpanN5aXBoemRzdWxzdWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2ODk1ODAsImV4cCI6MjEwNjI2NTU4MH0.Hpy2VZpttnQGdrx6_6Y1c9w4iHG2HhopvFdrohk3BBE'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          )
        },
      },
    },
  )

  const portalPath = request.nextUrl.pathname
  if (
    portalPath === '/' ||
    portalPath.startsWith('/unified/') ||
    portalPath === '/api/auth/sync'
  ) {
    return response
  }

  const { data } = await supabase.auth.getClaims()
  const user = data?.claims

  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    const returnTo = request.nextUrl.pathname + request.nextUrl.search
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('returnTo', returnTo)
    return NextResponse.redirect(url)
  }

  return response
}
