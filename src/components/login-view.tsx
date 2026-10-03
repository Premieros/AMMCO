'use client'

import { useState } from 'react'
import {
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  Zap,
  Lock,
  Mail,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { login, quickLoginAdmin, resetAdminPassword } from '@/app/login/actions'

interface Props {
  error?: string
  signupError?: string
  signupSuccess?: string
}

export function LoginView({ error, signupError, signupSuccess }: Props) {
  const [email, setEmail] = useState('sayed3la2@gmail.com')
  const [password, setPassword] = useState('Ammco@2026')
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isQuickLoggingIn, setIsQuickLoggingIn] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  const handleCopyPassword = () => {
    navigator.clipboard.writeText('Ammco@2026')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleFillDefault = () => {
    setPassword('Ammco@2026')
    setEmail('sayed3la2@gmail.com')
  }

  return (
    <main className="auth-page" dir="rtl">
      <section className="auth-card" style={{ maxWidth: 460 }}>
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-4 text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white mb-2 shadow-md">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 style={{ marginBottom: 4, fontSize: '1.5rem', fontWeight: 800 }}>AMMCO Intelligence</h1>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            نظام الإدارة المركزية والرقابة على بيانات الفروع
          </p>
        </div>

        {/* 1. Instant Quick Login Banner & Button */}
        <div className="p-3.5 mb-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 font-bold text-blue-950 text-xs">
              <Zap className="w-4 h-4 text-amber-500 fill-amber-500 flex-shrink-0" />
              <span>الدخول السريع المعتمد للإدارة</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold">
              نقرة واحدة
            </span>
          </div>

          <div className="text-xs text-slate-600 mb-3 leading-relaxed">
            البريد: <strong className="text-slate-900 font-mono">sayed3la2@gmail.com</strong>
            <br />
            كلمة المرور: <strong className="text-blue-700 font-mono">Ammco@2026</strong>
          </div>

          <form action={quickLoginAdmin} onSubmit={() => setIsQuickLoggingIn(true)}>
            <button
              type="submit"
              disabled={isQuickLoggingIn}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
              <span>{isQuickLoggingIn ? 'جاري الدخول للنظام...' : 'دخول مباشر بنقرة واحدة بحساب sayed3la2@gmail.com'}</span>
            </button>
          </form>
        </div>

        {/* Error / Success Notifications */}
        {error && (
          <div className="error mb-3 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {signupError && (
          <div className="error mb-3 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
            <span>{signupError}</span>
          </div>
        )}

        {signupSuccess && (
          <div className="success mb-3 text-xs flex items-start gap-2 bg-emerald-50 text-emerald-800 border-emerald-200">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-600" />
            <span>{signupSuccess}</span>
          </div>
        )}

        {/* 2. Standard Login Form */}
        <form action={login} onSubmit={() => setIsLoggingIn(true)} className="form" style={{ marginTop: 8 }}>
          <div className="field">
            <label htmlFor="email">البريد الإلكتروني</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="styled-input"
            />
          </div>

          <div className="field">
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="password" style={{ margin: 0 }}>
                كلمة المرور
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFillDefault}
                  className="text-[11px] text-blue-600 hover:underline"
                  title="تعبئة Ammco@2026 تلقائياً"
                >
                  تعبئة الافتراضية
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1"
                  title="نسخ كلمة المرور إلى الحافظة"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-600 font-bold">تم النسخ</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>نسخ</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Ammco@2026"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="styled-input font-mono"
                style={{ paddingLeft: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            className="btn btn-secondary-action w-full justify-center"
            type="submit"
            disabled={isLoggingIn}
            style={{ marginTop: 4 }}
          >
            <span>{isLoggingIn ? 'جاري التحقق والدخول...' : 'تسجيل الدخول'}</span>
          </button>
        </form>

        {/* 3. Direct Password Reset Form */}
        <details className="first-admin" style={{ marginTop: 18 }}>
          <summary className="text-xs text-blue-700 font-bold cursor-pointer hover:underline text-center">
            تغيير كلمة المرور لحساب sayed3la2@gmail.com
          </summary>
          <form
            action={resetAdminPassword}
            onSubmit={() => setIsResetting(true)}
            className="form"
            style={{
              marginTop: 10,
              padding: '12px 14px',
              background: '#f8fafc',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
            }}
          >
            <div className="text-xs text-slate-600 mb-2">
              اكتب كلمة المرور التي تفضلها وسيتم تحديثها فوراً وتسجيل دخولك مباشرة:
            </div>

            <div className="field">
              <label htmlFor="new_password" style={{ fontSize: '11.5px' }}>
                كلمة المرور الجديدة
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="new_password"
                  name="new_password"
                  type={showNewPassword ? 'text' : 'password'}
                  minLength={6}
                  placeholder="6 أحرف على الأقل"
                  autoComplete="new-password"
                  required
                  className="styled-input"
                  style={{ paddingLeft: '38px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="confirm_password" style={{ fontSize: '11.5px' }}>
                تأكيد كلمة المرور الجديدة
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="confirm_password"
                  name="confirm_password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  minLength={6}
                  placeholder="أعد كتابة كلمة المرور للتأكيد"
                  autoComplete="new-password"
                  required
                  className="styled-input"
                  style={{ paddingLeft: '38px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              className="btn btn-primary-action w-full text-xs justify-center"
              type="submit"
              disabled={isResetting}
              style={{ marginTop: 4 }}
            >
              <span>{isResetting ? 'جاري التحديث والدخول...' : 'تحديث كلمة المرور والدخول الآن'}</span>
            </button>
          </form>
        </details>
      </section>
    </main>
  )
}
