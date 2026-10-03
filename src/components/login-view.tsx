'use client'

import { useState } from 'react'
import { AlertCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { login } from '@/app/login/actions'

interface Props {
  error?: string
  signupError?: string
  signupSuccess?: string
}

export function LoginView({ error, signupError, signupSuccess }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)

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

        {(error || signupError) && (
          <div className="error mb-3 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
            <span>{error || signupError}</span>
          </div>
        )}

        {signupSuccess && <div className="success mb-3 text-xs">{signupSuccess}</div>}

        <form
          action={login}
          onSubmit={() => setIsLoggingIn(true)}
          className="form"
          style={{ marginTop: 8 }}
        >
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
