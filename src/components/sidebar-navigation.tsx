'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

function Icon({ type }: { type: 'dashboard' | 'expenses' | 'sales' | 'reps' | 'inventory' | 'upload' | 'history' }) {
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

const groups = [
  {
    label: 'الرئيسية',
    items: [{ href: '/', label: 'لوحة الإدارة', icon: 'dashboard' as const }],
  },
  {
    label: 'تقارير الإدارة',
    items: [
      { href: '/executive-comparison', label: 'التقرير التنفيذي', icon: 'dashboard' as const },
      { href: '/sales', label: 'المبيعات', icon: 'sales' as const },
      { href: '/representatives', label: 'أداء المناديب', icon: 'reps' as const },
      { href: '/expense-matrix', label: 'مصفوفة المصروفات', icon: 'expenses' as const },
      { href: '/expenses', label: 'تفاصيل المصروفات', icon: 'expenses' as const },
      { href: '/inventory-movement', label: 'حركة المخزون', icon: 'inventory' as const },
      { href: '/product-matrix', label: 'مصفوفة الأصناف', icon: 'inventory' as const },
      { href: '/receivables', label: 'المديونيات والتحصيل', icon: 'sales' as const },
      { href: '/monthly-analysis', label: 'التحليل الشهري وYTD', icon: 'dashboard' as const },
      { href: '/banks-ytd', label: 'البنوك وYTD', icon: 'sales' as const },
    ],
  },
  {
    label: 'التشغيل المالي',
    items: [
      { href: '/treasury', label: 'الخزائن والبنوك', icon: 'inventory' as const },
      { href: '/accrued-expenses', label: 'المستحق مقابل النقدي', icon: 'expenses' as const },
    ],
  },
  {
    label: 'البيانات',
    items: [
      { href: '/branches', label: 'إدارة الفروع', icon: 'dashboard' as const },
      { href: '/uploads', label: 'رفع شيت فرع', icon: 'upload' as const },
      { href: '/imports', label: 'مراجعة وسجل الرفع', icon: 'history' as const },
    ],
  },
]

export function SidebarNavigation() {
  const pathname = usePathname()
  return (
    <nav className="sidebar-nav">
      {groups.map((group) => (
        <div className="sidebar-group" key={group.label}>
          <span className="sidebar-group-label">{group.label}</span>
          {group.items.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link href={item.href} className={`sidebar-link${active ? ' active' : ''}`} key={item.href}>
                <Icon type={item.icon} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
