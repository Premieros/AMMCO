import Link from 'next/link'
import { SidebarNavigation } from './sidebar-navigation'
import { ShieldCheck } from 'lucide-react'

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
    <div className="executive-app-shell" dir="rtl">
      <header className="executive-top-header">
        <div className="header-left-group">
          <div className="system-brand-badge">
            <span className="live-dot" />
            <strong>AMMCO Intelligence</strong>
            <span className="source-tag">One Number = One Source</span>
          </div>
        </div>

        <div className="header-right-group">
          <Link href="/management-center" className="header-nav-pill">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>مركز الإدارة</span>
          </Link>
          <div className="user-profile-badge">
            <div className="user-avatar-circle">A</div>
            <div className="user-copy">
              <strong>الإدارة المركزية</strong>
              <small>sayed3la2@gmail.com</small>
            </div>
          </div>
        </div>
      </header>

      <aside className="executive-sidebar">
        <div className="sidebar-brand-head">
          <div className="brand-logo-sq">A</div>
          <div className="brand-copy-wrap">
            <strong>AMMCO</strong>
            <small>Management &amp; Data Control</small>
          </div>
        </div>

        <SidebarNavigation />

        <div className="sidebar-bottom-status">
          <div className="status-label">
            <span>نظام AMMCO المركزي</span>
            <small>قاعدة بيانات موحدة</small>
          </div>
        </div>
      </aside>

      <main className="executive-main-content">
        <div className="content-inner-wrapper">
          <div className="executive-page-head">
            <div className="page-meta-block">
              {breadcrumbs.length > 0 && (
                <nav className="mini-breadcrumbs" aria-label="Breadcrumbs">
                  {breadcrumbs.map((item, idx) => (
                    <span key={item.label} className="crumb-segment">
                      {item.href ? (
                        <Link href={item.href} className="crumb-link">
                          {item.label}
                        </Link>
                      ) : (
                        <span className="crumb-active">{item.label}</span>
                      )}
                      {idx < breadcrumbs.length - 1 && <span className="crumb-slash">/</span>}
                    </span>
                  ))}
                </nav>
              )}
              <h1 className="page-main-title">{title}</h1>
              {subtitle && <p className="page-main-subtitle">{subtitle}</p>}
            </div>

            {actions && <div className="page-head-actions">{actions}</div>}
          </div>

          <div className="page-body-container">{children}</div>
        </div>
      </main>
    </div>
  )
}
