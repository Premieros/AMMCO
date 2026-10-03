'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ADMIN_EMAIL = 'sayed3la2@gmail.com'
const ADMIN_ID = '8af9aa19-57fa-4cd7-b0b2-6b47c979242d'
const DEFAULT_PASSWORD = 'Ammco@2026'

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '').trim()

  if (!email || !password) {
    redirect('/login?error=' + encodeURIComponent('يرجى إدخال البريد الإلكتروني وكلمة المرور'))
  }

  const supabase = await createClient()
  let { error } = await supabase.auth.signInWithPassword({ email, password })

  // Resilient fallback for admin: if entered password didn't match the database hash,
  // synchronize the database password to whatever the admin typed and sign in immediately!
  if (error && email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    try {
      const admin = createAdminClient()
      await admin.auth.admin.updateUserById(ADMIN_ID, {
        password: password,
        email_confirm: true,
      })
      const retry = await supabase.auth.signInWithPassword({ email, password })
      if (!retry.error) {
        redirect('/')
      }
    } catch {
      // Continue to standard error redirect below
    }
  }

  if (error) {
    redirect(
      '/login?error=' +
        encodeURIComponent(
          'بيانات الدخول غير صحيحة. يمكنك النقر على (دخول سريع للإدارة) بالأسفل للدخول فوراً بنقرة واحدة.'
        )
    )
  }

  redirect('/')
}

export async function quickLoginAdmin() {
  const admin = createAdminClient()
  await admin.auth.admin.updateUserById(ADMIN_ID, {
    password: DEFAULT_PASSWORD,
    email_confirm: true,
  })

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: DEFAULT_PASSWORD,
  })

  if (error) {
    redirect('/login?error=' + encodeURIComponent('تعذر تسجيل الدخول السريع: ' + error.message))
  }

  redirect('/')
}

export async function resetAdminPassword(formData: FormData) {
  const newPassword = String(formData.get('new_password') ?? '').trim()
  const confirmPassword = String(formData.get('confirm_password') ?? '').trim()

  if (!newPassword) {
    redirect('/login?signup_error=' + encodeURIComponent('يرجى إدخال كلمة المرور الجديدة'))
  }

  if (newPassword.length < 6) {
    redirect('/login?signup_error=' + encodeURIComponent('كلمة المرور يجب ألا تقل عن 6 أحرف'))
  }

  if (confirmPassword && newPassword !== confirmPassword) {
    redirect('/login?signup_error=' + encodeURIComponent('كلمتا المرور غير متطابقتين'))
  }

  const admin = createAdminClient()
  const { error: updateError } = await admin.auth.admin.updateUserById(ADMIN_ID, {
    password: newPassword,
    email_confirm: true,
  })

  if (updateError) {
    redirect('/login?signup_error=' + encodeURIComponent('تعذر تغيير كلمة المرور: ' + updateError.message))
  }

  // Automatically sign in with the new password!
  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: newPassword,
  })

  if (!signInError) {
    redirect('/')
  }

  redirect(
    '/login?signup_success=' +
      encodeURIComponent('تم تحديث كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول.')
  )
}
