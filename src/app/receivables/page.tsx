import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'

export const dynamic='force-dynamic'
type Daily={branch_id:string|null;branch_name:string|null;business_date:string|null;net_sales:number|null;collections:number|null;opening_receivables:number|null;closing_receivables:number|null}
function n(v:unknown){return Number(v??0)}
function money(v:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'EGP',maximumFractionDigits:0}).format(v)}
function pct(v:number){return `${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(v*100)}%`}

export default async function ReceivablesPage({searchParams}:{searchParams:Promise<{branch?:string;from?:string;to?:string}>}){
 const f=await searchParams,from=f.from??'2026-09-01',to=f.to??'2026-09-30';const supabase=await createClient();const {data:auth}=await supabase.auth.getClaims();if(!auth?.claims?.sub)redirect('/login')
 let q=supabase.from('v_branch_daily_kpis').select('branch_id,branch_name,business_date,net_sales,collections,opening_receivables,closing_receivables').gte('business_date',from).lte('business_date',to).order('business_date')
 if(f.branch)q=q.eq('branch_id',f.branch)
 const [{data},{data:branches}]=await Promise.all([q,supabase.from('branches').select('id,name').eq('is_active',true).order('name')])
 const rows=(data??[]) as Daily[]
 type R={id:string;name:string;opening:number;sales:number;collections:number;closing:number;first:string;last:string}
 const map=new Map<string,R>()
 for(const d of rows){const id=d.branch_id??'';const r=map.get(id)??{id,name:d.branch_name??'-',opening:n(d.opening_receivables),sales:0,collections:0,closing:n(d.closing_receivables),first:d.business_date??'',last:d.business_date??''};if((d.business_date??'')<r.first){r.first=d.business_date??'';r.opening=n(d.opening_receivables)};if((d.business_date??'')>=r.last){r.last=d.business_date??'';r.closing=n(d.closing_receivables)};r.sales+=n(d.net_sales);r.collections+=n(d.collections);map.set(id,r)}
 const items=[...map.values()];const totals=items.reduce((a,r)=>({opening:a.opening+r.opening,sales:a.sales+r.sales,collections:a.collections+r.collections,closing:a.closing+r.closing}),{opening:0,sales:0,collections:0,closing:0})
 return <AppShell title="المديونيات والتحصيل" subtitle="رصيد أول + صافي المبيعات - التحصيل = رصيد آخر، من النسخ المعتمدة فقط">
  <form className="card filters" method="get"><div className="field"><label>الفرع</label><select name="branch" defaultValue={f.branch??''}><option value="">كل الفروع</option>{(branches??[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div className="field"><label>من</label><input type="date" name="from" defaultValue={from}/></div><div className="field"><label>إلى</label><input type="date" name="to" defaultValue={to}/></div><div className="field filter-action"><label>&nbsp;</label><button className="btn">تطبيق</button></div></form>
  <section className="grid portal-kpis"><div className="card"><div className="kpi-label">مديونية أول</div><div className="kpi-value">{money(totals.opening)}</div></div><div className="card"><div className="kpi-label">صافي المبيعات</div><div className="kpi-value">{money(totals.sales)}</div></div><div className="card"><div className="kpi-label">التحصيل</div><div className="kpi-value">{money(totals.collections)}</div><div className="muted">{pct(totals.sales?totals.collections/totals.sales:0)} من البيع</div></div><div className="card"><div className="kpi-label">مديونية آخر</div><div className="kpi-value">{money(totals.closing)}</div></div></section>
  <section className="card"><div className="section-head"><h2>حسب الفرع</h2></div><div className="table-wrap"><table><thead><tr><th>الفرع</th><th>رصيد أول</th><th>صافي البيع</th><th>التحصيل</th><th>% التحصيل</th><th>رصيد آخر</th><th>فحص المعادلة</th></tr></thead><tbody>{items.map(r=>{const expected=r.opening+r.sales-r.collections;const diff=r.closing-expected;return <tr key={r.id}><td>{r.name}</td><td>{money(r.opening)}</td><td>{money(r.sales)}</td><td>{money(r.collections)}</td><td>{pct(r.sales?r.collections/r.sales:0)}</td><td>{money(r.closing)}</td><td>{Math.abs(diff)<0.01?'مطابق':money(diff)}</td></tr>})}</tbody></table></div></section>
 </AppShell>
}