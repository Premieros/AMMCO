import {supabase} from '../lib/supabase'
import {fetchAllPages} from './pagination'
import type {Branch,Profile} from '../domain/types'

const ZERO='00000000-0000-0000-0000-000000000000'
let approvedIdsCache:{at:number;ids:string[]}|null=null

export async function getProfile(userId:string):Promise<Profile|null>{
 const {data,error}=await supabase.from('profiles')
  .select('user_id,full_name,role,is_active,organization_id')
  .eq('user_id',userId).maybeSingle()
 if(error)throw error
 return data as Profile|null
}

export async function getBranches():Promise<Branch[]>{
 const {data,error}=await supabase.from('branches')
  .select('id,name,code,is_active').eq('is_active',true).order('name')
 if(error)throw error
 return (data??[]) as Branch[]
}

export async function getAllowedBranchIds(userId:string,role:string):Promise<string[]>{
 if(role==='admin'||role==='analyst')return []
 const {data,error}=await supabase.from('user_branch_access').select('branch_id').eq('user_id',userId)
 if(error)throw error
 return (data??[]).map(x=>x.branch_id)
}

export async function getLatestApprovedPeriod(){
 const {data,error}=await supabase.from('import_batches')
  .select('period_start,period_end').eq('status','approved')
  .order('period_end',{ascending:false}).limit(1).maybeSingle()
 if(error)throw error
 return data??null
}

export async function getApprovedMonths(){
 const rows=await fetchAllPages<any>((from,to)=>supabase.from('import_batches')
  .select('period_start,period_end').eq('status','approved').order('period_start',{ascending:false}).range(from,to))
 return [...new Set(rows.map(x=>String(x.period_end||x.period_start).slice(0,7)).filter(Boolean))].sort((a,b)=>b.localeCompare(a))
}

export async function getApprovedBatchIds(){
 const now=Date.now()
 if(approvedIdsCache&&now-approvedIdsCache.at<60000)return approvedIdsCache.ids
 const rows=await fetchAllPages<any>((from,to)=>supabase.from('import_batches')
  .select('id').eq('status','approved').range(from,to))
 const ids=rows.map(x=>x.id as string)
 approvedIdsCache={at:now,ids}
 return ids
}

export type DashboardSummary={
 netSales:number
 grossSales:number
 discounts:number
 collections:number
 closingDebt:number
 expenses:number
 closingCash:number
 equivalentQty:number
 avgPrice:number
 branches:number
}

export async function getDashboardSummary(params:{from:string;to:string;branchId?:string}):Promise<DashboardSummary>{
 const ids=await getApprovedBatchIds()
 const safeIds=ids.length?ids:[ZERO]
 const daily=await fetchAllPages<any>((fromRow,toRow)=>{
  let q=supabase.from('v_branch_daily_kpis')
   .select('branch_id,business_date,gross_sales,net_sales,discounts,collections,closing_receivables,expenses,closing_cash')
   .gte('business_date',params.from).lte('business_date',params.to)
   .order('business_date',{ascending:true})
  if(params.branchId)q=q.eq('branch_id',params.branchId)
  return q.range(fromRow,toRow)
 })
 const cashRows=await fetchAllPages<any>((fromRow,toRow)=>{let q=supabase.from('cash_entries').select('branch_id,entry_date,id,direction,amount,running_balance').in('batch_id',safeIds).gte('entry_date',params.from).lte('entry_date',params.to).order('entry_date',{ascending:true}).order('id',{ascending:true});if(params.branchId)q=q.eq('branch_id',params.branchId);return q.range(fromRow,toRow)})
 const reps=await fetchAllPages<any>((fromRow,toRow)=>{
  let q=supabase.from('sales_rep_daily')
   .select('branch_id,business_date,raw_payload')
   .in('batch_id',safeIds).gte('business_date',params.from).lte('business_date',params.to)
  if(params.branchId)q=q.eq('branch_id',params.branchId)
  return q.range(fromRow,toRow)
 })
 let netSales=0,grossSales=0,discounts=0,collections=0,expenses=0,equivalentQty=0
 const latest=new Map<string,{date:string,debt:number,cash:number}>()
 for(const r of daily){
  netSales+=Number(r.net_sales||0);grossSales+=Number(r.gross_sales||0);discounts+=Number(r.discounts||0)
  collections+=Number(r.collections||0);expenses+=Number(r.expenses||0)
  const p=latest.get(r.branch_id)
  if(!p||String(r.business_date)>=p.date)latest.set(r.branch_id,{date:String(r.business_date),debt:Number(r.closing_receivables||0),cash:Number(r.closing_cash||0)})
 }
 for(const r of reps)equivalentQty+=Number(r.raw_payload?.equivalent_sales_qty||0)
 const closingDebt=[...latest.values()].reduce((s,x)=>s+x.debt,0)
 const cashByBranch=new Map<string,{opening:number|null,incoming:number,outgoing:number}>()
 for(const r of cashRows){
  let x=cashByBranch.get(r.branch_id)
  if(!x){x={opening:null,incoming:0,outgoing:0};cashByBranch.set(r.branch_id,x)}
  const amount=Number(r.amount||0),signed=r.direction==='in'?amount:-amount
  if(x.opening===null&&r.running_balance!==null)x.opening=Number(r.running_balance)-signed
  if(r.direction==='in')x.incoming+=amount
  if(r.direction==='out')x.outgoing+=amount
 }
 const closingCash=[...cashByBranch.values()].reduce((s,x)=>s+(x.opening===null?0:x.opening+x.incoming-x.outgoing),0)
 return {netSales,grossSales,discounts,collections,closingDebt,expenses,closingCash,equivalentQty,avgPrice:equivalentQty?netSales/equivalentQty:0,branches:latest.size}
}
