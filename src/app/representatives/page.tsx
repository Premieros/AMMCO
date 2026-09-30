import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { SmartTable } from '@/components/smart-table'
import { createClient } from '@/lib/supabase/server'

export const dynamic='force-dynamic'
type Rep={branch_id:string;business_date:string;rep_name:string;opening_balance:number;sales_before_discount:number;net_after_discount:number;discounts:number;deposit_amount:number;expense_amount:number;closing_balance:number}
function n(v:unknown){return Number(v??0)}
function money(v:number){return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v)}
function pct(v:number){return `${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(v*100)}%`}

export default async function RepresentativePerformance({searchParams}:{searchParams:Promise<{branch?:string;from?:string;to?:string}>}){
 const f=await searchParams
 const from=f.from??'2026-09-01', to=f.to??'2026-09-30'
 const supabase=await createClient()
 const {data:auth}=await supabase.auth.getClaims()
 if(!auth?.claims?.sub) redirect('/login')

 const {data:approvedBatches}=await supabase.from('import_batches').select('id').eq('status','approved')
 const approvedIds=(approvedBatches??[]).map(b=>b.id)
 let q=supabase.from('sales_rep_daily').select('branch_id,business_date,rep_name,opening_balance,sales_before_discount,net_after_discount,discounts,deposit_amount,expense_amount,closing_balance').in('batch_id',approvedIds.length?approvedIds:['00000000-0000-0000-0000-000000000000']).gte('business_date',from).lte('business_date',to).order('business_date')
 if(f.branch) q=q.eq('branch_id',f.branch)

 const [{data},{data:branchesData}]=await Promise.all([q,supabase.from('branches').select('id,name').eq('is_active',true).order('name')])
 const reps=(data??[]) as Rep[]
 const branchNames=new Map((branchesData??[]).map(b=>[b.id,b.name] as const))

 type R={branchId:string;name:string;opening:number;gross:number;discount:number;net:number;deposit:number;expense:number;closing:number;first:string;last:string}
 const map=new Map<string,R>()
 for(const x of reps){
  const key=`${x.branch_id}::${x.rep_name}`
  const r=map.get(key)??{branchId:x.branch_id,name:x.rep_name,opening:n(x.opening_balance),gross:0,discount:0,net:0,deposit:0,expense:0,closing:0,first:x.business_date,last:x.business_date}
  if(x.business_date<r.first){r.first=x.business_date;r.opening=n(x.opening_balance)}
  if(x.business_date>=r.last){r.last=x.business_date;r.closing=n(x.closing_balance)}
  r.gross+=n(x.sales_before_discount);r.discount+=n(x.discounts);r.net+=n(x.net_after_discount);r.deposit+=n(x.deposit_amount);r.expense+=n(x.expense_amount)
  map.set(key,r)
 }
 const rows=[...map.values()].sort((a,b)=>b.net-a.net)
 const selectedBranchName=(branchesData??[]).find(b=>b.id===f.branch)?.name??'كل الفروع'
 const totalNet=rows.reduce((s,r)=>s+r.net,0), totalDeposit=rows.reduce((s,r)=>s+r.deposit,0), totalDiscount=rows.reduce((s,r)=>s+r.discount,0)
 const tableRows=rows.map((r,i)=>({
   href:`/drilldown/reps?branch=${r.branchId}&rep=${encodeURIComponent(r.name)}&from=${from}&to=${to}`,
   rank:i+1,
   branch_name:branchNames.get(r.branchId)??'-',
   rep_name:r.name,
   opening_receivable:money(r.opening),
   gross_sales:money(r.gross),
   discounts:money(r.discount),
   discount_rate:pct(r.gross?r.discount/r.gross:0),
   net_sales:money(r.net),
   deposits:money(r.deposit),
   rep_expense:money(r.expense),
   closing_receivable:money(r.closing),
 }))

 return <AppShell title="تقرير أداء المناديب" subtitle="مقارنة واضحة حسب الفرع والمندوب مع بحث وفرز وفلاتر واختيار أعمدة" breadcrumbs={[{label:'لوحة الإدارة',href:'/'},{label:'أداء المناديب'}]}>
  <form className="card filters" method="get">
   <div className="field"><label>الفرع</label><select name="branch" defaultValue={f.branch??''}><option value="">كل الفروع</option>{(branchesData??[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
   <div className="field"><label>من</label><input type="date" name="from" defaultValue={from}/></div>
   <div className="field"><label>إلى</label><input type="date" name="to" defaultValue={to}/></div>
   <div className="field filter-action"><label>&nbsp;</label><button className="btn" type="submit">تطبيق التقرير</button></div>
  </form>
  <div className="report-scope"><span className="scope-chip">الفرع: <strong>{selectedBranchName}</strong></span><span className="scope-chip">الفترة: <strong>{from} → {to}</strong></span><span className="scope-chip">عدد المناديب: <strong>{rows.length}</strong></span></div>
  <section className="grid portal-kpis">
   <div className="card"><div className="kpi-label">صافي مبيعات المناديب</div><div className="kpi-value">{money(totalNet)}</div></div>
   <div className="card"><div className="kpi-label">إجمالي التوريد</div><div className="kpi-value">{money(totalDeposit)}</div></div>
   <div className="card"><div className="kpi-label">إجمالي الخصومات</div><div className="kpi-value">{money(totalDiscount)}</div></div>
   <div className="card"><div className="kpi-label">نسبة التحصيل</div><div className="kpi-value">{pct(totalNet?totalDeposit/totalNet:0)}</div></div>
  </section>
  <div style={{marginTop:16}}><SmartTable title="تفاصيل أداء المناديب" rows={tableRows} rowHrefKey="href" columns={[
   {key:'rank',label:'#',numeric:true},{key:'branch_name',label:'الفرع'},{key:'rep_name',label:'المندوب'},
   {key:'opening_receivable',label:'افتتاحي المديونية',numeric:true},{key:'gross_sales',label:'قبل الخصم',numeric:true},
   {key:'discounts',label:'الخصم',numeric:true},{key:'discount_rate',label:'% الخصم'},{key:'net_sales',label:'صافي البيع',numeric:true},
   {key:'deposits',label:'التوريد',numeric:true},{key:'rep_expense',label:'مصروفات المندوب',numeric:true},{key:'closing_receivable',label:'رصيد آخر',numeric:true},
  ]}/></div>
 </AppShell>
}
