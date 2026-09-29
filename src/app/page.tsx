import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 0,
  }).format(value)
}

function number(value: number, digits = 0) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value)
}

function pct(value: number) {
  return `${number(value * 100, 1)}%`
}

type DailyRow = {
  branch_id: string | null
  branch_name: string | null
  business_date: string | null
  gross_sales: number | null
  net_sales: number | null
  discounts: number | null
  collections: number | null
  closing_receivables: number | null
  expenses: number | null
  closing_cash: number | null
  inventory_value: number | null
}

type RepRow = {
  branch_id: string
  rep_name: string
  sales_before_discount: number
  net_after_discount: number
  discounts: number
  deposit_amount: number
  closing_balance: number
}

type WarehouseRow = {
  branch_id: string
  business_date: string
  sales_qty: number
  sales_value: number
  closing_qty: number
  closing_value: number
}

type ExpenseRow = {
  branch_id: string
  branch_name: string
  canonical_category: string | null
  expense_group: string | null
  amount: number
}

function BarChart({ rows, valueKey }: { rows: DailyRow[]; valueKey: 'net_sales' | 'discounts' }) {
  const points = rows.filter((row) => row.business_date)
  const max = Math.max(1, ...points.map((row) => Number(row[valueKey] ?? 0)))
  return (
    <div className="mini-bars">
      {points.map((row) => {
        const value = Number(row[valueKey] ?? 0)
        const h = Math.max(2, Math.round((Math.max(0, value) / max) * 100))
        return (
          <div className="mini-bar-wrap" key={row.business_date ?? ''} title={`${row.business_date}: ${number(value)}`}>
            <div className="mini-bar" style={{ height: `${h}%` }} />
            <span>{row.business_date?.slice(-2)}</span>
          </div>
        )
      })}
    </div>
  )
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; from?: string; to?: string }>
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
      <AppShell title="بوابة AMMCO" subtitle="الحساب يحتاج تهيئة من مدير النظام">
        <div className="notice">تم تسجيل الدخول، لكن الحساب غير مربوط بمؤسسة AMMCO بعد.</div>
      </AppShell>
    )
  }

  const from = filters.from ?? '2026-09-01'
  const to = filters.to ?? '2026-09-30'

  let dailyQuery = supabase
    .from('v_branch_daily_kpis')
    .select('*')
    .gte('business_date', from)
    .lte('business_date', to)
    .order('business_date', { ascending: true })

  let repsQuery = supabase
    .from('sales_rep_daily')
    .select('branch_id,rep_name,sales_before_discount,net_after_discount,discounts,deposit_amount,closing_balance')
    .gte('business_date', from)
    .lte('business_date', to)

  let warehouseQuery = supabase
    .from('warehouse_daily_summary')
    .select('branch_id,business_date,sales_qty,sales_value,closing_qty,closing_value')
    .gte('business_date', from)
    .lte('business_date', to)
    .order('business_date', { ascending: true })

  let expenseQuery = supabase
    .from('v_expense_analysis')
    .select('branch_id,branch_name,canonical_category,expense_group,amount')
    .gte('entry_date', from)
    .lte('entry_date', to)

  if (filters.branch) {
    dailyQuery = dailyQuery.eq('branch_id', filters.branch)
    repsQuery = repsQuery.eq('branch_id', filters.branch)
    warehouseQuery = warehouseQuery.eq('branch_id', filters.branch)
    expenseQuery = expenseQuery.eq('branch_id', filters.branch)
  }

  const [
    { data: branches },
    { data: dailyData },
    { data: repData },
    { data: warehouseData },
    { data: expenseData },
  ] = await Promise.all([
    supabase.from('branches').select('id,name').eq('is_active', true).order('name'),
    dailyQuery,
    repsQuery,
    warehouseQuery,
    expenseQuery,
  ])

  const daily = (dailyData ?? []) as DailyRow[]
  const reps = (repData ?? []) as RepRow[]
  const warehouse = (warehouseData ?? []) as WarehouseRow[]
  const expenses = (expenseData ?? []) as ExpenseRow[]

  const totals = daily.reduce(
    (acc, row) => {
      acc.gross += Number(row.gross_sales ?? 0)
      acc.net += Number(row.net_sales ?? 0)
      acc.discount += Number(row.discounts ?? 0)
      acc.collections += Number(row.collections ?? 0)
      acc.expenses += Number(row.expenses ?? 0)
      return acc
    },
    { gross: 0, net: 0, discount: 0, collections: 0, expenses: 0 },
  )

  const salesQty = warehouse.reduce((sum, row) => sum + Number(row.sales_qty ?? 0), 0)
  const latestWarehouse = warehouse.at(-1)
  const latestDaily = daily.at(-1)
  const discountRate = totals.gross ? totals.discount / totals.gross : 0
  const expenseRate = totals.net ? totals.expenses / totals.net : 0

  const branchMap = new Map<string, {
    name: string
    net: number
    gross: number
    discount: number
    collections: number
    receivables: number
    expenses: number
    qty: number
  }>()

  for (const row of daily) {
    const id = row.branch_id ?? ''
    const item = branchMap.get(id) ?? {
      name: row.branch_name ?? '-',
      net: 0, gross: 0, discount: 0, collections: 0, receivables: 0, expenses: 0, qty: 0,
    }
    item.net += Number(row.net_sales ?? 0)
    item.gross += Number(row.gross_sales ?? 0)
    item.discount += Number(row.discounts ?? 0)
    item.collections += Number(row.collections ?? 0)
    item.expenses += Number(row.expenses ?? 0)
    item.receivables = Number(row.closing_receivables ?? item.receivables)
    branchMap.set(id, item)
  }

  for (const row of warehouse) {
    const item = branchMap.get(row.branch_id)
    if (item) item.qty += Number(row.sales_qty ?? 0)
  }

  const repsSorted = [...reps].sort((a, b) => Number(b.net_after_discount ?? 0) - Number(a.net_after_discount ?? 0))
  const repMax = Math.max(1, ...repsSorted.map((row) => Math.abs(Number(row.net_after_discount ?? 0))))

  const expenseGroups = new Map<string, number>()
  for (const row of expenses) {
    const key = row.expense_group || 'مصروفات أخرى'
    expenseGroups.set(key, (expenseGroups.get(key) ?? 0) + Number(row.amount ?? 0))
  }

  const dailyForChart = filters.branch
    ? daily
    : Array.from(
        daily.reduce((map, row) => {
          const date = row.business_date ?? ''
          const current = map.get(date) ?? {
            branch_id: null,
            branch_name: 'كل الفروع',
            business_date: date,
            gross_sales: 0,
            net_sales: 0,
            discounts: 0,
            collections: 0,
            closing_receivables: 0,
            expenses: 0,
            closing_cash: 0,
            inventory_value: 0,
          }
          current.gross_sales = Number(current.gross_sales ?? 0) + Number(row.gross_sales ?? 0)
          current.net_sales = Number(current.net_sales ?? 0) + Number(row.net_sales ?? 0)
          current.discounts = Number(current.discounts ?? 0) + Number(row.discounts ?? 0)
          current.collections = Number(current.collections ?? 0) + Number(row.collections ?? 0)
          current.expenses = Number(current.expenses ?? 0) + Number(row.expenses ?? 0)
          map.set(date, current)
          return map
        }, new Map<string, DailyRow>()).values(),
      ).sort((a, b) => String(a.business_date).localeCompare(String(b.business_date)))

  return (
    <AppShell
      title="بوابة AMMCO"
      subtitle={profile.full_name ? `مرحبًا ${profile.full_name} — تحليل الفروع الفعلي` : 'تحليل الفروع الفعلي'}
    >
      <form className="card filters" method="get">
        <div className="field">
          <label>الفرع</label>
          <select name="branch" defaultValue={filters.branch ?? ''}>
            <option value="">كل الفروع</option>
            {(branches ?? []).map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </div>
        <div className="field"><label>من</label><input type="date" name="from" defaultValue={from} /></div>
        <div className="field"><label>إلى</label><input type="date" name="to" defaultValue={to} /></div>
        <div className="field filter-action"><label>&nbsp;</label><button className="btn" type="submit">تطبيق</button></div>
      </form>

      <section className="grid portal-kpis">
        <Link className="card click-card" href={`/drilldown/sales?branch=${filters.branch ?? ''}&from=${from}&to=${to}`}><div className="kpi-label">صافي المبيعات</div><div className="kpi-value">{money(totals.net)}</div></Link>
        <Link className="card click-card" href={`/drilldown/gross?branch=${filters.branch ?? ''}&from=${from}&to=${to}`}><div className="kpi-label">البيع قبل الخصم</div><div className="kpi-value">{money(totals.gross)}</div></Link>
        <Link className="card click-card" href={`/drilldown/discounts?branch=${filters.branch ?? ''}&from=${from}&to=${to}`}><div className="kpi-label">الخصومات</div><div className="kpi-value">{money(totals.discount)}</div><div className="muted">{pct(discountRate)}</div></Link>
        <Link className="card click-card" href={`/drilldown/quantity?branch=${filters.branch ?? ''}&from=${from}&to=${to}`}><div className="kpi-label">كمية البيع</div><div className="kpi-value">{number(salesQty, 2)}</div></Link>
        <Link className="card click-card" href={`/drilldown/collections?branch=${filters.branch ?? ''}&from=${from}&to=${to}`}><div className="kpi-label">التحصيلات</div><div className="kpi-value">{money(totals.collections)}</div></Link>
        <Link className="card click-card" href={`/drilldown/receivables?branch=${filters.branch ?? ''}&from=${from}&to=${to}`}><div className="kpi-label">رصيد المديونية</div><div className="kpi-value">{money(Number(latestDaily?.closing_receivables ?? 0))}</div></Link>
        <Link className="card click-card" href={`/drilldown/inventory?branch=${filters.branch ?? ''}&from=${from}&to=${to}`}><div className="kpi-label">رصيد المخزون</div><div className="kpi-value">{money(Number(latestWarehouse?.closing_value ?? 0))}</div><div className="muted">{number(Number(latestWarehouse?.closing_qty ?? 0), 2)} وحدة</div></Link>
        <Link className="card click-card" href={`/expenses?branch=${filters.branch ?? ''}&from=${from}&to=${to}`}><div className="kpi-label">المصروفات</div><div className="kpi-value">{money(totals.expenses)}</div><div className="muted">{pct(expenseRate)} من صافي البيع</div></Link>
      </section>

      <section className="grid analytics-grid portal-charts">
        <div className="card">
          <div className="section-head"><h2>حركة المبيعات اليومية</h2><span className="muted">القيمة الصافية</span></div>
          <BarChart rows={dailyForChart} valueKey="net_sales" />
        </div>
        <div className="card">
          <div className="section-head"><h2>حركة الخصومات اليومية</h2><span className="muted">{pct(discountRate)} إجمالي</span></div>
          <BarChart rows={dailyForChart} valueKey="discounts" />
        </div>
      </section>

      <section className="card">
        <div className="section-head"><h2>مقارنة الفروع</h2><span className="muted">تتوسع تلقائيًا مع كل شيت معتمد</span></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>الفرع</th><th>صافي المبيعات</th><th>كمية البيع</th><th>الخصم</th><th>نسبة الخصم</th><th>التحصيل</th><th>المديونية</th><th>المصروفات</th></tr>
            </thead>
            <tbody>
              {[...branchMap.entries()].map(([id,row]) => (
                <tr key={id}>
                  <td>{row.name}</td>
                  <td>{money(row.net)}</td>
                  <td>{number(row.qty,2)}</td>
                  <td>{money(row.discount)}</td>
                  <td>{pct(row.gross ? row.discount / row.gross : 0)}</td>
                  <td>{money(row.collections)}</td>
                  <td>{money(row.receivables)}</td>
                  <td>{money(row.expenses)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid analytics-grid">
        <div className="card">
          <div className="section-head"><h2>مبيعات المناديب</h2><span className="muted">صافي / خصم / توريد / رصيد</span></div>
          <div className="rep-bars">
            {repsSorted.map((rep) => {
              const net = Number(rep.net_after_discount ?? 0)
              const gross = Number(rep.sales_before_discount ?? 0)
              const discount = Number(rep.discounts ?? 0)
              return (
                <div className="rep-row" key={`${rep.branch_id}-${rep.rep_name}`}>
                  <div className="rep-title">
                    <Link className="row-link" href={`/drilldown/reps?branch=${rep.branch_id}&rep=${encodeURIComponent(rep.rep_name)}&from=${from}&to=${to}`}>{rep.rep_name}</Link>
                    <Link className="row-link" href={`/drilldown/reps?branch=${rep.branch_id}&rep=${encodeURIComponent(rep.rep_name)}&from=${from}&to=${to}`}>{money(net)}</Link>
                  </div>
                  <div className="progress"><span style={{ width: `${Math.max(0, Math.abs(net) / repMax * 100)}%` }} /></div>
                  <div className="rep-meta">
                    <span>خصم {money(discount)} ({pct(gross ? discount / gross : 0)})</span>
                    <span>توريد {money(Number(rep.deposit_amount ?? 0))}</span>
                    <span>رصيد {money(Number(rep.closing_balance ?? 0))}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <div className="section-head"><h2>تحليل المصروفات</h2><span className="muted">{money(expenses.reduce((s,r)=>s+Number(r.amount ?? 0),0))}</span></div>
          <div className="expense-groups">
            {[...expenseGroups.entries()].sort((a,b)=>b[1]-a[1]).map(([name,value]) => (
              <div className="expense-row" key={name}>
                <span>{name}</span>
                <strong>{money(value)}</strong>
              </div>
            ))}
          </div>
          <a className="btn secondary portal-link" href="/expenses">فتح التحليل التفصيلي</a>
        </div>
      </section>

      <section className="card">
        <div className="section-head"><h2>حركة الأيام</h2><span className="muted">بيع، كمية، خصم، تحصيل، مصروف، رصيد</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>التاريخ</th><th>البيع</th><th>الكمية</th><th>الخصم</th><th>نسبة الخصم</th><th>التحصيل</th><th>المصروف</th><th>المديونية</th><th>رصيد المخزون</th></tr></thead>
            <tbody>
              {dailyForChart.slice().reverse().map((row) => {
                const wh = warehouse.find((item) => item.business_date === row.business_date && (!filters.branch || item.branch_id === filters.branch))
                const gross = Number(row.gross_sales ?? 0)
                const discount = Number(row.discounts ?? 0)
                return (
                  <tr key={row.business_date ?? ''}>
                    <td><Link className="row-link" href={`/drilldown/sales?branch=${row.branch_id ?? ''}&date=${row.business_date ?? ''}&from=${from}&to=${to}`}>{row.business_date}</Link></td>
                    <td><Link className="row-link" href={`/drilldown/sales?branch=${row.branch_id ?? ''}&date=${row.business_date ?? ''}&from=${from}&to=${to}`}>{money(Number(row.net_sales ?? 0))}</Link></td>
                    <td>{number(Number(wh?.sales_qty ?? 0),2)}</td>
                    <td>{money(discount)}</td>
                    <td>{pct(gross ? discount/gross : 0)}</td>
                    <td>{money(Number(row.collections ?? 0))}</td>
                    <td>{money(Number(row.expenses ?? 0))}</td>
                    <td>{money(Number(row.closing_receivables ?? 0))}</td>
                    <td>{money(Number(wh?.closing_value ?? row.inventory_value ?? 0))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  )
}
