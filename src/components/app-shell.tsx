import Link from 'next/link'

export function AppShell({
  children,
  title,
  subtitle,
  actions,
  breadcrumbs = [],
}: {
  children: React.ReactNode
  title: string
  subtitle?: string
  actions?: React.ReactNode
  breadcrumbs?: Array<{ label: string; href?: string }>
}) {
  return (
    <div className="shell enterprise-shell">
      <aside className="sidebar enterprise-sidebar">
        <div className="brand brand-block">
          <span className="brand-mark">A</span>
          <div>
            <strong>AMMCO</strong>
            <small>Branch Intelligence</small>
          </div>
        </div>

        <nav className="nav enterprise-nav">
          <div className="nav-group">
            <span className="nav-label">الرئيسية</span>
            <Link href="/">لوحة الإدارة</Link>
          </div>
          <div className="nav-group">
            <span className="nav-label">التحليل</span>
            <Link href="/expenses">تحليل المصروفات</Link>
            <Link href="/drilldown/sales">تحليل المبيعات</Link>
            <Link href="/drilldown/reps">المناديب</Link>
            <Link href="/drilldown/inventory">المخزون</Link>
          </div>
          <div className="nav-group">
            <span className="nav-label">البيانات</span>
            <Link href="/uploads">رفع الشيت</Link>
            <Link href="/imports">سجل الرفع</Link>
          </div>
        </nav>

        <div className="sidebar-foot">
          <span>AMMCO · Management Portal</span>
        </div>
      </aside>

      <main className="main enterprise-main">
        <header className="topbar enterprise-topbar">
          <div className="page-heading">
            {breadcrumbs.length > 0 ? (
              <nav className="breadcrumbs" aria-label="Breadcrumbs">
                {breadcrumbs.map((item, index) => (
                  <span key={item.label}>
                    {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
                    {index < breadcrumbs.length - 1 ? <b>‹</b> : null}
                  </span>
                ))}
              </nav>
            ) : null}
            <h1>{title}</h1>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          {actions ? <div className="topbar-actions">{actions}</div> : null}
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  )
}
