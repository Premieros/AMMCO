import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'

export const dynamic='force-dynamic'
type Daily={branch_id:string|null;branch_name:string|null;business_date:string|null;net_sales:number|null;gross_sales:number|null;discounts:number|null;collections:number|null;expenses:number|null;closing_receivables:number|null;inventory_value:number|null}
function n(v:unknown){return Number(v??0)}
function money(v:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'EGP',maximumFractionDigits:0}).format(v)}
function pct(v:number){return `${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(v*100)}%`}

export default async function MonthlyAnalysis({searchParams}:{searchParams:Promise<{year?:string;branch?:string}>}){
 const f=await searchParams,year=f.year??'2026';const supabase=await createClient();const {data:auth}=await supabase.auth.getClaims();if(!auth?.claims?.sub)redirect('/login')
 let q=supabase.from('v_branch_daily_kpis').select('branch_id,branch_name,business_date,net_sales,gross_sales,discounts,collections,expenses,closing_receivables,inventory_value').gte('business_date',`${year}-01-01`).lte('business_date',`${year}-12-31`).order('business_date')
 if(f.branch)q=q.eq('branch_id',f.branch)
 const [{data},{data:branches}]=await Promise.all([q,supabase.from('branches').select('id,name').eq('is_active',true).order('name')]);const rows=(data??[]) as Daily[]
 type BranchClose={last:string;debt:number;inventory:number};type M={month:string;gross:number;net:number;discount:number;collections:number;expenses:number;branchClose:Map<string,BranchClose>}
 const map=new Map<string,M>()
 for(const d of rows){const month=(d.business_date??'').slice(0,7);if(!month)continue;const r=map.get(month)??{month,gross:0,net:0,discount:0,collections:0,expenses:0,branchClose:new Map<string,BranchClose>()};r.gross+=n(d.gross_sales);r.net+=n(d.net_sales);r.discount+=n(d.discounts);r.collections+=n(d.collections);r.expenses+=n(d.expenses);const branchId=d.branch_id??'';const previous=r.branchClose.get(branchId);if(!previous||(d.business_date??'')>=previous.last){r.branchClose.set(branchId,{last:d.business_date??'',debt:n(d.closing_receivables),inventory:n(d.inventory_value)})};map.set(month,r)}
 const items=[...map.values()].map(r=>({...r,closingDebt:[...r.branchClose.values()].reduce((s,x)=>s+x.debt,0),inventory:[...r.branchClose.values()].reduce((s,x)=>s+x.inventory,0)})).sort((a,b)=>a.month.localeCompare(b.month));let ytdNet=0,ytdCollections=0,ytdExpenses=0
 return <AppShell title="التحليل الشهري وYTD" subtitle="مقارنة الشهور والتراكم السنوي من البيانات المعتمدة">
  <form className="card filters" method="get"><div className="field"><label>السنة</label><input name="year" inputMode="numeric" defaultValue={year}/></div><div className="field"><label>الفرع</label><select name="branch" defaultValue={f.branch??''}><option value="">كل الفروع</option>{(branches??[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div className="field filter-action"><label>&nbsp;</label><button className="btn">تطبيق</button></div></form>
  <section className="card"><div className="section-head"><h2>الشهور</h2></div><div className="table-wrap"><table><thead><tr><th>الشهر</th><th>قبل الخصم</th><th>الخصم</th><th>% الخصم</th><th>صافي البيع</th><th>التحصيل</th><th>المصروفات</th><th>% المصروف</th><th>مديونية آخر</th><th>مخزون آخر</th><th>YTD مبيعات</th><th>YTD تحصيل</th><th>YTD مصروف</th></tr></thead><tbody>{items.map(r=>{ytdNet+=r.net;ytdCollections+=r.collections;ytdExpenses+=r.expenses;return <tr key={r.month}><td>{r.month}</td><td>{money(r.gross)}</td><td>{money(r.discount)}</td><td>{pct(r.gross?r.discount/r.gross:0)}</td><td>{money(r.net)}</td><td>{money(r.collections)}</td><td>{money(r.expenses)}</td><td>{pct(r.net?r.expenses/r.net:0)}</td><td>{money(r.closingDebt)}</td><td>{money(r.inventory)}</td><td>{money(ytdNet)}</td><td>{money(ytdCollections)}</td><td>{money(ytdExpenses)}</td></tr>})}</tbody></table></div></section>
 </AppShell>
}