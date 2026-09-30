import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { UnifiedFilterBar } from '@/components/unified-filter-bar'
import { KPICard } from '@/components/kpi-card'
import { createClient } from '@/lib/supabase/server'
import { getUnifiedIntelligenceData } from '@/lib/data-source'
import {
  LineChart,
  Users,
  Grid,
  TrendingUp,
  Receipt,
  Landmark,
  ArrowRight,
  BarChart3,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

function money(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v)
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`
}

export default async function AnalyticsPage({
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

  const cur = data.currentSummary

  const analyticalModules = [
    {
      title: 'التقرير التنفيذي المقارن',
      desc: 'مقارنة شاملة بين الفروع: المبيعات، التحصيل، المديونية، المصروفات، والمخزون مع الشهر السابق وYTD',
      href: `/executive-comparison?from=${data.from}&to=${data.to}`,
      icon: BarChart3,
      badge: 'إدارة عليا',
    },
    {
      title: 'أداء المناديب والتوريدات',
      desc: 'متابعة أداء مناديب البيع في كل فرع، التوريدات اليومية، الخصومات، والمديونيات المتبقية',
      href: `/representatives?from=${data.from}&to=${data.to}`,
      icon: Users,
      badge: 'مبيعات ميدانية',
    },
    {
      title: 'التحليل الشهري وYTD',
      desc: 'تتبع تراكمي سنوي ومقارنة شهرية متسلسلة للمبيعات والتحصيل والمصروفات',
      href: `/monthly-analysis`,
      icon: LineChart,
      badge: 'تراكمي سنوي',
    },
    {
      title: 'مصفوفة الأصناف والفروع',
      desc: 'تحليل دقيق لمبيعات كل صنف ومخزونه في كل فرع مع إجماليات الشركة',
      href: `/product-matrix?from=${data.from}&to=${data.to}`,
      icon: Grid,
      badge: 'مخزون ومبيعات',
    },
    {
      title: 'مصفوفة المصروفات',
      desc: 'تحليل بنود المصروفات موزعة على الفروع مع نسبة كل بند من مبيعات الشركة',
      href: `/expense-matrix?from=${data.from}&to=${data.to}`,
      icon: Receipt,
      badge: 'تحليل تكاليف',
    },
    {
      title: 'البنوك وتجميع التدفقات',
      desc: 'تجميع حركات البنوك (CIB / QNB / الأهلي / مصر) ومطابقة الأرصدة البنكية',
      href: `/banks-ytd?to=${data.to}`,
      icon: Landmark,
      badge: 'بنوك وخزينة',
    },
  ]

  return (
    <AppShell
      title="مركز التحليلات المتقدمة"
      subtitle="أدوات التحليل المقارن، مصفوفات التكاليف، أداء المناديب، ومؤشرات YTD"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/' }, { label: 'التحليلات' }]}
    >
      <UnifiedFilterBar
        branches={data.branches}
        defaultFrom={data.from}
        defaultTo={data.to}
        defaultBranch={filters.branch}
      />

      {/* Snapshot KPIs */}
      <section className="dashboard-kpis-grid">
        <KPICard
          label="صافي المبيعات"
          currentValue={cur.netSales}
          format="currency"
          subtitle="الفترة المحددة"
        />
        <KPICard
          label="المصروفات التشغيلية"
          currentValue={cur.expenses}
          format="currency"
          invertSentiment={true}
          subtitle={`نسبة ${pct(cur.expenseToSalesRate)}`}
        />
        <KPICard
          label="صافي النتيجة"
          currentValue={cur.netResult}
          format="currency"
          subtitle="الفائض التشغيلي"
        />
        <KPICard
          label="إجمالي التحصيل"
          currentValue={cur.collections}
          format="currency"
          subtitle="النقدية المحصلة"
        />
      </section>

      {/* Analytics Navigation Cards Grid */}
      <section className="analytics-modules-grid mt-4">
        {analyticalModules.map((mod) => {
          const Icon = mod.icon
          return (
            <Link key={mod.title} href={mod.href} className="analytics-module-card">
              <div className="module-card-top">
                <div className="module-icon-wrap">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <span className="module-badge">{mod.badge}</span>
              </div>

              <h4 className="module-title">{mod.title}</h4>
              <p className="module-desc">{mod.desc}</p>

              <div className="module-card-bottom">
                <span className="module-action-link">
                  <span>فتح التقرير</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          )
        })}
      </section>
    </AppShell>
  )
}
