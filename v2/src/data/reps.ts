import {supabase} from '../lib/supabase'
import {fetchAllPages} from './pagination'
import {getApprovedBatchIds} from './core'

const ZERO='00000000-0000-0000-0000-000000000000'

export type RepSummary={
 branchId:string
 branchName:string
 repName:string
 grossSales:number
 discounts:number
 netSales:number
 equivalentQty:number
 avgPrice:number
 openingDebt:number
 deposits:number
 closingDebt:number
 collectionRate:number
}

export type ReceivableSummary={
 branchId:string
 branchName:string
 openingDebt:number
 netSales:number
 deposits:number
 closingDebt:number
 collectionRate:number
}

export async function getRepSummaries(params:{from:string;to:string;branchId?:string}){
 const ids=await getApprovedBatchIds()
 const safeIds=ids.length?ids:[ZERO]

 const [sales,remittances,branches]=await Promise.all([
  fetchAllPages<any>((fromRow,toRow)=>{
   let q=supabase.from('sales_rep_daily')
    .select('branch_id,business_date,rep_name,sales_before_discount,discounts,net_after_discount,raw_payload')
    .in('batch_id',safeIds).gte('business_date',params.from).lte('business_date',params.to)
    .order('business_date',{ascending:true})
   if(params.branchId)q=q.eq('branch_id',params.branchId)
   return q.range(fromRow,toRow)
  }),
  fetchAllPages<any>((fromRow,toRow)=>{
   let q=supabase.from('rep_remittance_daily')
    .select('branch_id,business_date,rep_name,opening_debt,deposit_amount,closing_debt')
    .in('batch_id',safeIds).gte('business_date',params.from).lte('business_date',params.to)
    .order('business_date',{ascending:true})
   if(params.branchId)q=q.eq('branch_id',params.branchId)
   return q.range(fromRow,toRow)
  }),
  fetchAllPages<any>((fromRow,toRow)=>{
   let q=supabase.from('branches').select('id,name').eq('is_active',true).order('name')
   if(params.branchId)q=q.eq('id',params.branchId)
   return q.range(fromRow,toRow)
  }),
 ])

 const branchMap=new Map(branches.map(b=>[b.id,b.name]))
 const byRep=new Map<string,{
  branchId:string;repName:string;gross:number;discounts:number;net:number;equiv:number;
  openingDebt:number;openingDate:string|null;deposits:number;closingDebt:number;closingDate:string|null
 }>()

 for(const r of sales){
  const key=r.branch_id+'|'+String(r.rep_name||'').trim()
  const x=byRep.get(key)??{
   branchId:r.branch_id,repName:String(r.rep_name||'').trim(),gross:0,discounts:0,net:0,equiv:0,
   openingDebt:0,openingDate:null,deposits:0,closingDebt:0,closingDate:null
  }
  x.gross+=Number(r.sales_before_discount||0)
  x.discounts+=Number(r.discounts||0)
  x.net+=Number(r.net_after_discount||0)
  x.equiv+=Number(r.raw_payload?.equivalent_sales_qty||0)
  byRep.set(key,x)
 }

 for(const r of remittances){
  const key=r.branch_id+'|'+String(r.rep_name||'').trim()
  const x=byRep.get(key)??{
   branchId:r.branch_id,repName:String(r.rep_name||'').trim(),gross:0,discounts:0,net:0,equiv:0,
   openingDebt:0,openingDate:null,deposits:0,closingDebt:0,closingDate:null
  }
  const d=String(r.business_date)
  if(!x.openingDate||d<x.openingDate){x.openingDate=d;x.openingDebt=Number(r.opening_debt||0)}
  if(!x.closingDate||d>=x.closingDate){x.closingDate=d;x.closingDebt=Number(r.closing_debt||0)}
  x.deposits+=Number(r.deposit_amount||0)
  byRep.set(key,x)
 }

 const reps:RepSummary[]=[...byRep.values()].map(x=>({
  branchId:x.branchId,
  branchName:branchMap.get(x.branchId)||'—',
  repName:x.repName||'—',
  grossSales:x.gross,
  discounts:x.discounts,
  netSales:x.net,
  equivalentQty:x.equiv,
  avgPrice:x.equiv?x.net/x.equiv:0,
  openingDebt:x.openingDebt,
  deposits:x.deposits,
  closingDebt:x.closingDebt,
  collectionRate:x.net?x.deposits/x.net:0,
 })).sort((a,b)=>a.branchName.localeCompare(b.branchName,'ar')||a.repName.localeCompare(b.repName,'ar'))

 const branchAgg=new Map<string,ReceivableSummary>()
 for(const r of reps){
  const x=branchAgg.get(r.branchId)??{
   branchId:r.branchId,branchName:r.branchName,openingDebt:0,netSales:0,deposits:0,closingDebt:0,collectionRate:0
  }
  x.openingDebt+=r.openingDebt
  x.netSales+=r.netSales
  x.deposits+=r.deposits
  x.closingDebt+=r.closingDebt
  branchAgg.set(r.branchId,x)
 }
 const receivables=[...branchAgg.values()].map(x=>({...x,collectionRate:x.netSales?x.deposits/x.netSales:0})).sort((a,b)=>a.branchName.localeCompare(b.branchName,'ar'))

 return {reps,receivables}
}
