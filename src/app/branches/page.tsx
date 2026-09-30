import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { UnifiedFilterBar } from '@/components/unified-filter-bar'
import { KPICard } from '@/components/kpi-card'
import { SmartDataTable } from '@/components/smart-data-table'
import { createClient } from '@/lib/supabase/server'
import { getUnifiedIntelligenceData } from '@/lib/data-source'
import { createBranch } from './actions'
import { Store, Plus, Building2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

function money(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v)
}

function num(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v)
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`
}

export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; from?: string; to?: string; error?: string; success?: string }>
}) {
  const filters = await searchParams
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  const data = await getUnifiedIntelligenceData(supabase, {
    from: filters.from,
    to: filters.to,
    branch: filters.branch,
  })

  // Requirement 13: Executive Branch Comparison Matrix
  // Rows: Net Sales, Gross Sales, Discounts, Discount %, Sales Qty, Avg Price, Expenses, Expense/Sales %, Collections, Closing Debt
  // Columns: Each branch + Company Total
  interface MatrixMetric {
    id: string
    label: string
    isCurrency?: boolean
    isPercent?: boolean
    isNumber?: boolean
    calcBranch: (b: (typeof data.branchPerformance)[0]) => number
    calcTotal: () => number
    drillUrl?: (branchId?: string) => string
  }

  const matrixMetrics: MatrixMetric[] = [
    {
      id: 'net_sales',
      label: 'صافي المبيعات (ج.م)',
      isCurrency: true,
      calcBranch: (b: (typeof data.branchPerformance)[0]) => b.netSales,
      calcTotal: () => data.currentSummary.netSales,
      drillUrl: (branchId?: string) => `/sales?from=${data.from}&to=${data.to}${branchId ? `&branch=${branchId}` : ''}`,
    },
    {
      id: 'gross_sales',
      label: 'البيع قبل الخصم (ج.م)',
      isCurrency: true,
      calcBranch: (b: (typeof data.branchPerformance)[0]) => b.grossSales,
      calcTotal: () => data.currentSummary.grossSales,
      drillUrl: (branchId?: string) => `/sales?from=${data.from}&to=${data.to}${branchId ? `&branch=${branchId}` : ''}`,
    },
    {
      id: 'discounts',
      label: 'إجمالي الخصومات (ج.م)',
      isCurrency: true,
      calcBranch: (b: (typeof data.branchPerformance)[0]) => b.discounts,
      calcTotal: () => data.currentSummary.discounts,
      drillUrl: (branchId?: string) => `/sales?from=${data.from}&to=${data.to}${branchId ? `&branch=${branchId}` : ''}`,
    },
    {
      id: 'discount_rate',
      label: 'نسبة الخصم %',
      isPercent: true,
      calcBranch: (b: (typeof data.branchPerformance)[0]) => b.discountRate,
      calcTotal: () => data.currentSummary.discountRate,
    },
    {
      id: 'sales_qty',
      label: 'كمية المبيعات (كرتونة)',
      isNumber: true,
      calcBranch: (b: (typeof data.branchPerformance)[0]) => b.salesQty,
      calcTotal: () => data.currentSummary.salesQty,
      drillUrl: (branchId?: string) => `/inventory-movement?from=${data.from}&to=${data.to}${branchId ? `&branch=${branchId}` : ''}`,
    },
    {
      id: 'avg_price',
      label: 'متوسط سعر الكرتونة (ج.م)',
      isCurrency: true,
      calcBranch: (b: (typeof data.branchPerformance)[0]) => b.avgPrice,
      calcTotal: () => data.currentSummary.avgUnitPrice,
    },
    {
      id: 'expenses',
      label: 'إجمالي المصروفات (ج.م)',
      isCurrency: true,
      calcBranch: (b: (typeof data.branchPerformance)[0]) => b.expenses,
      calcTotal: () => data.currentSummary.expenses,
      drillUrl: (branchId?: string) => `/expenses?from=${data.from}&to=${data.to}${branchId ? `&branch=${branchId}` : ''}`,
    },
    {
      id: 'expense_rate',
      label: 'نسبة المصروف للمبيعات %',
      isPercent: true,
      calcBranch: (b: (typeof data.branchPerformance)[0]) => b.expenseToSalesRate,
      calcTotal: () => data.currentSummary.expenseToSalesRate,
    },
    {
      id: 'collections',
      label: 'التحصيلات (ج.م)',
      isCurrency: true,
      calcBranch: (b: (typeof data.branchPerformance)[0]) => b.collections,
      calcTotal: () => data.currentSummary.collections,
      drillUrl: (branchId?: string) => `/receivables?from=${data.from}&to=${data.to}${branchId ? `&branch=${branchId}` : ''}`,
    },
    {
      id: 'closing_debt',
      label: 'رصيد المديونية النهائي (ج.م)',
      isCurrency: true,
      calcBranch: (b: (typeof data.branchPerformance)[0]) => b.closingReceivables,
      calcTotal: () => data.currentSummary.closingReceivables,
      drillUrl: (branchId?: string) => `/receivables?from=${data.from}&to=${data.to}${branchId ? `&branch=${branchId}` : ''}`,
    },
  ]

  return (
    <AppShell
      title="مقارنة الفروع ومصفوفة الأداء"
      subtitle={`مقارنة تنفيذية متكاملة لجميع مؤشرات الفروع مع ربط تفصيلي لكل رقم بمصدره الأصلي`}
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/' }, { label: 'الفروع' }]}
      actions={
        profile?.role === 'admin' ? (
          <a href="#add-branch" className="btn-primary-action">
            <Plus className="w-4 h-4" />
            <span>إضافة فرع جديد</span>
          </a>
        ) : null
      }
    >
      {filters.error && <div className="error">{filters.error}</div>}
      {filters.success && <div className="success">{filters.success}</div>}

      <UnifiedFilterBar
        branches={data.branches}
        defaultFrom={data.from}
        defaultTo={data.to}
        defaultBranch={filters.branch}
        exportType="branches"
      />

      {/* 1. Branch Matrix KPIs */}
      <section className="dashboard-kpis-grid">
        <KPICard
          label="عدد الفروع المسجلة"
          currentValue={data.branches.length}
          format="number"
          subtitle="جميع الفروع النشطة"
        />
        <KPICard
          label="الفروع المرفوعة في الفترة"
          currentValue={data.currentSummary.reportingBranchesCount}
          format="number"
          subtitle={`تغطية: ${((data.currentSummary.reportingBranchesCount / (data.branches.length || 1)) * 100).toFixed(0)}%`}
        />
        <KPICard
          label="إجمالي صافي المبيعات"
          currentValue={data.currentSummary.netSales}
          format="currency"
          subtitle="مجموع كل الفروع"
        />
        <KPICard
          label="إجمالي المصروفات"
          currentValue={data.currentSummary.expenses}
          format="currency"
          invertSentiment={true}
          subtitle={`نسبة ${pct(data.currentSummary.expenseToSalesRate)}`}
        />
        <KPICard
          label="صافي النتيجة التشغيلية"
          currentValue={data.currentSummary.netResult}
          format="currency"
          subtitle="المبيعات - المصروفات"
        />
      </section>

      {/* 2. Executive Branch Comparison Matrix (Requirement 13) */}
      <section className="branch-matrix-container mt-4">
        <div className="matrix-card-head">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-blue-600" />
            <div>
              <h3>مصفوفة المقارنة التنفيذية للفروع</h3>
              <span className="text-xs text-slate-500">
                انقر على أي خلية لفتح شاشة التفصيل والتحقق المباشر
              </span>
            </div>
          </div>
        </div>

        <div className="excel-scroll-frame">
          <table className="excel-table">
            <thead>
              <tr>
                <th className="sticky-first-col">المؤشر المالي / التشغيلي</th>
                {data.branchPerformance.map((b) => (
                  <th key={b.branchId} className="cell-numeric font-bold">
                    <Link
                      href={`/?branch=${b.branchId}&from=${data.from}&to=${data.to}`}
                      className="hover:underline text-blue-800"
                    >
                      {b.branchName}
                    </Link>
                  </th>
                ))}
                <th className="cell-numeric font-bold bg-blue-100/70 text-blue-900">
                  إجمالي الشركة
                </th>
              </tr>
            </thead>
            <tbody>
              {matrixMetrics.map((m) => (
                <tr key={m.id}>
                  <td className="sticky-first-col font-bold text-slate-800">
                    {m.label}
                  </td>
                  {data.branchPerformance.map((b) => {
                    const rawVal = m.calcBranch(b)
                    let displayVal = '-'
                    if (m.isCurrency) displayVal = money(rawVal)
                    else if (m.isPercent) displayVal = pct(rawVal)
                    else if (m.isNumber) displayVal = num(rawVal)

                    const href = m.drillUrl ? m.drillUrl(b.branchId) : null

                    return (
                      <td key={b.branchId} className="cell-numeric matrix-cell">
                        {href ? (
                          <Link href={href} className="drill-link">
                            {displayVal}
                          </Link>
                        ) : (
                          displayVal
                        )}
                      </td>
                    )
                  })}
                  {/* Company Total Column */}
                  <td className="cell-numeric font-bold bg-blue-50 text-blue-950">
                    {m.drillUrl ? (
                      <Link href={m.drillUrl()} className="drill-link font-bold">
                        {m.isCurrency
                          ? money(m.calcTotal())
                          : m.isPercent
                          ? pct(m.calcTotal())
                          : num(m.calcTotal())}
                      </Link>
                    ) : (
                      m.isCurrency
                        ? money(m.calcTotal())
                        : m.isPercent
                        ? pct(m.calcTotal())
                        : num(m.calcTotal())
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Branch Management & Creation Panel (Admin Only) */}
      {profile?.role === 'admin' && (
        <section id="add-branch" className="branch-create-section mt-6">
          <div className="create-panel-head">
            <Building2 className="w-5 h-5 text-blue-600" />
            <div>
              <h4>إضافة فرع جديد والخزنة التلقائية</h4>
              <p className="text-xs text-slate-500">
                يتم إنشاء الفرع والخزنة الرئيسية آلياً ويظهر فوراً في جميع الفلاتر وشاشات الرفع والتقارير
              </p>
            </div>
          </div>

          <form action={createBranch} className="branch-form-inline">
            <div className="field-group">
              <label htmlFor="name">اسم الفرع</label>
              <input id="name" name="name" required placeholder="مثال: المنصورة" />
            </div>
            <div className="field-group">
              <label htmlFor="code">كود الفرع (إنجليزي)</label>
              <input id="code" name="code" required placeholder="mansoura" dir="ltr" />
            </div>
            <button type="submit" className="btn-primary-action">
              إنشاء الفرع والخزنة
            </button>
          </form>
        </section>
      )}
    </AppShell>
  )
}
