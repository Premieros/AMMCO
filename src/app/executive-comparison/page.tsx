import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { SmartTable } from '@/components/smart-table'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Daily = {
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
}
type Warehouse = {
  branch_id: string
  business_date: string
  closing_qty: number
  closing_value: number
}

function n(v: unknown){ return Number(v ?? 0) }
function money(v:number){ return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v) }
function num(v:number,d=0){ return new Intl.NumberFormat('en-US',{maximumFractionDigits:d}).format(v) }
function pct(v:number){ return `${num(v*100,1)}%` }
function iso(d: Date){ return d.toISOString().slice(0,10) }

export default async function ExecutiveBranchComparison({
  searchParams,
}: { searchParams: Promise<{ branch?: string; from?: string; to?: string }> }) {
  const filters = await searchParams
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/login')

  const to = filters.to ?? '2026-09-30'
  const from = filters.from ?? `${to.slice(0,7)}-01`
  const fromDate = new Date(`${from}T00:00:00Z`)
  const prevEndDate = new Date(fromDate); prevEndDate.setUTCDate(0)
  const prevStartDate = new Date(Date.UTC(prevEndDate.getUTCFullYear(), prevEndDate.getUTCMonth(), 1))
  const ytdStart = `${to.slice(0,4)}-01-01`
  const prevFrom = iso(prevStartDate)
  const prevTo = iso(prevEndDate)

  const [{ data: branches }, { data: approvedBatches }] = await Promise.all([
    supabase.from('branches').select('id,name').eq('is_active',true).order('name'),
    supabase.from('import_batches').select('id').eq('status','approved'),
  ])
  const approvedIds = (approvedBatches ?? []).map((batch) => batch.id)
  const approvedFilter = approvedIds.length ? approvedIds : ['00000000-0000-0000-0000-000000000000']

  let currentQuery = supabase.from('v_branch_daily_kpis').select('*').gte('business_date',from).lte('business_date',to).order('business_date')
  let prevQuery = supabase.from('v_branch_daily_kpis').select('*').gte('business_date',prevFrom).lte('business_date',prevTo).order('business_date')
  let ytdQuery = supabase.from('v_branch_daily_kpis').select('branch_id,branch_name,net_sales').gte('business_date',ytdStart).lte('business_date',to)
  let warehouseQuery = supabase.from('warehouse_daily_summary').select('branch_id,business_date,closing_qty,closing_value').in('batch_id',approvedFilter).gte('business_date',from).lte('business_date',to).order('business_date')

  if (filters.branch) {
    currentQuery = currentQuery.eq('branch_id', filters.branch)
    prevQuery = prevQuery.eq('branch_id', filters.branch)
    ytdQuery = ytdQuery.eq('branch_id', filters.branch)
    warehouseQuery = warehouseQuery.eq('branch_id', filters.branch)
  }

  const [{ data: currentData }, { data: prevData }, { data: ytdData }, { data: warehouseData }] = await Promise.all([
    currentQuery, prevQuery, ytdQuery, warehouseQuery,
  ])

  const current=(currentData??[]) as Daily[]
  const previous=(prevData??[]) as Daily[]
  const ytd=(ytdData??[]) as Pick<Daily,'branch_id'|'branch_name'|'net_sales'>[]
  const warehouse=(warehouseData??[]) as Warehouse[]

  type Row={name:string;gross:number;net:number;collections:number;discounts:number;expenses:number;openingDebt:number;closingDebt:number;firstDate:string;lastDate:string;prevNet:number;hasPrev:boolean;ytdNet:number;stockQty:number;stockValue:number}
  const rows=new Map<string,Row>()
  for(const d of current){
    const id=d.branch_id??''
    const date=d.business_date??''
    const r=rows.get(id)??{name:d.branch_name??'-',gross:0,net:0,collections:0,discounts:0,expenses:0,openingDebt:n(d.opening_receivables),closingDebt:n(d.closing_receivables),firstDate:date,lastDate:date,prevNet:0,hasPrev:false,ytdNet:0,stockQty:0,stockValue:0}
    if(date && (!r.firstDate || date<r.firstDate)){r.firstDate=date;r.openingDebt=n(d.opening_receivables)}
    if(date && (!r.lastDate || date>=r.lastDate)){r.lastDate=date;r.closingDebt=n(d.closing_receivables)}
    r.gross+=n(d.gross_sales); r.net+=n(d.net_sales); r.collections+=n(d.collections); r.discounts+=n(d.discounts); r.expenses+=n(d.expenses)
    rows.set(id,r)
  }
  for(const d of previous){ const r=rows.get(d.branch_id??''); if(r){ r.prevNet+=n(d.net_sales); r.hasPrev=true } }
  for(const d of ytd){ const r=rows.get(d.branch_id??''); if(r) r.ytdNet+=n(d.net_sales) }
  for(const w of warehouse){ const r=rows.get(w.branch_id); if(r){r.stockQty=n(w.closing_qty);r.stockValue=n(w.closing_value)} }

  const total=[...rows.values()].reduce((a,r)=>({gross:a.gross+r.gross,net:a.net+r.net,discounts:a.discounts+r.discounts,collections:a.collections+r.collections,expenses:a.expenses+r.expenses,stock:a.stock+r.stockValue}),{gross:0,net:0,discounts:0,collections:0,expenses:0,stock:0})
  const selectedBranchName = (branches ?? []).find((b) => b.id === filters.branch)?.name ?? 'كل الفروع'
  const tableRows = [...rows.entries()].map(([id,r]) => ({
    href: `/?branch=${id}&from=${from}&to=${to}`,
    branch_name: r.name,
    gross_sales: money(r.gross),
    discounts: money(r.discounts),
    discount_rate: pct(r.gross?r.discounts/r.gross:0),
    net_sales: money(r.net),
    collections: money(r.collections),
    opening_receivables: money(r.openingDebt),
    closing_receivables: money(r.closingDebt),
    previous_month: r.hasPrev?money(r.prevNet):'غير متاح',
    change: r.hasPrev&&r.prevNet!==0?pct((r.net-r.prevNet)/Math.abs(r.prevNet)):'—',
    ytd: money(r.ytdNet),
    expenses: money(r.expenses),
    expense_rate: pct(r.net?r.expenses/r.net:0),
    stock_qty: num(r.stockQty,2),
    stock_value: money(r.stockValue),
  }))

  return <AppShell
    title="التقرير التنفيذي للفروع"
    subtitle="مقارنة الإدارة: المبيعات والتحصيل والمديونيات والمصروفات والمخزون والشهر السابق وYTD"
    breadcrumbs={[{label:'لوحة الإدارة',href:'/'},{label:'التقرير التنفيذي'}]}
  >
    <form className="card filters" method="get">
      <div className="field"><label>الفرع</label><select name="branch" defaultValue={filters.branch??''}><option value="">كل الفروع</option>{(branches??[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      <div className="field"><label>من</label><input type="date" name="from" defaultValue={from}/></div>
      <div className="field"><label>إلى</label><input type="date" name="to" defaultValue={to}/></div>
      <div className="field filter-action"><label>&nbsp;</label><button className="btn" type="submit">تطبيق التقرير</button></div>
    </form>

    <div className="report-scope">
      <span className="scope-chip">الفرع: <strong>{selectedBranchName}</strong></span>
      <span className="scope-chip">الفترة: <strong>{from} → {to}</strong></span>
      <span className="scope-chip">المصدر: <strong>النسخ المعتمدة فقط</strong></span>
    </div>

    <section className="grid portal-kpis">
      <div className="card"><div className="kpi-label">صافي المبيعات</div><div className="kpi-value">{money(total.net)}</div></div>
      <div className="card"><div className="kpi-label">التحصيل</div><div className="kpi-value">{money(total.collections)}</div></div>
      <div className="card"><div className="kpi-label">الخصومات</div><div className="kpi-value">{money(total.discounts)}</div><div className="muted">{pct(total.gross?total.discounts/total.gross:0)}</div></div>
      <div className="card"><div className="kpi-label">المصروفات</div><div className="kpi-value">{money(total.expenses)}</div><div className="muted">{pct(total.net?total.expenses/total.net:0)} من صافي البيع</div></div>
      <div className="card"><div className="kpi-label">قيمة المخزون</div><div className="kpi-value">{money(total.stock)}</div></div>
    </section>

    <div style={{marginTop:16}}>
      <SmartTable
        title="مقارنة الفروع"
        rows={tableRows}
        rowHrefKey="href"
        columns={[
          {key:'branch_name',label:'الفرع'},
          {key:'gross_sales',label:'قبل الخصم',numeric:true},
          {key:'discounts',label:'الخصم',numeric:true},
          {key:'discount_rate',label:'% الخصم'},
          {key:'net_sales',label:'صافي البيع',numeric:true},
          {key:'collections',label:'التحصيل',numeric:true},
          {key:'opening_receivables',label:'مديونية أول',numeric:true},
          {key:'closing_receivables',label:'مديونية آخر',numeric:true},
          {key:'previous_month',label:'الشهر السابق',numeric:true},
          {key:'change',label:'التغير'},
          {key:'ytd',label:'YTD',numeric:true},
          {key:'expenses',label:'المصروفات',numeric:true},
          {key:'expense_rate',label:'% المصروف'},
          {key:'stock_qty',label:'مخزون كمية',numeric:true},
          {key:'stock_value',label:'مخزون قيمة',numeric:true},
        ]}
      />
    </div>
  </AppShell>
}
