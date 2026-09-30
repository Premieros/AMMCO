import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { SmartTable } from '@/components/smart-table'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function money(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}
function number(value: number, digits = 0) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value)
}
function pct(value: number) {
  return `${number(value * 100, 1)}%`
}
function iso(date: Date) {
  return date.toISOString().slice(0, 10)
}

type DailyRow = {
  branch_id: string | null
  branch_name: string | null
  business_date: string | null
  gross_sales: number | null
  net_sales: number | null
  discounts: number | null
  collections: number | null
  opening_receivables: number | null
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

type BranchSummary = {
  name: string
  gross: number
  net: number
  discount: number
  collections: number
  openingReceivables: number
  closingReceivables: number
  expenses: number
  qty: number
  closingStockQty: number
  closingStockValue: number
  firstDate: string
  lastDate: string
}

function BarChart({ rows, valueKey }: { rows: DailyRow[]; valueKey: 'net_sales' | 'collections' }) {
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

function delta(current: number, previous: number) {
  if (!previous) return null
  return (current - previous) / Math.abs(previous)
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
      <AppShell title="AMMCO" subtitle="الحساب يحتاج تهيئة من مدير النظام">
        <div className="notice">تم تسجيل الدخول، لكن الحساب غير مربوط بمؤسسة AMMCO بعد.</div>
      </AppShell>
    )
  }

  const from = filters.from ?? '2026-09-01'
  const to = filters.to ?? '2026-09-30'
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  const previousToDate = new Date(start)
  previousToDate.setUTCDate(previousToDate.getUTCDate() - 1)
  const previousFromDate = new Date(previousToDate)
  previousFromDate.setUTCDate(previousFromDate.getUTCDate() - days + 1)
  const previousFrom = iso(previousFromDate)
  const previousTo = iso(previousToDate)

  const [{ data: branches }, { data: approvedBatches }] = await Promise.all([
    supabase.from('branches').select('id,name').eq('is_active', true).order('name'),
    supabase.from('import_batches').select('id').eq('status', 'approved'),
  ])
  const approvedIds = (approvedBatches ?? []).map((row) => row.id)
  const approvedFilter = approvedIds.length ? approvedIds : ['00000000-0000-0000-0000-000000000000']

  let dailyQuery = supabase.from('v_branch_daily_kpis').select('*').gte('business_date', from).lte('business_date', to).order('business_date')
  let previousQuery = supabase.from('v_branch_daily_kpis').select('branch_id,net_sales,collections,expenses').gte('business_date', previousFrom).lte('business_date', previousTo)
  let repsQuery = supabase.from('sales_rep_daily').select('branch_id,rep_name,sales_before_discount,net_after_discount,discounts,deposit_amount,closing_balance').in('batch_id', approvedFilter).gte('business_date', from).lte('business_date', to)
  let warehouseQuery = supabase.from('warehouse_daily_summary').select('branch_id,business_date,sales_qty,sales_value,closing_qty,closing_value').in('batch_id', approvedFilter).gte('business_date', from).lte('business_date', to).order('business_date')
  let expenseQuery = supabase.from('v_expense_analysis').select('branch_id,branch_name,canonical_category,expense_group,amount').gte('entry_date', from).lte('entry_date', to)

  if (filters.branch) {
    dailyQuery = dailyQuery.eq('branch_id', filters.branch)
    previousQuery = previousQuery.eq('branch_id', filters.branch)
    repsQuery = repsQuery.eq('branch_id', filters.branch)
    warehouseQuery = warehouseQuery.eq('branch_id', filters.branch)
    expenseQuery = expenseQuery.eq('branch_id', filters.branch)
  }

  const [
    { data: dailyData },
    { data: previousData },
    { data: repData },
    { data: warehouseData },
    { data: expenseData },
  ] = await Promise.all([dailyQuery, previousQuery, repsQuery, warehouseQuery, expenseQuery])

  const daily = (dailyData ?? []) as DailyRow[]
  const previous = (previousData ?? []) as Pick<DailyRow,'branch_id'|'net_sales'|'collections'|'expenses'>[]
  const reps = (repData ?? []) as RepRow[]
  const warehouse = (warehouseData ?? []) as WarehouseRow[]
  const expenses = (expenseData ?? []) as ExpenseRow[]
  const branchNames = new Map((branches ?? []).map((branch) => [branch.id, branch.name]))

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
  const previousTotals = previous.reduce(
    (acc, row) => {
      acc.net += Number(row.net_sales ?? 0)
      acc.collections += Number(row.collections ?? 0)
      acc.expenses += Number(row.expenses ?? 0)
      return acc
    },
    { net: 0, collections: 0, expenses: 0 },
  )

  const branchMap = new Map<string, BranchSummary>()
  for (const row of daily) {
    const id = row.branch_id ?? ''
    const date = row.business_date ?? ''
    const item = branchMap.get(id) ?? {
      name: row.branch_name ?? branchNames.get(id) ?? '-',
      gross: 0, net: 0, discount: 0, collections: 0,
      openingReceivables: Number(row.opening_receivables ?? 0),
      closingReceivables: Number(row.closing_receivables ?? 0),
      expenses: 0, qty: 0, closingStockQty: 0, closingStockValue: 0,
      firstDate: date, lastDate: date,
    }
    if (date && (!item.firstDate || date < item.firstDate)) {
      item.firstDate = date
      item.openingReceivables = Number(row.opening_receivables ?? 0)
    }
    if (date && (!item.lastDate || date >= item.lastDate)) {
      item.lastDate = date
      item.closingReceivables = Number(row.closing_receivables ?? 0)
    }
    item.net += Number(row.net_sales ?? 0)
    item.gross += Number(row.gross_sales ?? 0)
    item.discount += Number(row.discounts ?? 0)
    item.collections += Number(row.collections ?? 0)
    item.expenses += Number(row.expenses ?? 0)
    branchMap.set(id, item)
  }

  for (const row of warehouse) {
    const item = branchMap.get(row.branch_id)
    if (!item) continue
    item.qty += Number(row.sales_qty ?? 0)
    if (!item.lastDate || row.business_date >= item.lastDate) {
      item.closingStockQty = Number(row.closing_qty ?? 0)
      item.closingStockValue = Number(row.closing_value ?? 0)
    }
  }

  const companyClosingReceivables = [...branchMap.values()].reduce((sum,row)=>sum+row.closingReceivables,0)
  const companyOpeningReceivables = [...branchMap.values()].reduce((sum,row)=>sum+row.openingReceivables,0)
  const companyClosingStockQty = [...branchMap.values()].reduce((sum,row)=>sum+row.closingStockQty,0)
  const companyClosingStockValue = [...branchMap.values()].reduce((sum,row)=>sum+row.closingStockValue,0)
  const salesQty = [...branchMap.values()].reduce((sum,row)=>sum+row.qty,0)
  const discountRate = totals.gross ? totals.discount / totals.gross : 0
  const expenseRate = totals.net ? totals.expenses / totals.net : 0
  const collectionRate = totals.net ? totals.collections / totals.net : 0

  const selectedBranchName = (branches ?? []).find((b) => b.id === filters.branch)?.name ?? 'كل الفروع'

  const repsAggregated = new Map<string, {branchId:string;name:string;gross:number;net:number;discount:number;deposit:number;closing:number}>()
  for (const rep of reps) {
    const key = `${rep.branch_id}::${rep.rep_name}`
    const item = repsAggregated.get(key) ?? {branchId:rep.branch_id,name:rep.rep_name,gross:0,net:0,discount:0,deposit:0,closing:0}
    item.gross += Number(rep.sales_before_discount ?? 0)
    item.net += Number(rep.net_after_discount ?? 0)
    item.discount += Number(rep.discounts ?? 0)
    item.deposit += Number(rep.deposit_amount ?? 0)
    item.closing = Number(rep.closing_balance ?? item.closing)
    repsAggregated.set(key,item)
  }
  const repsSorted = [...repsAggregated.values()].sort((a,b)=>b.net-a.net).slice(0,6)
  const repMax = Math.max(1,...repsSorted.map((row)=>Math.abs(row.net)))

  const expenseGroups = new Map<string, number>()
  for (const row of expenses) {
    const key = row.expense_group || 'مصروفات أخرى'
    expenseGroups.set(key, (expenseGroups.get(key) ?? 0) + Number(row.amount ?? 0))
  }
  const expenseLeaders = [...expenseGroups.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6)

  const dailyForChart = filters.branch
    ? daily
    : Array.from(
        daily.reduce((map, row) => {
          const date = row.business_date ?? ''
          const current = map.get(date) ?? {
            branch_id: null, branch_name: 'كل الفروع', business_date: date,
            gross_sales: 0, net_sales: 0, discounts: 0, collections: 0,
            opening_receivables: 0, closing_receivables: 0, expenses: 0,
            closing_cash: 0, inventory_value: 0,
          }
          current.gross_sales = Number(current.gross_sales ?? 0) + Number(row.gross_sales ?? 0)
          current.net_sales = Number(current.net_sales ?? 0) + Number(row.net_sales ?? 0)
          current.discounts = Number(current.discounts ?? 0) + Number(row.discounts ?? 0)
          current.collections = Number(current.collections ?? 0) + Number(row.collections ?? 0)
          current.expenses = Number(current.expenses ?? 0) + Number(row.expenses ?? 0)
          map.set(date,current)
          return map
        }, new Map<string, DailyRow>()).values(),
      ).sort((a,b)=>String(a.business_date).localeCompare(String(b.business_date)))

  const branchRows = [...branchMap.entries()].map(([id,row]) => ({
    href: `/executive-comparison?branch=${id}&from=${from}&to=${to}`,
    branch_name: row.name,
    net_sales: money(row.net),
    sales_qty: number(row.qty,2),
    discount: money(row.discount),
    discount_rate: pct(row.gross ? row.discount/row.gross : 0),
    collections: money(row.collections),
    collection_rate: pct(row.net ? row.collections/row.net : 0),
    opening_receivable: money(row.openingReceivables),
    closing_receivable: money(row.closingReceivables),
    expenses: money(row.expenses),
    expense_rate: pct(row.net ? row.expenses/row.net : 0),
    stock_value: money(row.closingStockValue),
  }))

  const attention = [...branchMap.entries()].flatMap(([id,row]) => {
    const items: Array<{tone:'warning'|'info';title:string;detail:string;href:string}> = []
    const branchDiscountRate = row.gross ? row.discount/row.gross : 0
    const branchExpenseRate = row.net ? row.expenses/row.net : 0
    const branchCollectionRate = row.net ? row.collections/row.net : 0
    if (branchDiscountRate > 0.1) items.push({tone:'warning',title:`خصم مرتفع — ${row.name}`,detail:`${pct(branchDiscountRate)} من البيع قبل الخصم`,href:`/sales?branch=${id}&from=${from}&to=${to}`})
    if (branchExpenseRate > 0.1) items.push({tone:'warning',title:`مصروفات مرتفعة — ${row.name}`,detail:`${pct(branchExpenseRate)} من صافي المبيعات`,href:`/expenses?branch=${id}&from=${from}&to=${to}`})
    if (branchCollectionRate < 0.5 && row.net > 0) items.push({tone:'info',title:`التحصيل يحتاج مراجعة — ${row.name}`,detail:`${pct(branchCollectionRate)} من صافي البيع`,href:`/receivables?branch=${id}&from=${from}&to=${to}`})
    return items
  }).slice(0,8)

  const reportLinks = [
    {href:`/executive-comparison?branch=${filters.branch??''}&from=${from}&to=${to}`,title:'التقرير التنفيذي',desc:'مبيعات، تحصيل، مديونية، مصروفات ومخزون'},
    {href:`/sales?branch=${filters.branch??''}&from=${from}&to=${to}`,title:'تقرير المبيعات',desc:'تفاصيل الأيام والفروع والخصومات'},
    {href:`/representatives?branch=${filters.branch??''}&from=${from}&to=${to}`,title:'أداء المناديب',desc:'بيع، خصم، توريد، مصروف ورصيد'},
    {href:`/expense-matrix?branch=${filters.branch??''}&from=${from}&to=${to}`,title:'مصفوفة المصروفات',desc:'البند × الفرع والنسبة من المبيعات'},
    {href:`/product-matrix?branch=${filters.branch??''}&from=${from}&to=${to}`,title:'مصفوفة الأصناف',desc:'الصنف × الفرع، كمية وقيمة'},
    {href:`/monthly-analysis?branch=${filters.branch??''}&year=${to.slice(0,4)}`,title:'Monthly / YTD',desc:'مقارنة الشهور والتراكم السنوي'},
  ]

  return (
    <AppShell
      title="مركز الإدارة"
      subtitle={profile.full_name ? `مرحبًا ${profile.full_name} — صورة تنفيذية موحدة لأداء الفروع` : 'صورة تنفيذية موحدة لأداء الفروع'}
      actions={<><Link className="btn secondary" href="/branches#add-branch">+ إضافة فرع</Link><Link className="btn" href="/uploads">رفع شيت فرع</Link></>}
    >
      <form className="card filters" method="get">
        <div className="field">
          <label>الفرع</label>
          <select name="branch" defaultValue={filters.branch ?? ''}>
            <option value="">كل الفروع</option>
            {(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </div>
        <div className="field"><label>من</label><input type="date" name="from" defaultValue={from} /></div>
        <div className="field"><label>إلى</label><input type="date" name="to" defaultValue={to} /></div>
        <div className="field filter-action"><label>&nbsp;</label><button className="btn" type="submit">تطبيق</button></div>
      </form>

      <div className="report-scope">
        <span className="scope-chip">الفرع: <strong>{selectedBranchName}</strong></span>
        <span className="scope-chip">الفترة: <strong>{from} → {to}</strong></span>
        <span className="scope-chip">الفترة السابقة: <strong>{previousFrom} → {previousTo}</strong></span>
        <span className="scope-chip">البيانات: <strong>Approved فقط</strong></span>
      </div>

      <section className="executive-kpis">
        <Link className="executive-kpi" href={`/sales?branch=${filters.branch??''}&from=${from}&to=${to}`}>
          <span>صافي المبيعات</span><strong>{money(totals.net)}</strong>
          <small>{delta(totals.net,previousTotals.net)===null?'لا توجد فترة مقارنة':`${delta(totals.net,previousTotals.net)!>=0?'▲':'▼'} ${pct(Math.abs(delta(totals.net,previousTotals.net)!))} عن الفترة السابقة`}</small>
        </Link>
        <Link className="executive-kpi" href={`/receivables?branch=${filters.branch??''}&from=${from}&to=${to}`}>
          <span>التحصيل</span><strong>{money(totals.collections)}</strong><small>{pct(collectionRate)} من صافي البيع</small>
        </Link>
        <Link className="executive-kpi" href={`/receivables?branch=${filters.branch??''}&from=${from}&to=${to}`}>
          <span>مديونية آخر</span><strong>{money(companyClosingReceivables)}</strong><small>افتتاحي {money(companyOpeningReceivables)}</small>
        </Link>
        <Link className="executive-kpi" href={`/expenses?branch=${filters.branch??''}&from=${from}&to=${to}`}>
          <span>المصروفات</span><strong>{money(totals.expenses)}</strong><small>{pct(expenseRate)} من صافي البيع</small>
        </Link>
        <Link className="executive-kpi" href={`/sales?branch=${filters.branch??''}&from=${from}&to=${to}`}>
          <span>الخصومات</span><strong>{money(totals.discount)}</strong><small>{pct(discountRate)} من البيع قبل الخصم</small>
        </Link>
        <Link className="executive-kpi" href={`/product-matrix?branch=${filters.branch??''}&from=${from}&to=${to}`}>
          <span>المخزون</span><strong>{money(companyClosingStockValue)}</strong><small>{number(companyClosingStockQty,2)} وحدة</small>
        </Link>
        <Link className="executive-kpi" href={`/sales?branch=${filters.branch??''}&from=${from}&to=${to}`}>
          <span>كمية البيع</span><strong>{number(salesQty,2)}</strong><small>خلال الفترة المحددة</small>
        </Link>
        <Link className="executive-kpi" href="/branches">
          <span>الفروع النشطة</span><strong>{branches?.length ?? 0}</strong><small>إدارة وإضافة الفروع</small>
        </Link>
      </section>

      <section className="report-launcher">
        {reportLinks.map((item)=><Link key={item.href} href={item.href} className="report-launcher-card"><strong>{item.title}</strong><span>{item.desc}</span><em>فتح التقرير ←</em></Link>)}
      </section>

      <section className="grid command-grid">
        <div className="card">
          <div className="section-head"><div><h2>اتجاه صافي المبيعات</h2><p className="muted">حركة الفترة المحددة</p></div><Link className="row-link" href="/sales">التفاصيل</Link></div>
          <BarChart rows={dailyForChart} valueKey="net_sales" />
        </div>
        <div className="card">
          <div className="section-head"><div><h2>اتجاه التحصيل</h2><p className="muted">مقارنة التحصيل بالأيام</p></div><Link className="row-link" href="/receivables">التفاصيل</Link></div>
          <BarChart rows={dailyForChart} valueKey="collections" />
        </div>
      </section>

      <div style={{marginTop:16}}>
        <SmartTable
          title="مقارنة الفروع التنفيذية"
          rows={branchRows}
          rowHrefKey="href"
          columns={[
            {key:'branch_name',label:'الفرع'},
            {key:'net_sales',label:'صافي المبيعات',numeric:true},
            {key:'sales_qty',label:'كمية البيع',numeric:true},
            {key:'discount',label:'الخصم',numeric:true},
            {key:'discount_rate',label:'% الخصم'},
            {key:'collections',label:'التحصيل',numeric:true},
            {key:'collection_rate',label:'% التحصيل'},
            {key:'opening_receivable',label:'مديونية أول',numeric:true},
            {key:'closing_receivable',label:'مديونية آخر',numeric:true},
            {key:'expenses',label:'المصروفات',numeric:true},
            {key:'expense_rate',label:'% المصروف'},
            {key:'stock_value',label:'قيمة المخزون',numeric:true},
          ]}
        />
      </div>

      <section className="grid command-grid dashboard-lower">
        <div className="card">
          <div className="section-head"><div><h2>مؤشرات تحتاج متابعة</h2><p className="muted">تنبيهات حسابية من الفترة الحالية</p></div></div>
          <div className="attention-list">
            {attention.length ? attention.map((item,index)=><Link key={`${item.title}-${index}`} href={item.href} className={`attention-item ${item.tone}`}><div><strong>{item.title}</strong><span>{item.detail}</span></div><b>فتح</b></Link>) : <div className="empty-state">لا توجد مؤشرات تتجاوز حدود المتابعة الحالية.</div>}
          </div>
        </div>

        <div className="card">
          <div className="section-head"><div><h2>أعلى المناديب بالمبيعات</h2><p className="muted">مع إظهار الفرع والتوريد والرصيد</p></div><Link className="row-link" href={`/representatives?branch=${filters.branch??''}&from=${from}&to=${to}`}>كل المناديب</Link></div>
          <div className="rep-bars">
            {repsSorted.map((rep)=><div className="rep-row" key={`${rep.branchId}-${rep.name}`}><div className="rep-title"><span><b>{rep.name}</b> <span className="branch-badge">{branchNames.get(rep.branchId)??'-'}</span></span><strong>{money(rep.net)}</strong></div><div className="progress"><span style={{width:`${Math.max(0,Math.abs(rep.net)/repMax*100)}%`}} /></div><div className="rep-meta"><span>توريد {money(rep.deposit)}</span><span>خصم {pct(rep.gross?rep.discount/rep.gross:0)}</span><span>رصيد {money(rep.closing)}</span></div></div>)}
          </div>
        </div>

        <div className="card">
          <div className="section-head"><div><h2>أكبر مجموعات المصروفات</h2><p className="muted">أين يتركز الإنفاق</p></div><Link className="row-link" href={`/expense-matrix?branch=${filters.branch??''}&from=${from}&to=${to}`}>المصفوفة</Link></div>
          <div className="expense-groups">
            {expenseLeaders.map(([name,value])=><div className="expense-row" key={name}><span>{name}</span><strong>{money(value)}</strong></div>)}
          </div>
        </div>
      </section>
    </AppShell>
  )
}
