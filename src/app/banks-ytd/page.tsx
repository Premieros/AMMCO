import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { SmartTable } from '@/components/smart-table'
import { createClient } from '@/lib/supabase/server'

export const dynamic='force-dynamic'
type Account={id:string;branch_id:string;name:string;code:string;account_type:string}
type Entry={branch_id:string;treasury_account_id:string|null;entry_date:string;direction:string;amount:number;entry_kind:string;description:string|null}
type Daily={branch_id:string|null;branch_name:string|null;business_date:string|null;net_sales:number|null;collections:number|null;discounts:number|null;expenses:number|null;closing_receivables:number|null}
function n(v:unknown){return Number(v??0)}
function money(v:number){return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v)}
function pct(v:number){return `${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(v*100)}%`}
function bankGroup(name:string){const x=name.toLowerCase();if(x.includes('cib'))return 'CIB';if(x.includes('qnb'))return 'QNB';if(x.includes('أهلي')||x.includes('اهلي'))return 'الأهلي';if(x.includes('مصر'))return 'مصر';if(x.includes('قاهرة')||x.includes('القاهرة'))return 'القاهرة';return 'غيرها'}

export default async function BanksYtd({searchParams}:{searchParams:Promise<{branch?:string;to?:string}>}){
 const f=await searchParams,to=f.to??'2026-09-30',from=`${to.slice(0,4)}-01-01`
 const supabase=await createClient()
 const {data:auth}=await supabase.auth.getClaims()
 if(!auth?.claims?.sub)redirect('/login')

 const {data:approvedBatches}=await supabase.from('import_batches').select('id').eq('status','approved')
 const approvedIds=(approvedBatches??[]).map(b=>b.id)
 const approvedFilter=approvedIds.length?approvedIds:['00000000-0000-0000-0000-000000000000']

 let accountQuery=supabase.from('treasury_accounts').select('id,branch_id,name,code,account_type').eq('is_active',true)
 let entryQuery=supabase.from('cash_entries').select('branch_id,treasury_account_id,entry_date,direction,amount,entry_kind,description').in('batch_id',approvedFilter).gte('entry_date',from).lte('entry_date',to)
 let dailyQuery=supabase.from('v_branch_daily_kpis').select('branch_id,branch_name,business_date,net_sales,collections,discounts,expenses,closing_receivables').gte('business_date',from).lte('business_date',to).order('business_date')
 if(f.branch){accountQuery=accountQuery.eq('branch_id',f.branch);entryQuery=entryQuery.eq('branch_id',f.branch);dailyQuery=dailyQuery.eq('branch_id',f.branch)}

 const [{data:accountsData},{data:entriesData},{data:dailyData},{data:branchesData}]=await Promise.all([
  accountQuery,entryQuery,dailyQuery,supabase.from('branches').select('id,name').eq('is_active',true).order('name')
 ])
 const accounts=(accountsData??[]) as Account[],entries=(entriesData??[]) as Entry[],daily=(dailyData??[]) as Daily[]
 const bankAccounts=accounts.filter(a=>a.account_type==='bank')
 const branchNames=new Map((branchesData??[]).map(b=>[b.id,b.name] as const))
 const byId=new Map(accounts.map(a=>[a.id,a] as const))

 const bankTotals=new Map<string,{in:number;out:number;net:number}>()
 for(const e of entries){
  const a=e.treasury_account_id?byId.get(e.treasury_account_id):undefined
  if(!a||a.account_type!=='bank')continue
  const g=bankGroup(a.name)
  const r=bankTotals.get(g)??{in:0,out:0,net:0}
  if(e.direction==='in')r.in+=n(e.amount);else r.out+=n(e.amount)
  r.net=r.in-r.out;bankTotals.set(g,r)
 }

 type Y={id:string;name:string;sales:number;collections:number;discounts:number;expenses:number;closingDebt:number}
 const y=new Map<string,Y>()
 for(const d of daily){
  const id=d.branch_id??''
  const r=y.get(id)??{id,name:d.branch_name??branchNames.get(id)??'-',sales:0,collections:0,discounts:0,expenses:0,closingDebt:0}
  r.sales+=n(d.net_sales);r.collections+=n(d.collections);r.discounts+=n(d.discounts);r.expenses+=n(d.expenses);r.closingDebt=n(d.closing_receivables);y.set(id,r)
 }
 const yRows=[...y.values()]
 const totals=yRows.reduce((a,r)=>({sales:a.sales+r.sales,collections:a.collections+r.collections,discounts:a.discounts+r.discounts,expenses:a.expenses+r.expenses,debt:a.debt+r.closingDebt}),{sales:0,collections:0,discounts:0,expenses:0,debt:0})
 const bankRows=[...bankTotals.entries()].map(([bank,v])=>({bank,in:money(v.in),out:money(v.out),net:money(v.net)}))
 const accountRows=bankAccounts.map(a=>({branch_name:branchNames.get(a.branch_id)??'-',code:a.code,account:a.name}))
 const ytdTableRows=yRows.map(r=>({branch_name:r.name,net_sales:money(r.sales),discounts:money(r.discounts),collections:money(r.collections),collection_rate:pct(r.sales?r.collections/r.sales:0),closing_debt:money(r.closingDebt),expenses:money(r.expenses),expense_rate:pct(r.sales?r.expenses/r.sales:0)}))

 return <AppShell title="البنوك والتحليل التراكمي YTD" subtitle="تجميع البنوك والحسابات ومؤشرات الفروع منذ بداية السنة" breadcrumbs={[{label:'لوحة الإدارة',href:'/'},{label:'البنوك وYTD'}]}>
  <form className="card filters" method="get">
   <div className="field"><label>الفرع</label><select name="branch" defaultValue={f.branch??''}><option value="">كل الفروع</option>{(branchesData??[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
   <div className="field"><label>حتى تاريخ</label><input type="date" name="to" defaultValue={to}/></div>
   <div className="field"><label>بداية YTD</label><input value={from} disabled/></div>
   <div className="field filter-action"><label>&nbsp;</label><button className="btn">تطبيق التقرير</button></div>
  </form>
  <div className="report-scope"><span className="scope-chip">الفرع: <strong>{(branchesData??[]).find(b=>b.id===f.branch)?.name??'كل الفروع'}</strong></span><span className="scope-chip">YTD: <strong>{from} → {to}</strong></span></div>
  <section className="grid portal-kpis">
   <div className="card"><div className="kpi-label">YTD صافي المبيعات</div><div className="kpi-value">{money(totals.sales)}</div></div>
   <div className="card"><div className="kpi-label">YTD التحصيل</div><div className="kpi-value">{money(totals.collections)}</div></div>
   <div className="card"><div className="kpi-label">مديونية آخر</div><div className="kpi-value">{money(totals.debt)}</div></div>
   <div className="card"><div className="kpi-label">YTD المصروفات</div><div className="kpi-value">{money(totals.expenses)}</div></div>
  </section>

  <section className="report-sheet">
   <div className="report-sheet-head"><h2>تجميع البنوك</h2><span>CIB / QNB / الأهلي / مصر / القاهرة / غيرها</span></div>
   <div className="table-wrap"><table><thead><tr><th className="group-slate">البنك</th><th className="group-green">داخل</th><th className="group-orange">خارج</th><th className="group-blue">الصافي</th></tr></thead><tbody>
    {bankRows.length===0?<tr><td colSpan={4}>لا توجد حركات بنكية معتمدة للفترة الحالية.</td></tr>:bankRows.map(r=><tr key={r.bank}><td className="row-label">{r.bank}</td><td className="num">{r.in}</td><td className="num">{r.out}</td><td className="num"><strong>{r.net}</strong></td></tr>)}
   </tbody></table></div>
  </section>

  <div style={{marginTop:16}}><SmartTable title="YTD حسب الفرع" rows={ytdTableRows} columns={[
   {key:'branch_name',label:'الفرع'},{key:'net_sales',label:'صافي المبيعات',numeric:true},{key:'discounts',label:'الخصم',numeric:true},{key:'collections',label:'التحصيل',numeric:true},{key:'collection_rate',label:'% التحصيل'},{key:'closing_debt',label:'المديونية',numeric:true},{key:'expenses',label:'المصروفات',numeric:true},{key:'expense_rate',label:'% المصروف'}
  ]}/></div>

  <div style={{marginTop:16}}><SmartTable title="حسابات البنوك المعرفة" rows={accountRows} columns={[{key:'branch_name',label:'الفرع'},{key:'code',label:'الكود'},{key:'account',label:'الحساب'}]}/></div>
 </AppShell>
}
