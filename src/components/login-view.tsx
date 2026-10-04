'use client'

import { FormEvent, useState } from 'react'
import { AlertCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  error?: string
  signupError?: string
  signupSuccess?: string
  returnTo?: string
}

export function LoginView({ error, signupError, signupSuccess, returnTo }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setClientError(null)
    setIsLoggingIn(true)

    try {
      const supabase = createClient()
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError || !signInData.session) {
        const message = signInError?.message?.toLowerCase() || ''
        if (message.includes('rate limit')) {
          setClientError('تم تجاوز عدد محاولات تسجيل الدخول مؤقتًا. حاول بعد قليل.')
        } else {
          setClientError('تعذر تسجيل الدخول. تحقق من البيانات وحاول مرة أخرى.')
        }
        setIsLoggingIn(false)
        return
      }

      const syncResponse = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${signInData.session.access_token}`,
        },
        body: JSON.stringify({
          refreshToken: signInData.session.refresh_token,
        }),
      })

      if (!syncResponse.ok) {
        await supabase.auth.signOut()
        setClientError('تم التحقق من الحساب لكن تعذر إنشاء جلسة الدخول. حاول مرة أخرى.')
        setIsLoggingIn(false)
        return
      }

      const target =
        returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
          ? returnTo
          : '/'

      window.location.assign(target)
    } catch (loginError) {
      console.error('browser-login-failed', loginError)
      setClientError('تعذر تسجيل الدخول الآن. حاول مرة أخرى.')
      setIsLoggingIn(false)
    }
  }

  return (
    <main className="auth-page" dir="rtl">
      <section className="auth-card" style={{ maxWidth: 460 }}>
        <div className="flex flex-col items-center mb-4 text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white mb-2 shadow-md">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 style={{ marginBottom: 4, fontSize: '1.5rem', fontWeight: 800 }}>
            AMMCO Intelligence
          </h1>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            نظام الإدارة المركزية والرقابة على بيانات الفروع
          </p>
        </div>

        {(clientError || error || signupError) && (
          <div className="error mb-3 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
            <span>{clientError || error || signupError}</span>
          </div>
        )}

        {signupSuccess && <div className="success mb-3 text-xs">{signupSuccess}</div>}

        <form onSubmit={handleSubmit} className="form" style={{ marginTop: 8 }}>
          <div className="field">
            <label htmlFor="email">البريد الإلكتروني</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="styled-input"
            />
          </div>

          <div className="field">
            <label htmlFor="password">كلمة المرور</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="styled-input"
                style={{ paddingLeft: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            className="btn btn-primary-action w-full justify-center"
            type="submit"
            disabled={isLoggingIn}
            style={{ marginTop: 4 }}
          >
            <span>{isLoggingIn ? 'جاري التحقق والدخول...' : 'تسجيل الدخول'}</span>
          </button>
        </form>
      </section>
    </main>
  )
}
