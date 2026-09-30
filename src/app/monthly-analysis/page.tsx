import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { SmartTable } from '@/components/smart-table'
import { createClient } from '@/lib/supabase/server'

export const dynamic='force-dynamic'
type Daily={branch_id:string|null;branch_name:string|null;business_date:string|null;net_sales:number|null;gross_sales:number|null;discounts:number|null;collections:number|null;expenses:number|null;closing_receivables:number|null;inventory_value:number|null}
function n(v:unknown){return Number(v??0)}
function money(v:number){return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v)}
function pct(v:number){return `${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(v*100)}%`}

export default async function MonthlyAnalysis({searchParams}:{searchParams:Promise<{year?:string;branch?:string}>}){
 const f=await searchParams,year=f.year??'2026';const supabase=await createClient();const {data:auth}=await supabase.auth.getClaims();if(!auth?.claims?.sub)redirect('/login')
 let q=supabase.from('v_branch_daily_kpis').select('branch_id,branch_name,business_date,net_sales,gross_sales,discounts,collections,expenses,closing_receivables,inventory_value').gte('business_date',`${year}-01-01`).lte('business_date',`${year}-12-31`).order('business_date')
 if(f.branch)q=q.eq('branch_id',f.branch)
 const [{data},{data:branches}]=await Promise.all([q,supabase.from('branches').select('id,name').eq('is_active',true).order('name')]);const rows=(data??[]) as Daily[]
 type BranchClose={last:string;debt:number;inventory:number};type M={month:string;gross:number;net:number;discount:number;collections:number;expenses:number;branchClose:Map<string,BranchClose>}
 const map=new Map<string,M>()
 for(const d of rows){const month=(d.business_date??'').slice(0,7);if(!month)continue;const r=map.get(month)??{month,gross:0,net:0,discount:0,collections:0,expenses:0,branchClose:new Map<string,BranchClose>()};r.gross+=n(d.gross_sales);r.net+=n(d.net_sales);r.discount+=n(d.discounts);r.collections+=n(d.collections);r.expenses+=n(d.expenses);const branchId=d.branch_id??'';const previous=r.branchClose.get(branchId);if(!previous||(d.business_date??'')>=previous.last){r.branchClose.set(branchId,{last:d.business_date??'',debt:n(d.closing_receivables),inventory:n(d.inventory_value)})};map.set(month,r)}
 const items=[...map.values()].map(r=>({...r,closingDebt:[...r.branchClose.values()].reduce((s,x)=>s+x.debt,0),inventory:[...r.branchClose.values()].reduce((s,x)=>s+x.inventory,0)})).sort((a,b)=>a.month.localeCompare(b.month))
 let ytdNet=0,ytdCollections=0,ytdExpenses=0
 const tableRows=items.map(r=>{ytdNet+=r.net;ytdCollections+=r.collections;ytdExpenses+=r.expenses;return {month:r.month,gross:money(r.gross),discount:money(r.discount),discount_rate:pct(r.gross?r.discount/r.gross:0),net:money(r.net),collections:money(r.collections),expenses:money(r.expenses),expense_rate:pct(r.net?r.expenses/r.net:0),closing_debt:money(r.closingDebt),inventory:money(r.inventory),ytd_sales:money(ytdNet),ytd_collections:money(ytdCollections),ytd_expenses:money(ytdExpenses)}})
 const annual=items.reduce((a,r)=>({gross:a.gross+r.gross,net:a.net+r.net,discount:a.discount+r.discount,collections:a.collections+r.collections,expenses:a.expenses+r.expenses}),{gross:0,net:0,discount:0,collections:0,expenses:0})
 return <AppShell title="التحليل الشهري وYTD" subtitle="مقارنة شهرية احترافية مع التراكم السنوي حسب الفرع" breadcrumbs={[{label:'لوحة الإدارة',href:'/'},{label:'التحليل الشهري وYTD'}]}>
  <form className="card filters" method="get"><div className="field"><label>الفرع</label><select name="branch" defaultValue={f.branch??''}><option value="">كل الفروع</option>{(branches??[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div className="field"><label>السنة</label><input name="year" inputMode="numeric" defaultValue={year}/></div><div className="field"><label>نوع العرض</label><select disabled defaultValue="monthly"><option value="monthly">شهري + YTD</option></select></div><div className="field filter-action"><label>&nbsp;</label><button className="btn">تطبيق التقرير</button></div></form>
  <div className="report-scope"><span className="scope-chip">الفرع: <strong>{(branches??[]).find(b=>b.id===f.branch)?.name??'كل الفروع'}</strong></span><span className="scope-chip">السنة: <strong>{year}</strong></span></div>
  <section className="grid portal-kpis"><div className="card"><div className="kpi-label">YTD صافي المبيعات</div><div className="kpi-value">{money(annual.net)}</div></div><div className="card"><div className="kpi-label">YTD التحصيل</div><div className="kpi-value">{money(annual.collections)}</div></div><div className="card"><div className="kpi-label">YTD الخصومات</div><div className="kpi-value">{money(annual.discount)}</div><div className="muted">{pct(annual.gross?annual.discount/annual.gross:0)}</div></div><div className="card"><div className="kpi-label">YTD المصروفات</div><div className="kpi-value">{money(annual.expenses)}</div><div className="muted">{pct(annual.net?annual.expenses/annual.net:0)}</div></div></section>
  <div style={{marginTop:16}}><SmartTable title="المقارنة الشهرية" rows={tableRows} columns={[{key:'month',label:'الشهر'},{key:'gross',label:'قبل الخصم',numeric:true},{key:'discount',label:'الخصم',numeric:true},{key:'discount_rate',label:'% الخصم'},{key:'net',label:'صافي البيع',numeric:true},{key:'collections',label:'التحصيل',numeric:true},{key:'expenses',label:'المصروفات',numeric:true},{key:'expense_rate',label:'% المصروف'},{key:'closing_debt',label:'مديونية آخر',numeric:true},{key:'inventory',label:'مخزون آخر',numeric:true},{key:'ytd_sales',label:'YTD مبيعات',numeric:true},{key:'ytd_collections',label:'YTD تحصيل',numeric:true},{key:'ytd_expenses',label:'YTD مصروف',numeric:true}]}/></div>
 </AppShell>
}
