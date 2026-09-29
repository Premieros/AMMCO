import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'

export const dynamic='force-dynamic'
type Account={id:string;branch_id:string;name:string;code:string;account_type:string}
type Entry={branch_id:string;treasury_account_id:string|null;entry_date:string;direction:string;amount:number;entry_kind:string;description:string|null}
type Daily={branch_id:string|null;branch_name:string|null;business_date:string|null;net_sales:number|null;collections:number|null;discounts:number|null;expenses:number|null;closing_receivables:number|null}
function n(v:unknown){return Number(v??0)}
function money(v:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'EGP',maximumFractionDigits:0}).format(v)}
function bankGroup(name:string){const x=name.toLowerCase();if(x.includes('cib'))return 'CIB';if(x.includes('qnb'))return 'QNB';if(x.includes('أهلي')||x.includes('اهلي'))return 'الأهلي';if(x.includes('مصر'))return 'مصر';if(x.includes('قاهرة')||x.includes('القاهرة'))return 'القاهرة';return 'غيرها'}
export default async function BanksYtd({searchParams}:{searchParams:Promise<{to?:string}>}){
 const f=await searchParams,to=f.to??'2026-09-30',from=`${to.slice(0,4)}-01-01`;const supabase=await createClient();const {data:auth}=await supabase.auth.getClaims();if(!auth?.claims?.sub)redirect('/login')
 const [{data:accountsData},{data:entriesData},{data:dailyData},{data:branchesData}]=await Promise.all([
  supabase.from('treasury_accounts').select('id,branch_id,name,code,account_type').eq('is_active',true),
  supabase.from('cash_entries').select('branch_id,treasury_account_id,entry_date,direction,amount,entry_kind,description').gte('entry_date',from).lte('entry_date',to),
  supabase.from('v_branch_daily_kpis').select('branch_id,branch_name,business_date,net_sales,collections,discounts,expenses,closing_receivables').gte('business_date',from).lte('business_date',to).order('business_date'),
  supabase.from('branches').select('id,name').eq('is_active',true)
 ])
 const accounts=(accountsData??[]) as Account[],entries=(entriesData??[]) as Entry[],daily=(dailyData??[]) as Daily[];const bankAccounts=accounts.filter(a=>a.account_type==='bank');const branchNames=new Map((branchesData??[]).map(b=>[b.id,b.name] as const));const byId=new Map(accounts.map(a=>[a.id,a] as const))
 const bankTotals=new Map<string,{in:number;out:number;net:number}>();for(const e of entries){const a=e.treasury_account_id?byId.get(e.treasury_account_id):undefined;if(!a||a.account_type!=='bank')continue;const g=bankGroup(a.name);const r=bankTotals.get(g)??{in:0,out:0,net:0};if(e.direction==='in')r.in+=n(e.amount);else r.out+=n(e.amount);r.net=r.in-r.out;bankTotals.set(g,r)}
 type Y={name:string;sales:number;collections:number;discounts:number;expenses:number;closingDebt:number};const y=new Map<string,Y>();for(const d of daily){const id=d.branch_id??'';const r=y.get(id)??{name:d.branch_name??branchNames.get(id)??'-',sales:0,collections:0,discounts:0,expenses:0,closingDebt:0};r.sales+=n(d.net_sales);r.collections+=n(d.collections);r.discounts+=n(d.discounts);r.expenses+=n(d.expenses);r.closingDebt=n(d.closing_receivables);y.set(id,r)}
 return <AppShell title="البنوك والتحليل التراكمي YTD" subtitle={`من ${from} إلى ${to}`}>
  <form className="card filters" method="get"><div className="field"><label>حتى تاريخ</label><input type="date" name="to" defaultValue={to}/></div><div className="field filter-action"><label>&nbsp;</label><button className="btn">تطبيق</button></div></form>
  <section className="grid analytics-grid"><div className="card"><div className="section-head"><h2>تجميع البنوك</h2><span className="muted">CIB / QNB / الأهلي / مصر / القاهرة / غيرها</span></div><div className="table-wrap"><table><thead><tr><th>البنك</th><th>داخل</th><th>خارج</th><th>الصافي</th></tr></thead><tbody>{bankTotals.size===0?<tr><td colSpan={4}>لم يتم تعريف أو استيراد حسابات بنكية بعد.</td></tr>:[...bankTotals.entries()].map(([k,v])=><tr key={k}><td>{k}</td><td>{money(v.in)}</td><td>{money(v.out)}</td><td>{money(v.net)}</td></tr>)}</tbody></table></div></div>
  <div className="card"><div className="section-head"><h2>حسابات البنوك</h2><span className="muted">الحسابات المعرفة بالنظام</span></div><div className="table-wrap"><table><thead><tr><th>الفرع</th><th>الكود</th><th>الحساب</th></tr></thead><tbody>{bankAccounts.length===0?<tr><td colSpan={3}>لا توجد حسابات بنكية معرفة في AMMCO حاليًا.</td></tr>:bankAccounts.map(a=><tr key={a.id}><td>{branchNames.get(a.branch_id)??'-'}</td><td>{a.code}</td><td>{a.name}</td></tr>)}</tbody></table></div></div></section>
  <section className="card"><div className="section-head"><h2>YTD حسب الفرع</h2></div><div className="table-wrap"><table><thead><tr><th>الفرع</th><th>صافي المبيعات</th><th>الخصم</th><th>التحصيل</th><th>المديونية</th><th>المصروفات</th></tr></thead><tbody>{[...y.values()].map(r=><tr key={r.name}><td>{r.name}</td><td>{money(r.sales)}</td><td>{money(r.discounts)}</td><td>{money(r.collections)}</td><td>{money(r.closingDebt)}</td><td>{money(r.expenses)}</td></tr>)}</tbody></table></div></section>
 </AppShell>
}