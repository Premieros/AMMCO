'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '').trim()
  const requestedReturnTo = String(formData.get('returnTo') ?? '/').trim()
  const returnTo =
    requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//')
      ? requestedReturnTo
      : '/'

  if (!email || !password) {
    redirect(
      '/login?error=' +
        encodeURIComponent('يرجى إدخال البريد الإلكتروني وكلمة المرور') +
        '&returnTo=' +
        encodeURIComponent(returnTo),
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect(
      '/login?error=' +
        encodeURIComponent('بيانات الدخول غير صحيحة') +
        '&returnTo=' +
        encodeURIComponent(returnTo),
    )
  }

  redirect(returnTo)
}
