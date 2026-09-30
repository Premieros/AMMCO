'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAIL = 'sayed3la2@gmail.com'

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    redirect('/login?error=' + encodeURIComponent('أدخل البريد وكلمة المرور'))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect('/login?error=' + encodeURIComponent('بيانات الدخول غير صحيحة'))
  }

  redirect('/')
}

export async function signupAdmin(formData: FormData) {
  const password = String(formData.get('new_password') ?? '')
  const confirmPassword = String(formData.get('confirm_password') ?? '')

  if (password.length < 10) {
    redirect('/login?signup_error=' + encodeURIComponent('كلمة المرور يجب ألا تقل عن 10 أحرف'))
  }

  if (password !== confirmPassword) {
    redirect('/login?signup_error=' + encodeURIComponent('كلمتا المرور غير متطابقتين'))
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: ADMIN_EMAIL,
    password,
    options: {
      data: { full_name: 'Sayed Alaa' },
      emailRedirectTo: process.env.NEXT_PUBLIC_SITE_URL
        ? `${process.env.NEXT_PUBLIC_SITE_URL}/login`
        : undefined,
    },
  })

  if (error) {
    const message = error.message.toLowerCase().includes('already registered')
      ? 'الحساب موجود بالفعل. استخدم تسجيل الدخول.'
      : error.message
    redirect('/login?signup_error=' + encodeURIComponent(message))
  }

  if (data.session) {
    redirect('/')
  }

  redirect('/login?signup_success=' + encodeURIComponent('تم إنشاء الحساب. افحص بريدك لتأكيد البريد ثم سجّل الدخول.'))
}
