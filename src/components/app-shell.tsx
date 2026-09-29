import Link from 'next/link'
import { SidebarNavigation } from './sidebar-navigation'

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

        <SidebarNavigation />

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
