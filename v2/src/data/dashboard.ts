import {supabase} from '../lib/supabase'
import {fetchAllPages} from './pagination'
const ZERO='00000000-0000-0000-0000-000000000000'

export type DashboardPoint={date:string;sales:number;expenses:number;collections:number}
export type BranchPerformance={branchId:string;branchName:string;sales:number;expenses:number;collections:number;closingDebt:number;discounts:number;expenseRatio:number}
export type RepPerformance={branchId:string;repName:string;sales:number;collections:number;closingDebt:number;discounts:number}
export type DashboardAnalytics={current:{sales:number;expenses:number;collections:number;discounts:number};previous:{sales:number;expenses:number;collections:number;discounts:number};points:DashboardPoint[];branches:BranchPerformance[];reps:RepPerformance[];anomalies:string[]}

const shiftPeriod=(from:string,to:string)=>{
 const a=new Date(from+'T00:00:00Z'),b=new Date(to+'T00:00:00Z')
 const days=Math.max(1,Math.round((b.getTime()-a.getTime())/86400000)+1)
 const prevTo=new Date(a.getTime()-86400000),prevFrom=new Date(prevTo.getTime()-(days-1)*86400000)
 return {from:prevFrom.toISOString().slice(0,10),to:prevTo.toISOString().slice(0,10)}
}

export async function getDashboardAnalytics(params:{from:string;to:string;branchId?:string}):Promise<DashboardAnalytics>{
 const prev=shiftPeriod(params.from,params.to)
 const load=(from:string,to:string)=>fetchAllPages<any>((a,b)=>{
  let q=supabase.from('v_branch_daily_kpis').select('branch_id,branch_name,business_date,net_sales,expenses,collections,discounts,closing_receivables').gte('business_date',from).lte('business_date',to).order('business_date')
  if(params.branchId)q=q.eq('branch_id',params.branchId)
  return q.range(a,b)
 })
 const approvedRows=await fetchAllPages<any>((a,b)=>supabase.from('import_batches')
  .select('id').eq('status','approved')
  .lte('period_start',params.to).gte('period_end',params.from)
  .range(a,b))
 const safeIds=approvedRows.length?approvedRows.map(x=>x.id as string):[ZERO]
 const loadReps=()=>fetchAllPages<any>((a,b)=>{
  let q=supabase.from('sales_rep_daily')
   .select('branch_id,business_date,rep_name,net_after_discount,deposit_amount,closing_balance,discounts')
   .in('batch_id',safeIds).gte('business_date',params.from).lte('business_date',params.to)
   .order('business_date')
  if(params.branchId)q=q.eq('branch_id',params.branchId)
  return q.range(a,b)
 })
 const [cur,old,repRows]=await Promise.all([load(params.from,params.to),load(prev.from,prev.to),loadReps()])
 const aggregate=(rows:any[])=>rows.reduce((a,r)=>{a.sales+=Number(r.net_sales||0);a.expenses+=Number(r.expenses||0);a.collections+=Number(r.collections||0);a.discounts+=Number(r.discounts||0);return a},{sales:0,expenses:0,collections:0,discounts:0})
 const byDate=new Map<string,DashboardPoint>(),byBranch=new Map<string,any>()
 for(const r of cur){
  const p=byDate.get(r.business_date)||{date:r.business_date,sales:0,expenses:0,collections:0}
  p.sales+=Number(r.net_sales||0);p.expenses+=Number(r.expenses||0);p.collections+=Number(r.collections||0);byDate.set(r.business_date,p)
  const x=byBranch.get(r.branch_id)||{branchId:r.branch_id,branchName:r.branch_name||'—',sales:0,expenses:0,collections:0,closingDebt:0,discounts:0,last:''}
  x.sales+=Number(r.net_sales||0);x.expenses+=Number(r.expenses||0);x.collections+=Number(r.collections||0);x.discounts+=Number(r.discounts||0)
  if(!x.last||String(r.business_date)>=x.last){x.last=String(r.business_date);x.closingDebt=Number(r.closing_receivables||0)}
  byBranch.set(r.branch_id,x)
 }
 const branches=[...byBranch.values()].map(x=>({...x,expenseRatio:x.sales?x.expenses/x.sales:0})).sort((a,b)=>b.sales-a.sales)
 const byRep=new Map<string,any>()
 for(const r of repRows){
  const repName=String(r.rep_name||'').trim()||'—',key=r.branch_id+'|'+repName
  const x=byRep.get(key)||{branchId:r.branch_id,repName,sales:0,collections:0,closingDebt:0,discounts:0,last:''}
  x.sales+=Number(r.net_after_discount||0)
  x.collections+=Number(r.deposit_amount||0)
  x.discounts+=Number(r.discounts||0)
  if(!x.last||String(r.business_date)>=x.last){x.last=String(r.business_date);x.closingDebt=Number(r.closing_balance||0)}
  byRep.set(key,x)
 }
 const reps=[...byRep.values()].sort((a,b)=>b.sales-a.sales)
 const anomalies:string[]=[]
 for(const b of branches){
  if(b.expenseRatio>.12)anomalies.push('نسبة المصروفات مرتفعة في '+b.branchName+' ('+(b.expenseRatio*100).toFixed(1)+'%)')
  if(b.sales>0&&b.collections/b.sales<.7)anomalies.push('التحصيل أقل من 70% من المبيعات في '+b.branchName)
  if(b.closingDebt>b.sales*.8)anomalies.push('المديونية مرتفعة مقارنة بمبيعات الفترة في '+b.branchName)
 }
 return {current:aggregate(cur),previous:aggregate(old),points:[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)),branches,reps,anomalies:anomalies.slice(0,8)}
}
