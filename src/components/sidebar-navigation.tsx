'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  TrendingUp,
  Receipt,
  Store,
  Package,
  Wallet,
  LineChart,
  FileSpreadsheet,
  ShieldAlert,
  Bot,
  Settings,
  Upload,
} from 'lucide-react'

const navItems = [
  { href: '/', label: 'لوحة الإدارة', icon: LayoutDashboard },
  { href: '/sales', label: 'المبيعات', icon: TrendingUp },
  { href: '/expenses', label: 'المصروفات', icon: Receipt },
  { href: '/branches', label: 'الفروع', icon: Store },
  { href: '/products', label: 'الأصناف', icon: Package },
  { href: '/treasury', label: 'الخزينة', icon: Wallet },
  { href: '/analytics', label: 'التحليلات', icon: LineChart },
  { href: '/reports', label: 'التقارير', icon: FileSpreadsheet },
  { href: '/management-center', label: 'مراجعة البيانات', icon: ShieldAlert },
  { href: '/ai', label: 'AI Developer', icon: Bot },
  { href: '/settings', label: 'الإعدادات', icon: Settings },
]

export function SidebarNavigation() {
  const pathname = usePathname()

  return (
    <nav className="executive-sidebar-nav">
      <div className="nav-items-list">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(item.href + '/')

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`executive-nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon className="nav-item-icon w-4 h-4" />
              <span className="nav-item-label">{item.label}</span>
            </Link>
          )
        })}
      </div>

      <div className="sidebar-quick-upload">
        <Link href="/uploads" className="quick-upload-btn">
          <Upload className="w-3.5 h-3.5" />
          <span>رفع شيت جديد</span>
        </Link>
      </div>
    </nav>
  )
}
