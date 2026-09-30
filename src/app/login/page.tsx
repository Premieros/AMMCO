import { login, signupAdmin } from './actions'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string
    signup_error?: string
    signup_success?: string
  }>
}) {
  const { error, signup_error, signup_success } = await searchParams

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>AMMCO</h1>
        <p className="muted">نظام رفع وتحليل تقارير الفروع</p>

        {error ? <div className="error">{error}</div> : null}
        {signup_error ? <div className="error">{signup_error}</div> : null}
        {signup_success ? <div className="notice">{signup_success}</div> : null}

        <form action={login} className="form" style={{ marginTop: 18 }}>
          <div className="field">
            <label htmlFor="email">البريد الإلكتروني</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue="sayed3la2@gmail.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">كلمة المرور</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn" type="submit">دخول</button>
        </form>

        <details className="first-admin" style={{ marginTop: 22 }}>
          <summary>إنشاء حساب المدير لأول مرة</summary>
          <form action={signupAdmin} className="form" style={{ marginTop: 14 }}>
            <div className="notice">
              البريد المعتمد للإدارة: <strong>sayed3la2@gmail.com</strong>
            </div>
            <div className="field">
              <label htmlFor="new_password">اختر كلمة المرور</label>
              <input
                id="new_password"
                name="new_password"
                type="password"
                minLength={10}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="confirm_password">تأكيد كلمة المرور</label>
              <input
                id="confirm_password"
                name="confirm_password"
                type="password"
                minLength={10}
                autoComplete="new-password"
                required
              />
            </div>
            <button className="btn secondary" type="submit">إنشاء حساب Admin</button>
          </form>
        </details>
      </section>
    </main>
  )
}
