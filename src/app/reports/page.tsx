import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { UnifiedFilterBar } from '@/components/unified-filter-bar'
import { createClient } from '@/lib/supabase/server'
import { getUnifiedIntelligenceData } from '@/lib/data-source'
import {
  FileSpreadsheet,
  TrendingUp,
  Receipt,
  Store,
  Package,
  Wallet,
  Users,
  Calendar,
  Layers,
  ArrowRight,
  Download,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; from?: string; to?: string }>
}) {
  const filters = await searchParams
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/login')

  const data = await getUnifiedIntelligenceData(supabase, {
    from: filters.from,
    to: filters.to,
    branch: filters.branch,
  })

  const reportsList = [
    {
      title: 'تقرير المبيعات والكميات الموحدة',
      category: 'المبيعات',
      desc: 'تفصيل المبيعات بالصنف والفرع، مع احتساب الـ Double ×2 والخصومات',
      href: `/sales?from=${data.from}&to=${data.to}`,
      exportUrl: `/api/export?type=sales&from=${data.from}&to=${data.to}`,
      icon: TrendingUp,
    },
    {
      title: 'تقرير المصروفات والتشغيل',
      category: 'المالية',
      desc: 'تصنيف المصروفات الموحد (تشغيل، نقل، مرتبات، إيجار، إلخ) ومعدل الصرف للمبيعات',
      href: `/expenses?from=${data.from}&to=${data.to}`,
      exportUrl: `/api/export?type=expenses&from=${data.from}&to=${data.to}`,
      icon: Receipt,
    },
    {
      title: 'مصفوفة أداء الفروع والمقارنة',
      category: 'الإدارة',
      desc: 'مصفوفة شاملة (المبيعات، الكمية، المصروفات، المديونية) لكل الفروع والشركة',
      href: `/branches?from=${data.from}&to=${data.to}`,
      exportUrl: `/api/export?type=branches&from=${data.from}&to=${data.to}`,
      icon: Store,
    },
    {
      title: 'تقرير الأصناف والمخزون الفعلي',
      category: 'المخزون',
      desc: 'قراءة الرصيد الفعلي من عمود رصيد آخر باليومية ومقارنة الفروع لكل صنف',
      href: `/products?from=${data.from}&to=${data.to}`,
      exportUrl: `/api/export?type=products&from=${data.from}&to=${data.to}`,
      icon: Package,
    },
    {
      title: 'تقرير حركة المخزون التفصيلي',
      category: 'المخزون',
      desc: 'رصيد أول، وارد مصنع، وارد فروع، مبيعات، بوانص، هدايا، وتوالف حتى رصيد آخر',
      href: `/inventory-movement?from=${data.from}&to=${data.to}`,
      icon: Layers,
    },
    {
      title: 'تقرير المديونيات والتحصيل',
      category: 'التحصيل',
      desc: 'فحص معادلة المديونية (أول + البيع - التحصيل = آخر) ورصد أي فروق محاسبية',
      href: `/receivables?from=${data.from}&to=${data.to}`,
      icon: Wallet,
    },
    {
      title: 'التقرير التنفيذي المقارن',
      category: 'الإدارة',
      desc: 'المبيعات والمصروفات والتحصيل مع مقارنة الشهر السابق وYTD التراكمي',
      href: `/executive-comparison?from=${data.from}&to=${data.to}`,
      icon: FileSpreadsheet,
    },
    {
      title: 'أداء المناديب وتوريدات اليومية',
      category: 'المبيعات',
      desc: 'ترتيب مناديب كل فرع حسب البيع والتوريد والخصم الممنوح',
      href: `/representatives?from=${data.from}&to=${data.to}`,
      icon: Users,
    },
    {
      title: 'التحليل الشهري وYTD',
      category: 'المالية',
      desc: 'سلاسل زمنية شهرية لكل مؤشرات الشركة مع تراكم بداية السنة وحتى تاريخه',
      href: `/monthly-analysis`,
      icon: Calendar,
    },
    {
      title: 'المستحق مقابل النقدي',
      category: 'التكاليف',
      desc: 'احتساب المستحقات الشهرية للأجور والإيجار والعمولة مقارنة بالصرف النقدي الفعلي',
      href: `/accrued-expenses`,
      icon: Receipt,
    },
  ]

  return (
    <AppShell
      title="مركز التقارير الموحدة (Reports Hub)"
      subtitle="دليل كافة تقارير الإدارة والمخزون والمبيعات مع إمكانية الفتح أو التصدير الفوري"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/' }, { label: 'التقارير' }]}
    >
      <UnifiedFilterBar
        branches={data.branches}
        defaultFrom={data.from}
        defaultTo={data.to}
        defaultBranch={filters.branch}
      />

      <div className="reports-catalog-grid mt-4">
        {reportsList.map((r) => {
          const Icon = r.icon
          return (
            <div key={r.title} className="report-catalog-item">
              <div className="item-head">
                <div className="icon-badge">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <span className="category-tag">{r.category}</span>
              </div>

              <h4 className="item-title">{r.title}</h4>
              <p className="item-desc">{r.desc}</p>

              <div className="item-actions-row">
                <Link href={r.href} className="btn-open-report">
                  <span>فتح التقرير</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                {r.exportUrl && (
                  <a
                    href={r.exportUrl}
                    className="btn-export-quick"
                    title="تصدير Excel فوري"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Excel</span>
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </AppShell>
  )
}
