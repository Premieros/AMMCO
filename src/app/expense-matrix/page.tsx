import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'

export const dynamic='force-dynamic'
type Expense={id:number;branch_id:string;branch_name:string;canonical_category:string|null;expense_group:string|null;amount:number;entry_date:string}
type Sale={branch_id:string|null;branch_name:string|null;net_sales:number|null}
function n(v:unknown){return Number(v??0)}
function money(v:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'EGP',maximumFractionDigits:0}).format(v)}
function pct(v:number){return `${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(v*100)}%`}

export default async function ExpenseMatrix({searchParams}:{searchParams:Promise<{branch?:string;from?:string;to?:string}>}){
 const f=await searchParams; const from=f.from??'2026-09-01'; const to=f.to??'2026-09-30'
 const supabase=await createClient(); const {data:auth}=await supabase.auth.getClaims(); if(!auth?.claims?.sub) redirect('/login')
 let expenseQuery=supabase.from('v_expense_analysis').select('id,branch_id,branch_name,canonical_category,expense_group,amount,entry_date').gte('entry_date',from).lte('entry_date',to)
 let salesQuery=supabase.from('v_branch_daily_kpis').select('branch_id,branch_name,net_sales').gte('business_date',from).lte('business_date',to)
 if(f.branch){expenseQuery=expenseQuery.eq('branch_id',f.branch);salesQuery=salesQuery.eq('branch_id',f.branch)}
 const [{data:expensesData},{data:salesData},{data:branchesData}]=await Promise.all([
  expenseQuery,
  salesQuery,
  supabase.from('branches').select('id,name').eq('is_active',true).order('name')
 ])
 const expenses=(expensesData??[]) as Expense[]; const sales=(salesData??[]) as Sale[]; const allBranches=(branchesData??[]) as {id:string;name:string}[]; const branches=f.branch?allBranches.filter(b=>b.id===f.branch):allBranches
 const salesByBranch=new Map<string,number>(); for(const s of sales) salesByBranch.set(s.branch_id??'',(salesByBranch.get(s.branch_id??'')??0)+n(s.net_sales))
 const matrix=new Map<string,Map<string,number>>()
 for(const e of expenses){const cat=e.canonical_category||e.expense_group||'غير مصنف';const row=matrix.get(cat)??new Map<string,number>();row.set(e.branch_id,(row.get(e.branch_id)??0)+n(e.amount));matrix.set(cat,row)}
 const branchTotals=new Map<string,number>(); for(const e of expenses) branchTotals.set(e.branch_id,(branchTotals.get(e.branch_id)??0)+n(e.amount))
 return <AppShell title="مصفوفة المصروفات" subtitle="بند المصروف × الفرع، مع الإجمالي والنسبة من صافي المبيعات">
  <form className="card filters" method="get"><div className="field"><label>الفرع</label><select name="branch" defaultValue={f.branch??''}><option value="">كل الفروع</option>{allBranches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div className="field"><label>من</label><input type="date" name="from" defaultValue={from}/></div><div className="field"><label>إلى</label><input type="date" name="to" defaultValue={to}/></div><div className="field filter-action"><label>&nbsp;</label><button className="btn" type="submit">تطبيق</button></div></form>
  <div className="report-scope"><span className="scope-chip">الفرع: <strong>{allBranches.find(b=>b.id===f.branch)?.name??'كل الفروع'}</strong></span><span className="scope-chip">الفترة: <strong>{from} → {to}</strong></span></div>
  <section className="card"><div className="section-head"><h2>مصفوفة المصروفات حسب الفرع</h2><span className="muted">اضغط على القيمة لفتح تفاصيل المصروفات</span></div>
   <div className="table-wrap"><table><thead><tr><th>البند</th>{branches.map(b=><th key={b.id}>{b.name}</th>)}<th>إجمالي الشركة</th><th>% من مبيعات الشركة</th></tr></thead>
   <tbody>{[...matrix.entries()].sort((a,b)=>[...b[1].values()].reduce((x,y)=>x+y,0)-[...a[1].values()].reduce((x,y)=>x+y,0)).map(([cat,row])=>{
    const total=[...row.values()].reduce((a,b)=>a+b,0); const companySales=[...salesByBranch.values()].reduce((a,b)=>a+b,0)
    return <tr key={cat}><td>{cat}</td>{branches.map(b=><td key={b.id}><Link className="row-link" href={`/expenses?branch=${b.id}&from=${from}&to=${to}&search=${encodeURIComponent(cat)}`}>{money(row.get(b.id)??0)}</Link></td>)}<td>{money(total)}</td><td>{pct(companySales?total/companySales:0)}</td></tr>
   })}
   <tr><th>إجمالي الفرع</th>{branches.map(b=><th key={b.id}>{money(branchTotals.get(b.id)??0)}<div className="muted">{pct((salesByBranch.get(b.id)??0)?(branchTotals.get(b.id)??0)/(salesByBranch.get(b.id)??1):0)}</div></th>)}<th>{money(expenses.reduce((s,e)=>s+n(e.amount),0))}</th><th>-</th></tr>
   </tbody></table></div>
  </section>
 </AppShell>
}
