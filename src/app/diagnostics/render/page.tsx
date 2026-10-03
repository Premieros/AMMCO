import { AppShell } from '@/components/app-shell'
import { UnifiedFilterBar } from '@/components/unified-filter-bar'
import { KPICard } from '@/components/kpi-card'
import { InteractiveTimeChart } from '@/components/interactive-time-chart'
import { BranchBarChart } from '@/components/branch-bar-chart'
import { AnomaliesList } from '@/components/anomalies-list'

export const dynamic = 'force-dynamic'

export default async function RenderDiagnostics({
  searchParams,
}: {
  searchParams: Promise<{ part?: string }>
}) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return <div>Not available</div>
  }

  const { part = 'shell' } = await searchParams

  const branches = [
    { id: 'b1', name: 'فرع اختبار', code: 'test' },
    { id: 'b2', name: 'فرع آخر', code: 'test2' },
  ]

  const timeline = [
    { date: '2026-09-01', label: '09-01', netSales: 1000, grossSales: 1200, expenses: 100, salesQty: 10, avgPrice: 100 },
    { date: '2026-09-02', label: '09-02', netSales: 1500, grossSales: 1700, expenses: 120, salesQty: 15, avgPrice: 100 },
  ]

  const branchPerformance = [
    {
      branchId: 'b1',
      branchName: 'فرع اختبار',
      netSales: 1000,
      grossSales: 1200,
      discounts: 200,
      discountRate: 0.16,
      salesQty: 10,
      standardizedQty: 10,
      avgPrice: 100,
      avgCartonPrice: 100,
      avgStandardPrice: 100,
      expenses: 100,
      expenseToSalesRate: 0.1,
      companySharePct: 60,
      netResult: 900,
      collections: 800,
      closingReceivables: 300,
      closingStockValue: 5000,
      closingStockQty: 50,
    },
  ]

  const anomalies = [
    {
      id: 'a1',
      type: 'sales_drop' as const,
      severity: 'warning' as const,
      title: 'تنبيه اختبار',
      description: 'رسالة اختبار آمنة',
      href: '/sales',
    },
  ]

  let body: React.ReactNode = <div data-diag="plain">plain-ok</div>

  if (part === 'filter') {
    body = <UnifiedFilterBar branches={branches} defaultFrom="2026-09-01" defaultTo="2026-09-30" />
  } else if (part === 'kpi') {
    body = <KPICard label="اختبار" currentValue={1000} previousValue={900} />
  } else if (part === 'time') {
    body = <InteractiveTimeChart data={timeline} />
  } else if (part === 'branch') {
    body = <BranchBarChart branches={branchPerformance} />
  } else if (part === 'anomalies') {
    body = <AnomaliesList anomalies={anomalies} />
  } else if (part === 'shell') {
    body = (
      <AppShell
        title="تشخيص"
        subtitle="بيانات وهمية"
        breadcrumbs={[{ label: 'تشخيص' }]}
      >
        <div data-diag="shell">shell-ok</div>
      </AppShell>
    )
  } else if (part === 'all') {
    body = (
      <AppShell title="تشخيص شامل" subtitle="بيانات وهمية">
        <UnifiedFilterBar branches={branches} defaultFrom="2026-09-01" defaultTo="2026-09-30" />
        <KPICard label="اختبار" currentValue={1000} previousValue={900} />
        <InteractiveTimeChart data={timeline} />
        <BranchBarChart branches={branchPerformance} />
        <AnomaliesList anomalies={anomalies} />
      </AppShell>
    )
  }

  return (
    <main dir="rtl">
      <div id="diag-part">{part}</div>
      {body}
    </main>
  )
}
