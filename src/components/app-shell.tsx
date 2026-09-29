import Link from 'next/link'

export function AppShell({ children, title, subtitle }: {
  children: React.ReactNode
  title: string
  subtitle?: string
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">AMMCO<small>Branch Intelligence</small></div>
        <nav className="nav">
          <Link href="/">لوحة التحكم</Link>
          <Link href="/uploads">رفع الشيت</Link>
          <Link href="/imports">سجل الرفع</Link>
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
        </header>
        {children}
      </main>
    </div>
  )
}
