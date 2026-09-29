import { login } from './actions'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>AMMCO</h1>
        <p className="muted">نظام رفع وتحليل تقارير الفروع</p>
        {error ? <div className="error">{error}</div> : null}
        <form action={login} className="form" style={{ marginTop: 18 }}>
          <div className="field">
            <label htmlFor="email">البريد الإلكتروني</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">كلمة المرور</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn" type="submit">دخول</button>
        </form>
      </section>
    </main>
  )
}
