import Link from 'next/link'

function NavIcon({ type }: { type: 'dashboard' | 'expenses' | 'sales' | 'reps' | 'inventory' | 'upload' | 'history' }) {
  const paths: Record<string, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    expenses: <><path d="M6 2h9l4 4v16H6z"/><path d="M15 2v5h5"/><path d="M9 12h6M9 16h6"/></>,
    sales: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
    reps: <><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><path d="M17 11c3 .4 5 2.6 5 5.5"/></>,
    inventory: <><path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></>,
    upload: <><path d="M12 16V3"/><path d="M7 8l5-5 5 5"/><path d="M4 14v7h16v-7"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/><path d="M12 7v5l3 2"/></>,
  }
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[type]}
    </svg>
  )
}

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
    <div className="app-shell" dir="rtl">
      <header className="app-header">
        <div className="header-start">
          <div className="header-context">
            <span className="header-dot" />
            <span>AMMCO Intelligence</span>
          </div>
        </div>
        <div className="header-end">
          <div className="header-chip">الإدارة المركزية</div>
          <div className="user-identity">
            <span className="user-avatar">A</span>
            <div>
              <strong>AMMCO</strong>
              <small>Admin Portal</small>
            </div>
          </div>
        </div>
      </header>

      <aside className="app-sidebar">
        <div className="sidebar-logo">
          <div className="logo-symbol">A</div>
          <div className="logo-copy">
            <strong>AMMCO</strong>
            <small>Branch Intelligence</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-group">
            <span className="sidebar-group-label">الرئيسية</span>
            <Link href="/" className="sidebar-link">
              <NavIcon type="dashboard" />
              <span>لوحة الإدارة</span>
            </Link>
          </div>

          <div className="sidebar-group">
            <span className="sidebar-group-label">التحليل</span>
            <Link href="/expenses" className="sidebar-link">
              <NavIcon type="expenses" />
              <span>تحليل المصروفات</span>
            </Link>
            <Link href="/drilldown/sales" className="sidebar-link">
              <NavIcon type="sales" />
              <span>تحليل المبيعات</span>
            </Link>
            <Link href="/drilldown/reps" className="sidebar-link">
              <NavIcon type="reps" />
              <span>المناديب</span>
            </Link>
            <Link href="/drilldown/inventory" className="sidebar-link">
              <NavIcon type="inventory" />
              <span>المخزون</span>
            </Link>
          </div>

          <div className="sidebar-group">
            <span className="sidebar-group-label">البيانات</span>
            <Link href="/uploads" className="sidebar-link">
              <NavIcon type="upload" />
              <span>رفع الشيت</span>
            </Link>
            <Link href="/imports" className="sidebar-link">
              <NavIcon type="history" />
              <span>سجل الرفع</span>
            </Link>
          </div>
        </nav>

        <div className="sidebar-footer">
          <span>AMMCO</span>
          <small>Management System</small>
        </div>
      </aside>

      <main className="app-main">
        <div className="page-container">
          <section className="page-header">
            <div className="page-header-copy">
              {breadcrumbs.length > 0 ? (
                <nav className="breadcrumbs" aria-label="Breadcrumbs">
                  {breadcrumbs.map((item, index) => (
                    <span key={item.label}>
                      {item.href ? <Link href={item.href}>{item.label}</Link> : <b>{item.label}</b>}
                      {index < breadcrumbs.length - 1 ? <em>‹</em> : null}
                    </span>
                  ))}
                </nav>
              ) : null}
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
            {actions ? <div className="page-actions">{actions}</div> : null}
          </section>

          {children}
        </div>
      </main>
    </div>
  )
}
