import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
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
  inventory_value: number | null
}
type Warehouse = {
  branch_id: string
  business_date: string
  closing_qty: number
  closing_value: number
}
function n(v: unknown){ return Number(v ?? 0) }
function money(v:number){ return new Intl.NumberFormat('en-US',{style:'currency',currency:'EGP',maximumFractionDigits:0}).format(v) }
function num(v:number,d=0){ return new Intl.NumberFormat('en-US',{maximumFractionDigits:d}).format(v) }
function pct(v:number){ return `${num(v*100,1)}%` }
function iso(d: Date){ return d.toISOString().slice(0,10) }

export default async function ExecutiveBranchComparison({
  searchParams,
}: { searchParams: Promise<{ from?: string; to?: string }> }) {
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

  const [{ data: currentData }, { data: prevData }, { data: ytdData }, { data: warehouseData }] = await Promise.all([
    supabase.from('v_branch_daily_kpis').select('*').gte('business_date',from).lte('business_date',to).order('business_date'),
    supabase.from('v_branch_daily_kpis').select('*').gte('business_date',prevFrom).lte('business_date',prevTo).order('business_date'),
    supabase.from('v_branch_daily_kpis').select('branch_id,branch_name,net_sales').gte('business_date',ytdStart).lte('business_date',to),
    supabase.from('warehouse_daily_summary').select('branch_id,business_date,closing_qty,closing_value').gte('business_date',from).lte('business_date',to).order('business_date'),
  ])

  const current=(currentData??[]) as Daily[]
  const previous=(prevData??[]) as Daily[]
  const ytd=(ytdData??[]) as Pick<Daily,'branch_id'|'branch_name'|'net_sales'>[]
  const warehouse=(warehouseData??[]) as Warehouse[]

  type Row={name:string;gross:number;net:number;collections:number;discounts:number;expenses:number;openingDebt:number;closingDebt:number;prevNet:number;ytdNet:number;stockQty:number;stockValue:number}
  const rows=new Map<string,Row>()
  for(const d of current){
    const id=d.branch_id??''
    const r=rows.get(id)??{name:d.branch_name??'-',gross:0,net:0,collections:0,discounts:0,expenses:0,openingDebt:0,closingDebt:0,prevNet:0,ytdNet:0,stockQty:0,stockValue:0}
    if(r.gross===0 && r.net===0 && r.collections===0) r.openingDebt=n(d.opening_receivables)
    r.gross+=n(d.gross_sales); r.net+=n(d.net_sales); r.collections+=n(d.collections); r.discounts+=n(d.discounts); r.expenses+=n(d.expenses)
    r.closingDebt=n(d.closing_receivables)
    rows.set(id,r)
  }
  for(const d of previous){ const id=d.branch_id??''; const r=rows.get(id); if(r) r.prevNet+=n(d.net_sales) }
  for(const d of ytd){ const id=d.branch_id??''; const r=rows.get(id); if(r) r.ytdNet+=n(d.net_sales) }
  for(const w of warehouse){ const r=rows.get(w.branch_id); if(r){r.stockQty=n(w.closing_qty);r.stockValue=n(w.closing_value)} }

  const total=[...rows.values()].reduce((a,r)=>({net:a.net+r.net,collections:a.collections+r.collections,expenses:a.expenses+r.expenses,stock:a.stock+r.stockValue}),{net:0,collections:0,expenses:0,stock:0})

  return <AppShell title="مقارنة الفروع التنفيذية" subtitle="مبيعات، تحصيل، مديونية، مصروفات، مخزون، مقارنة شهرية وYTD من النسخ المعتمدة فقط">
    <form className="card filters" method="get">
      <div className="field"><label>من</label><input type="date" name="from" defaultValue={from}/></div>
      <div className="field"><label>إلى</label><input type="date" name="to" defaultValue={to}/></div>
      <div className="field filter-action"><label>&nbsp;</label><button className="btn" type="submit">تطبيق</button></div>
    </form>
    <section className="grid portal-kpis">
      <div className="card"><div className="kpi-label">صافي المبيعات</div><div className="kpi-value">{money(total.net)}</div></div>
      <div className="card"><div className="kpi-label">التحصيل</div><div className="kpi-value">{money(total.collections)}</div></div>
      <div className="card"><div className="kpi-label">المصروفات</div><div className="kpi-value">{money(total.expenses)}</div><div className="muted">{pct(total.net?total.expenses/total.net:0)} من البيع</div></div>
      <div className="card"><div className="kpi-label">قيمة المخزون</div><div className="kpi-value">{money(total.stock)}</div></div>
    </section>
    <section className="card">
      <div className="section-head"><h2>مقارنة الفروع</h2><span className="muted">الشهر السابق: {prevFrom} → {prevTo}</span></div>
      <div className="table-wrap"><table>
        <thead><tr><th>الفرع</th><th>قبل الخصم</th><th>الخصم</th><th>نسبة الخصم</th><th>صافي البيع</th><th>التحصيل</th><th>مديونية أول</th><th>مديونية آخر</th><th>الشهر السابق</th><th>التغير</th><th>YTD</th><th>المصروفات</th><th>نسبة المصروف</th><th>مخزون كمية</th><th>مخزون قيمة</th></tr></thead>
        <tbody>{[...rows.entries()].map(([id,r])=><tr key={id}>
          <td><Link className="row-link" href={`/?branch=${id}&from=${from}&to=${to}`}>{r.name}</Link></td>
          <td>{money(r.gross)}</td><td>{money(r.discounts)}</td><td>{pct(r.gross?r.discounts/r.gross:0)}</td>
          <td>{money(r.net)}</td><td>{money(r.collections)}</td><td>{money(r.openingDebt)}</td><td>{money(r.closingDebt)}</td>
          <td>{money(r.prevNet)}</td><td>{pct(r.prevNet?(r.net-r.prevNet)/Math.abs(r.prevNet):0)}</td><td>{money(r.ytdNet)}</td>
          <td>{money(r.expenses)}</td><td>{pct(r.net?r.expenses/r.net:0)}</td><td>{num(r.stockQty,2)}</td><td>{money(r.stockValue)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </AppShell>
}
