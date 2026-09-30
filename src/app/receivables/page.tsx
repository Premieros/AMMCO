import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { SmartTable } from '@/components/smart-table'
import { createClient } from '@/lib/supabase/server'

export const dynamic='force-dynamic'
type Daily={branch_id:string|null;branch_name:string|null;business_date:string|null;net_sales:number|null;collections:number|null;opening_receivables:number|null;closing_receivables:number|null}
function n(v:unknown){return Number(v??0)}
function money(v:number){return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v)}
function pct(v:number){return `${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(v*100)}%`}

export default async function ReceivablesPage({searchParams}:{searchParams:Promise<{branch?:string;from?:string;to?:string}>}){
 const f=await searchParams,from=f.from??'2026-09-01',to=f.to??'2026-09-30'
 const supabase=await createClient();const {data:auth}=await supabase.auth.getClaims();if(!auth?.claims?.sub)redirect('/login')
 let q=supabase.from('v_branch_daily_kpis').select('branch_id,branch_name,business_date,net_sales,collections,opening_receivables,closing_receivables').gte('business_date',from).lte('business_date',to).order('business_date')
 if(f.branch)q=q.eq('branch_id',f.branch)
 const [{data},{data:branches}]=await Promise.all([q,supabase.from('branches').select('id,name').eq('is_active',true).order('name')])
 const rows=(data??[]) as Daily[]
 type R={id:string;name:string;opening:number;sales:number;collections:number;closing:number;first:string;last:string}
 const map=new Map<string,R>()
 for(const d of rows){const id=d.branch_id??'';const r=map.get(id)??{id,name:d.branch_name??'-',opening:n(d.opening_receivables),sales:0,collections:0,closing:n(d.closing_receivables),first:d.business_date??'',last:d.business_date??''};if((d.business_date??'')<r.first){r.first=d.business_date??'';r.opening=n(d.opening_receivables)};if((d.business_date??'')>=r.last){r.last=d.business_date??'';r.closing=n(d.closing_receivables)};r.sales+=n(d.net_sales);r.collections+=n(d.collections);map.set(id,r)}
 const items=[...map.values()]
 const totals=items.reduce((a,r)=>({opening:a.opening+r.opening,sales:a.sales+r.sales,collections:a.collections+r.collections,closing:a.closing+r.closing}),{opening:0,sales:0,collections:0,closing:0})
 const tableRows=items.map(r=>{const expected=r.opening+r.sales-r.collections;const diff=r.closing-expected;return {branch_name:r.name,opening:money(r.opening),sales:money(r.sales),collections:money(r.collections),collection_rate:pct(r.sales?r.collections/r.sales:0),closing:money(r.closing),reconciliation:Math.abs(diff)<0.01?'مطابق':money(diff)}})
 return <AppShell title="تقرير المديونيات والتحصيل" subtitle="افتتاحي + صافي البيع - التحصيل = رصيد آخر، مع مقارنة واضحة بين الفروع" breadcrumbs={[{label:'لوحة الإدارة',href:'/'},{label:'المديونيات والتحصيل'}]}>
  <form className="card filters" method="get"><div className="field"><label>الفرع</label><select name="branch" defaultValue={f.branch??''}><option value="">كل الفروع</option>{(branches??[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div className="field"><label>من</label><input type="date" name="from" defaultValue={from}/></div><div className="field"><label>إلى</label><input type="date" name="to" defaultValue={to}/></div><div className="field filter-action"><label>&nbsp;</label><button className="btn">تطبيق التقرير</button></div></form>
  <div className="report-scope"><span className="scope-chip">الفرع: <strong>{(branches??[]).find(b=>b.id===f.branch)?.name??'كل الفروع'}</strong></span><span className="scope-chip">الفترة: <strong>{from} → {to}</strong></span></div>
  <section className="grid portal-kpis"><div className="card"><div className="kpi-label">مديونية أول</div><div className="kpi-value">{money(totals.opening)}</div></div><div className="card"><div className="kpi-label">صافي المبيعات</div><div className="kpi-value">{money(totals.sales)}</div></div><div className="card"><div className="kpi-label">التحصيل</div><div className="kpi-value">{money(totals.collections)}</div><div className="muted">{pct(totals.sales?totals.collections/totals.sales:0)} من البيع</div></div><div className="card"><div className="kpi-label">مديونية آخر</div><div className="kpi-value">{money(totals.closing)}</div></div></section>
  <div style={{marginTop:16}}><SmartTable title="المديونية حسب الفرع" rows={tableRows} columns={[{key:'branch_name',label:'الفرع'},{key:'opening',label:'رصيد أول',numeric:true},{key:'sales',label:'صافي البيع',numeric:true},{key:'collections',label:'التحصيل',numeric:true},{key:'collection_rate',label:'% التحصيل'},{key:'closing',label:'رصيد آخر',numeric:true},{key:'reconciliation',label:'فحص المعادلة'}]}/></div>
 </AppShell>
}
