'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { SidebarNavigation } from './sidebar-navigation'
import { PanelLeftClose, PanelLeftOpen, ShieldCheck, User } from 'lucide-react'

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Persist sidebar state in localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ammco_sidebar_collapsed')
      if (saved === 'true') {
        setSidebarCollapsed(true)
      }
    } catch {
      // ignore
    }
  }, [])

  const toggleSidebar = () => {
    const next = !sidebarCollapsed
    setSidebarCollapsed(next)
    try {
      localStorage.setItem('ammco_sidebar_collapsed', String(next))
    } catch {
      // ignore
    }
  }

  return (
    <div className={`executive-app-shell ${sidebarCollapsed ? 'sidebar-hidden' : ''}`} dir="rtl">
      {/* Top Header */}
      <header className="executive-top-header">
        <div className="header-left-group">
          {/* Hide / Show Sidebar Toggle Button */}
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'إظهار القائمة الجانبية' : 'إخفاء القائمة الجانبية لتوسيع الشاشة'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
            <span className="toggle-text-hint">
              {sidebarCollapsed ? 'عرض القائمة' : 'توسيع الشاشة'}
            </span>
          </button>

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

      {/* Sidebar */}
      <aside className={`executive-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-brand-head">
          <div className="brand-logo-sq">A</div>
          <div className="brand-copy-wrap">
            <strong>AMMCO</strong>
            <small>Management & Data Control</small>
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

      {/* Main Content Area */}
      <main className={`executive-main-content ${sidebarCollapsed ? 'expanded-full' : ''}`}>
        <div className="content-inner-wrapper">
          {/* Compact Page Header with zero wasteful padding */}
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

          {/* Page Children */}
          <div className="page-body-container">{children}</div>
        </div>
      </main>
    </div>
  )
}
