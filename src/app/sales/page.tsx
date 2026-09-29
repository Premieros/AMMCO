import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { SmartTable } from '@/components/smart-table'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function money(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

function pct(value: number) {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value * 100)}%`
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const filters = await searchParams
  const from = filters.from ?? ''
  const to = filters.to ?? ''
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/login')

  let dailyQuery = supabase
    .from('v_branch_daily_kpis')
    .select('*')
    .order('business_date', { ascending: false })
    .limit(5000)

  let warehouseQuery = supabase
    .from('warehouse_daily_summary')
    .select('branch_id,business_date,sales_qty,sales_value,closing_qty,closing_value,import_batches!inner(status)')
    .eq('import_batches.status', 'approved')
    .order('business_date', { ascending: false })
    .limit(5000)

  if (from) {
    dailyQuery = dailyQuery.gte('business_date', from)
    warehouseQuery = warehouseQuery.gte('business_date', from)
  }
  if (to) {
    dailyQuery = dailyQuery.lte('business_date', to)
    warehouseQuery = warehouseQuery.lte('business_date', to)
  }

  const [{ data: daily }, { data: warehouse }] = await Promise.all([
    dailyQuery,
    warehouseQuery,
  ])

  const warehouseByKey = new Map(
    (warehouse ?? []).map((row) => [`${row.branch_id}:${row.business_date}`, row]),
  )

  const rows = (daily ?? []).map((row) => {
    const wh = warehouseByKey.get(`${row.branch_id}:${row.business_date}`)
    const gross = Number(row.gross_sales ?? 0)
    const discount = Number(row.discounts ?? 0)
    return {
      href: `/drilldown/sales?branch=${row.branch_id ?? ''}&date=${row.business_date ?? ''}`,
      business_date: row.business_date ?? '',
      branch_name: row.branch_name ?? '-',
      gross_sales: money(gross),
      discounts: money(discount),
      discount_rate: pct(gross ? discount / gross : 0),
      net_sales: money(Number(row.net_sales ?? 0)),
      sales_qty: money(Number(wh?.sales_qty ?? 0)),
      collections: money(Number(row.collections ?? 0)),
      opening_receivables: money(Number(row.opening_receivables ?? 0)),
      closing_receivables: money(Number(row.closing_receivables ?? 0)),
      expenses: money(Number(row.expenses ?? 0)),
      closing_cash: money(Number(row.closing_cash ?? 0)),
      inventory_value: money(Number(wh?.closing_value ?? row.inventory_value ?? 0)),
    }
  })

  const totalNet = (daily ?? []).reduce((sum, row) => sum + Number(row.net_sales ?? 0), 0)
  const totalDiscount = (daily ?? []).reduce((sum, row) => sum + Number(row.discounts ?? 0), 0)
  const totalGross = (daily ?? []).reduce((sum, row) => sum + Number(row.gross_sales ?? 0), 0)
  const totalQty = (warehouse ?? []).reduce((sum, row) => sum + Number(row.sales_qty ?? 0), 0)

  return (
    <AppShell
      title="المبيعات"
      subtitle="حركة تراكمية مع فلاتر متعددة الفروع وبحث واختيار أعمدة مثل Excel"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/' }, { label: 'المبيعات' }]}
    >
      <form className="card filters" method="get" style={{ marginBottom: 16 }}>
        <div className="field"><label>من</label><input name="from" type="date" defaultValue={from} /></div>
        <div className="field"><label>إلى</label><input name="to" type="date" defaultValue={to} /></div>
        <div className="field filter-action"><label>&nbsp;</label><button className="btn" type="submit">تطبيق الفترة</button></div>
      </form>

      <section className="grid portal-kpis" style={{ marginBottom: 16 }}>
        <div className="card"><div className="kpi-label">صافي المبيعات</div><div className="kpi-value">{money(totalNet)}</div></div>
        <div className="card"><div className="kpi-label">البيع قبل الخصم</div><div className="kpi-value">{money(totalGross)}</div></div>
        <div className="card"><div className="kpi-label">الخصومات</div><div className="kpi-value">{money(totalDiscount)}</div><div className="muted">{pct(totalGross ? totalDiscount / totalGross : 0)}</div></div>
        <div className="card"><div className="kpi-label">كمية البيع</div><div className="kpi-value">{money(totalQty)}</div></div>
      </section>

      <SmartTable
        title="حركة المبيعات"
        rows={rows}
        rowHrefKey="href"
        columns={[
          { key: 'business_date', label: 'التاريخ' },
          { key: 'branch_name', label: 'الفرع' },
          { key: 'gross_sales', label: 'قبل الخصم', numeric: true },
          { key: 'discounts', label: 'الخصم', numeric: true },
          { key: 'discount_rate', label: 'نسبة الخصم' },
          { key: 'net_sales', label: 'صافي المبيعات', numeric: true },
          { key: 'sales_qty', label: 'كمية البيع', numeric: true },
          { key: 'collections', label: 'التحصيل', numeric: true },
          { key: 'opening_receivables', label: 'رصيد أول المديونية', numeric: true, hiddenByDefault: true },
          { key: 'closing_receivables', label: 'رصيد آخر المديونية', numeric: true },
          { key: 'expenses', label: 'المصروفات', numeric: true },
          { key: 'closing_cash', label: 'رصيد الخزنة', numeric: true, hiddenByDefault: true },
          { key: 'inventory_value', label: 'رصيد المخزون', numeric: true },
        ]}
      />
    </AppShell>
  )
}
