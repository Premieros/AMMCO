import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { UnifiedFilterBar } from '@/components/unified-filter-bar'
import { KPICard } from '@/components/kpi-card'
import { InteractiveTimeChart } from '@/components/interactive-time-chart'
import { BranchBarChart } from '@/components/branch-bar-chart'
import { AnomaliesList } from '@/components/anomalies-list'
import { createClient } from '@/lib/supabase/server'
import { getUnifiedIntelligenceData } from '@/lib/data-source'
import { detectAnomalies } from '@/lib/anomalies'
import { ArrowLeft, Clock, Building2, CheckCircle2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; from?: string; to?: string; compare?: string }>
}) {
  const filters = await searchParams
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile) {
    return (
      <AppShell title="AMMCO" subtitle="الحساب يحتاج تهيئة من مدير النظام">
        <div className="notice">تم تسجيل الدخول، لكن الحساب غير مربوط بمؤسسة AMMCO بعد.</div>
      </AppShell>
    )
  }

  const preview = process.env.VERCEL_ENV === 'preview'

  // Fetch unified data matching exact "One Number = One Source" principle.
  // In preview, surface the exact server-side stage instead of React's opaque #441.
  let data
  try {
    data = await getUnifiedIntelligenceData(supabase, {
      from: filters.from,
      to: filters.to,
      branch: filters.branch,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    console.error('dashboard-unified-data-failed', error)

    return (
      <AppShell title="AMMCO" subtitle="تعذر تجهيز بيانات لوحة الإدارة">
        <div className="notice">
          <strong>فشل تجهيز البيانات الموحدة.</strong>
          {preview && (
            <pre style={{ marginTop: 12, whiteSpace: 'pre-wrap', direction: 'ltr', textAlign: 'left' }}>
              {message}
              {stack ? `\n\n${stack}` : ''}
            </pre>
          )}
        </div>
      </AppShell>
    )
  }

  // Detect operational anomalies & deviations
  let anomalies
  try {
    anomalies = await detectAnomalies(
      supabase,
      data.from,
      data.to,
      filters.branch
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    console.error('dashboard-anomalies-failed', error)

    return (
      <AppShell title="AMMCO" subtitle="تعذر تجهيز تنبيهات لوحة الإدارة">
        <div className="notice">
          <strong>فشل تحليل الانحرافات.</strong>
          {preview && (
            <pre style={{ marginTop: 12, whiteSpace: 'pre-wrap', direction: 'ltr', textAlign: 'left' }}>
              {message}
              {stack ? `\n\n${stack}` : ''}
            </pre>
          )}
        </div>
      </AppShell>
    )
  }

  const cur = data.currentSummary
  const prev = data.prevSummary
  const showCompare = filters.compare === '1'

  // Format last updated date
  const lastUpdateFormatted = cur.lastUpdatedBatchDate
    ? new Date(cur.lastUpdatedBatchDate).toLocaleString('ar-EG', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : 'غير محدد'

  return (
    <AppShell
      title="مركز الإدارة والتحليل المالي"
      subtitle={`فترة التقرير: ${data.from} إلى ${data.to} · البيانات مستخرجة من النسخ المعتمدة فقط`}
      breadcrumbs={[{ label: 'لوحة الإدارة' }]}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/sales" className="btn-secondary-action">
            <span>تقرير المبيعات</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
          <Link href="/management-center" className="btn-primary-action">
            <span>مركز المراجعة</span>
          </Link>
        </div>
      }
    >
      {/* 1. Unified Global Filter Bar */}
      <UnifiedFilterBar
        branches={data.branches}
        defaultFrom={data.from}
        defaultTo={data.to}
        defaultBranch={filters.branch}
        exportType="sales"
      />

      {/* 2. Primary Executive KPIs (Requirement 3) */}
      <section className="dashboard-kpis-grid">
        {/* 1. Net Sales */}
        <KPICard
          label="صافي المبيعات"
          currentValue={cur.netSales}
          previousValue={prev.netSales}
          format="currency"
          showPrevious={showCompare}
          subtitle={`قبل الخصم: ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(cur.grossSales)} EGP`}
        />

        {/* 2. Total Actual Sales Cartons */}
        <KPICard
          label="كمية المبيعات الفعلية (Cartons)"
          currentValue={cur.salesQty}
          previousValue={prev.salesQty}
          format="number"
          showPrevious={showCompare}
          subtitle={`الكمية الموحدة (Double×2): ${new Intl.NumberFormat('en-US').format(cur.standardizedQty)} كرتونة موحدة`}
        />

        {/* 3. Average Price per Carton */}
        <KPICard
          label="متوسط سعر الكرتونة الفعلي"
          currentValue={cur.avgCartonPrice || cur.avgUnitPrice}
          previousValue={prev.avgCartonPrice || prev.avgUnitPrice}
          format="currency"
          showPrevious={showCompare}
          subtitle="صافي المبيعات ÷ عدد الكراتين الفعلي"
        />

        {/* 4. Total Expenses (INVERTED sentiment: increase is RED, decrease is GREEN) */}
        <KPICard
          label="إجمالي المصروفات"
          currentValue={cur.expenses}
          previousValue={prev.expenses}
          format="currency"
          invertSentiment={true}
          showPrevious={showCompare}
          subtitle="جميع بنود الصرف المعتمدة"
        />

        {/* 5. Net Operating Result (Sales - Expenses) */}
        <KPICard
          label="صافي النتيجة"
          currentValue={cur.netResult}
          previousValue={prev.netResult}
          format="currency"
          showPrevious={showCompare}
          subtitle="المبيعات بعد خصم المصروفات"
        />

        {/* 6. Expense to Sales Ratio (INVERTED sentiment) */}
        <KPICard
          label="نسبة المصروفات للمبيعات"
          currentValue={cur.expenseToSalesRate}
          previousValue={prev.expenseToSalesRate}
          format="percent"
          invertSentiment={true}
          showPrevious={showCompare}
          subtitle="المستهدف أقل من 15%"
        />

        {/* 7. Reporting Branches Count */}
        <div className="executive-kpi-card info-card">
          <div className="kpi-header">
            <span className="kpi-title">الفروع المرفوعة</span>
            <Building2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="kpi-current-val">
            {cur.reportingBranchesCount}{' '}
            <span className="text-sm font-normal text-slate-500">
              من أصل {cur.totalActiveBranchesCount} فرع
            </span>
          </div>
          <div className="kpi-footer">
            <span className="kpi-subtitle">
              نسبة التغطية:{' '}
              <b>
                {((cur.reportingBranchesCount / (cur.totalActiveBranchesCount || 1)) * 100).toFixed(0)}%
              </b>
            </span>
          </div>
        </div>

        {/* 8. Last Data Update */}
        <div className="executive-kpi-card info-card">
          <div className="kpi-header">
            <span className="kpi-title">آخر تحديث للبيانات</span>
            <Clock className="w-4 h-4 text-slate-500" />
          </div>
          <div className="kpi-current-val text-lg">{lastUpdateFormatted}</div>
          <div className="kpi-footer">
            <span className="kpi-subtitle flex items-center gap-1 text-emerald-600 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>نسخة معتمدة ومطابقة</span>
            </span>
          </div>
        </div>
      </section>

      {/* 3. Main Chart & Visual Intelligence (Requirement 4) */}
      <section className="dashboard-main-chart-section">
        <InteractiveTimeChart data={data.timeline} />
      </section>

      {/* 4. Branch Performance Comparison & Drill-down (Requirement 5) */}
      <section className="dashboard-branch-performance-section">
        <BranchBarChart
          branches={data.branchPerformance}
          selectedBranchId={filters.branch}
        />
      </section>

      {/* 5. Smart Insights / Anomalies Detector (Requirement 9) */}
      <section className="dashboard-anomalies-section">
        <AnomaliesList anomalies={anomalies} />
      </section>
    </AppShell>
  )
}
