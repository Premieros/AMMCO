import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'
import { fetchAllPages, throwIfSupabaseError } from '@/lib/supabase/pagination'

export const dynamic = 'force-dynamic'

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 2,
  }).format(value)
}

function number(value: number, digits = 2) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value)
}

function pct(value: number) {
  return `${number(value * 100, 1)}%`
}

const TITLES: Record<string, string> = {
  sales: 'تحليل المبيعات',
  gross: 'البيع قبل الخصم',
  discounts: 'تحليل الخصومات',
  quantity: 'تحليل كمية البيع',
  collections: 'تحليل التحصيلات',
  receivables: 'تحليل المديونيات',
  inventory: 'تحليل المخزون',
  reps: 'تحليل المناديب',
}

export default async function DrilldownPage({
  params,
  searchParams,
}: {
  params: Promise<{ metric: string }>
  searchParams: Promise<{ branch?: string; from?: string; to?: string; date?: string; rep?: string }>
}) {
  const { metric } = await params
  const filters = await searchParams
  if (!TITLES[metric]) notFound()

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/login')

  const from = filters.from ?? '2026-09-01'
  const to = filters.to ?? '2026-09-30'

  let dailyQuery = supabase
    .from('v_branch_daily_kpis')
    .select('*')
    .gte('business_date', from)
    .lte('business_date', to)
    .order('business_date', { ascending: false })

  let warehouseQuery = supabase
    .from('warehouse_daily_summary')
    .select('*')
    .gte('business_date', from)
    .lte('business_date', to)
    .order('business_date', { ascending: false })

  if (filters.branch) {
    dailyQuery = dailyQuery.eq('branch_id', filters.branch)
    warehouseQuery = warehouseQuery.eq('branch_id', filters.branch)
  }
  if (filters.date) {
    dailyQuery = dailyQuery.eq('business_date', filters.date)
    warehouseQuery = warehouseQuery.eq('business_date', filters.date)
  }

  const reps = await fetchAllPages(
    (rangeFrom, rangeTo) => {
      let query = supabase
        .from('sales_rep_daily')
        .select('*')
        .gte('business_date', from)
        .lte('business_date', to)
        .order('net_after_discount', { ascending: false })
        .order('id', { ascending: false })

      if (filters.branch) query = query.eq('branch_id', filters.branch)
      if (filters.rep) query = query.eq('rep_name', filters.rep)
      return query.range(rangeFrom, rangeTo)
    },
    'تحميل تفاصيل المناديب',
  )

  const [
    { data: branches, error: branchesError },
    { data: dailyData, error: dailyError },
    { data: warehouseData, error: warehouseError },
  ] = await Promise.all([
    supabase.from('branches').select('id,name').eq('is_active', true).order('name'),
    dailyQuery,
    warehouseQuery,
  ])

  throwIfSupabaseError(branchesError, 'تحميل الفروع')
  throwIfSupabaseError(dailyError, 'تحميل المؤشرات اليومية')
  throwIfSupabaseError(warehouseError, 'تحميل ملخص المخزون')

  const daily = dailyData ?? []
  const warehouse = warehouseData ?? []

  const whByKey = new Map(
    warehouse.map((row) => [`${row.branch_id}:${row.business_date}`, row]),
  )

  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]))

  const latestWarehouseByBranch = new Map<string, (typeof warehouse)[number]>()
  for (const row of warehouse) {
    if (!latestWarehouseByBranch.has(row.branch_id)) latestWarehouseByBranch.set(row.branch_id, row)
  }

  const latestDailyByBranch = new Map<string, (typeof daily)[number]>()
  for (const row of daily) {
    const branchId = row.branch_id ?? ''
    if (!latestDailyByBranch.has(branchId)) latestDailyByBranch.set(branchId, row)
  }

  const uniqueRepCount = new Set(
    reps.map((row) => `${row.branch_id}::${row.rep_name}`),
  ).size

  const summary = {
    net: daily.reduce((s,r)=>s+Number(r.net_sales ?? 0),0),
    gross: daily.reduce((s,r)=>s+Number(r.gross_sales ?? 0),0),
    discounts: daily.reduce((s,r)=>s+Number(r.discounts ?? 0),0),
    collections: daily.reduce((s,r)=>s+Number(r.collections ?? 0),0),
    expenses: daily.reduce((s,r)=>s+Number(r.expenses ?? 0),0),
    qty: warehouse.reduce((s,r)=>s+Number(r.sales_qty ?? 0),0),
    inventory: [...latestWarehouseByBranch.values()].reduce((s,r)=>s+Number(r.closing_value ?? 0),0),
    inventoryQty: [...latestWarehouseByBranch.values()].reduce((s,r)=>s+Number(r.closing_qty ?? 0),0),
    receivables: [...latestDailyByBranch.values()].reduce((s,r)=>s+Number(r.closing_receivables ?? 0),0),
    repCount: uniqueRepCount,
  }

  return (
    <AppShell
      title={TITLES[metric]}
      subtitle="تفصيل مباشر من البيانات المعتمدة — بنفس منطق الشيت مع إمكانية الرجوع للمصدر"
      breadcrumbs={[
        { label: 'لوحة الإدارة', href: '/' },
        { label: TITLES[metric] },
      ]}
      actions={<Link className="btn secondary" href="/">رجوع للوحة الإدارة</Link>}
    >
      <form className="card filters" method="get">
        <div className="field">
          <label>الفرع</label>
          <select name="branch" defaultValue={filters.branch ?? ''}>
            <option value="">كل الفروع</option>
            {(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="field"><label>من</label><input type="date" name="from" defaultValue={from} /></div>
        <div className="field"><label>إلى</label><input type="date" name="to" defaultValue={to} /></div>
        <div className="field filter-action"><label>&nbsp;</label><button className="btn" type="submit">تطبيق</button></div>
      </form>

      <section className="grid portal-kpis" style={{ marginTop: 18 }}>
        {(metric === 'sales' || metric === 'gross' || metric === 'discounts') ? (
          <>
            <Link className="card click-card" href={`/drilldown/sales?branch=${filters.branch ?? ''}&from=${from}&to=${to}`}>
              <div className="kpi-label">صافي المبيعات</div><div className="kpi-value">{money(summary.net)}</div>
            </Link>
            <Link className="card click-card" href={`/drilldown/gross?branch=${filters.branch ?? ''}&from=${from}&to=${to}`}>
              <div className="kpi-label">قبل الخصم</div><div className="kpi-value">{money(summary.gross)}</div>
            </Link>
            <Link className="card click-card" href={`/drilldown/discounts?branch=${filters.branch ?? ''}&from=${from}&to=${to}`}>
              <div className="kpi-label">الخصومات</div><div className="kpi-value">{money(summary.discounts)}</div><div className="muted">{pct(summary.gross ? summary.discounts/summary.gross : 0)}</div>
            </Link>
          </>
        ) : null}

        {metric === 'quantity' ? (
          <div className="card"><div className="kpi-label">إجمالي كمية البيع</div><div className="kpi-value">{number(summary.qty)}</div></div>
        ) : null}
        {metric === 'collections' ? (
          <div className="card"><div className="kpi-label">إجمالي التحصيل</div><div className="kpi-value">{money(summary.collections)}</div></div>
        ) : null}
        {metric === 'receivables' ? (
          <div className="card"><div className="kpi-label">الرصيد الحالي</div><div className="kpi-value">{money(summary.receivables)}</div></div>
        ) : null}
        {metric === 'inventory' ? (
          <>
            <div className="card"><div className="kpi-label">قيمة المخزون</div><div className="kpi-value">{money(summary.inventory)}</div></div>
            <div className="card"><div className="kpi-label">كمية المخزون</div><div className="kpi-value">{number(summary.inventoryQty)}</div></div>
          </>
        ) : null}
        {metric === 'reps' ? (
          <div className="card"><div className="kpi-label">عدد المناديب</div><div className="kpi-value">{summary.repCount}</div></div>
        ) : null}
      </section>

      {metric === 'reps' ? (
        <section className="card" style={{ marginTop: 18 }}>
          <div className="section-head"><h2>كشف المناديب</h2><span className="pill">تفصيل شهري</span></div>
          <div className="table-wrap enterprise-table">
            <table>
              <thead>
                <tr><th>الفرع</th><th>المندوب</th><th>قبل الخصم</th><th>الخصم</th><th>نسبة الخصم</th><th>صافي البيع</th><th>التوريد</th><th>الرصيد</th></tr>
              </thead>
              <tbody>
                {reps.map((row) => (
                  <tr className="click-row" key={row.id}>
                    <td>{branchName.get(row.branch_id) ?? '-'}</td>
                    <td><Link className="row-link" href={`/drilldown/reps?branch=${row.branch_id}&rep=${encodeURIComponent(row.rep_name)}&from=${from}&to=${to}`}>{row.rep_name}</Link></td>
                    <td>{money(Number(row.sales_before_discount ?? 0))}</td>
                    <td>{money(Number(row.discounts ?? 0))}</td>
                    <td>{pct(Number(row.sales_before_discount ?? 0) ? Number(row.discounts ?? 0)/Number(row.sales_before_discount ?? 0) : 0)}</td>
                    <td>{money(Number(row.net_after_discount ?? 0))}</td>
                    <td>{money(Number(row.deposit_amount ?? 0))}</td>
                    <td>{money(Number(row.closing_balance ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {metric !== 'reps' ? (
        <section className="card" style={{ marginTop: 18 }}>
          <div className="section-head"><h2>حركة الأيام</h2><span className="pill">مصدر معتمد</span></div>
          <div className="table-wrap enterprise-table">
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th><th>الفرع</th><th>قبل الخصم</th><th>الخصم</th><th>صافي البيع</th>
                  <th>الكمية</th><th>التحصيل</th><th>المديونية</th><th>المخزون</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((row) => {
                  const wh = whByKey.get(`${row.branch_id}:${row.business_date}`)
                  return (
                    <tr className="click-row" key={`${row.branch_id ?? 'all'}-${row.business_date ?? 'date'}`}>
                      <td><Link className="row-link" href={`/drilldown/${metric}?branch=${row.branch_id}&date=${row.business_date}&from=${from}&to=${to}`}>{row.business_date}</Link></td>
                      <td>{row.branch_name ?? '-'}</td>
                      <td>{money(Number(row.gross_sales ?? 0))}</td>
                      <td>{money(Number(row.discounts ?? 0))}</td>
                      <td>{money(Number(row.net_sales ?? 0))}</td>
                      <td>{number(Number(wh?.sales_qty ?? 0))}</td>
                      <td>{money(Number(row.collections ?? 0))}</td>
                      <td>{money(Number(row.closing_receivables ?? 0))}</td>
                      <td>{money(Number(wh?.closing_value ?? row.inventory_value ?? 0))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </AppShell>
  )
}
