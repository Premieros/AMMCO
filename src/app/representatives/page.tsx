import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'

export const dynamic='force-dynamic'
type Rep={branch_id:string;business_date:string;rep_name:string;opening_balance:number;sales_before_discount:number;net_after_discount:number;discounts:number;deposit_amount:number;expense_amount:number;closing_balance:number}
function n(v:unknown){return Number(v??0)}
function money(v:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'EGP',maximumFractionDigits:0}).format(v)}
function pct(v:number){return `${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(v*100)}%`}
export default async function RepresentativePerformance({searchParams}:{searchParams:Promise<{branch?:string;from?:string;to?:string}>}){
 const f=await searchParams; const from=f.from??'2026-09-01'; const to=f.to??'2026-09-30'; const supabase=await createClient(); const {data:auth}=await supabase.auth.getClaims(); if(!auth?.claims?.sub) redirect('/login')
 let q=supabase.from('sales_rep_daily').select('branch_id,business_date,rep_name,opening_balance,sales_before_discount,net_after_discount,discounts,deposit_amount,expense_amount,closing_balance').gte('business_date',from).lte('business_date',to).order('business_date')
 if(f.branch)q=q.eq('branch_id',f.branch)
 const [{data},{data:branchesData}]=await Promise.all([q,supabase.from('branches').select('id,name').eq('is_active',true).order('name')])
 const reps=(data??[]) as Rep[]; const branchNames=new Map((branchesData??[]).map(b=>[b.id,b.name] as const))
 type R={branchId:string;name:string;opening:number;gross:number;discount:number;net:number;deposit:number;expense:number;closing:number;first:string;last:string}
 const map=new Map<string,R>()
 for(const x of reps){const key=`${x.branch_id}::${x.rep_name}`;const r=map.get(key)??{branchId:x.branch_id,name:x.rep_name,opening:n(x.opening_balance),gross:0,discount:0,net:0,deposit:0,expense:0,closing:0,first:x.business_date,last:x.business_date}; if(x.business_date<r.first){r.first=x.business_date;r.opening=n(x.opening_balance)}; if(x.business_date>=r.last){r.last=x.business_date;r.closing=n(x.closing_balance)};r.gross+=n(x.sales_before_discount);r.discount+=n(x.discounts);r.net+=n(x.net_after_discount);r.deposit+=n(x.deposit_amount);r.expense+=n(x.expense_amount);map.set(key,r)}
 const rows=[...map.values()].sort((a,b)=>b.net-a.net)
 return <AppShell title="أداء المناديب" subtitle="افتتاحي، بيع قبل الخصم، الخصم، الصافي، التوريد، المصروفات، ورصيد آخر">
  <form className="card filters" method="get"><div className="field"><label>الفرع</label><select name="branch" defaultValue={f.branch??''}><option value="">كل الفروع</option>{(branchesData??[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div className="field"><label>من</label><input type="date" name="from" defaultValue={from}/></div><div className="field"><label>إلى</label><input type="date" name="to" defaultValue={to}/></div><div className="field filter-action"><label>&nbsp;</label><button className="btn" type="submit">تطبيق</button></div></form>
  <section className="card"><div className="section-head"><h2>جدول الأداء</h2><span className="muted">الترتيب الافتراضي حسب صافي البيع</span></div><div className="table-wrap"><table>
   <thead><tr><th>#</th><th>الفرع</th><th>المندوب</th><th>افتتاحي المديونية</th><th>قبل الخصم</th><th>الخصم</th><th>% الخصم</th><th>صافي البيع</th><th>التوريد</th><th>مصروفات المندوب</th><th>رصيد آخر</th></tr></thead>
   <tbody>{rows.map((r,i)=><tr key={`${r.branchId}-${r.name}`}><td>{i+1}</td><td>{branchNames.get(r.branchId)??'-'}</td><td><Link className="row-link" href={`/drilldown/reps?branch=${r.branchId}&rep=${encodeURIComponent(r.name)}&from=${from}&to=${to}`}>{r.name}</Link></td><td>{money(r.opening)}</td><td>{money(r.gross)}</td><td>{money(r.discount)}</td><td>{pct(r.gross?r.discount/r.gross:0)}</td><td>{money(r.net)}</td><td>{money(r.deposit)}</td><td>{money(r.expense)}</td><td>{money(r.closing)}</td></tr>)}</tbody>
  </table></div></section>
 </AppShell>
}
