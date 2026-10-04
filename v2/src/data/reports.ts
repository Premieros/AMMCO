import {supabase} from '../lib/supabase'
import {fetchAllPages} from './pagination'
import {getApprovedBatchIds} from './core'
const ZERO='00000000-0000-0000-0000-000000000000'
export type BranchReport={branchId:string;branchName:string;gross:number;net:number;discounts:number;collections:number;closingDebt:number;equivQty:number;avgPrice:number;expenses:number;inventoryValue:number}
export async function getBranchReport(params:{from:string;to:string;branchId?:string}){
 const ids=await getApprovedBatchIds(),safe=ids.length?ids:[ZERO]
 const [daily,reps,inv,branches]=await Promise.all([
  fetchAllPages<any>((a,b)=>{let q=supabase.from('v_branch_daily_kpis').select('branch_id,business_date,gross_sales,net_sales,discounts,collections,closing_receivables,expenses').gte('business_date',params.from).lte('business_date',params.to).order('business_date');if(params.branchId)q=q.eq('branch_id',params.branchId);return q.range(a,b)}),
  fetchAllPages<any>((a,b)=>{let q=supabase.from('sales_rep_daily').select('branch_id,raw_payload').in('batch_id',safe).gte('business_date',params.from).lte('business_date',params.to);if(params.branchId)q=q.eq('branch_id',params.branchId);return q.range(a,b)}),
  fetchAllPages<any>((a,b)=>{let q=supabase.from('warehouse_daily_summary').select('branch_id,business_date,closing_value').in('batch_id',safe).gte('business_date',params.from).lte('business_date',params.to).order('business_date');if(params.branchId)q=q.eq('branch_id',params.branchId);return q.range(a,b)}),
  fetchAllPages<any>((a,b)=>supabase.from('branches').select('id,name').eq('is_active',true).range(a,b))
 ])
 const names=new Map(branches.map(x=>[x.id,x.name]))
 const m=new Map<string,any>()
 for(const r of daily){const x=m.get(r.branch_id)||{branchId:r.branch_id,branchName:names.get(r.branch_id)||'—',gross:0,net:0,discounts:0,collections:0,closingDebt:0,lastDate:'',equivQty:0,avgPrice:0,expenses:0,inventoryValue:0,lastInv:''};x.gross+=Number(r.gross_sales||0);x.net+=Number(r.net_sales||0);x.discounts+=Number(r.discounts||0);x.collections+=Number(r.collections||0);x.expenses+=Number(r.expenses||0);if(!x.lastDate||String(r.business_date)>=x.lastDate){x.lastDate=String(r.business_date);x.closingDebt=Number(r.closing_receivables||0)}m.set(r.branch_id,x)}
 for(const r of reps){const x=m.get(r.branch_id)||{branchId:r.branch_id,branchName:names.get(r.branch_id)||'—',gross:0,net:0,discounts:0,collections:0,closingDebt:0,lastDate:'',equivQty:0,avgPrice:0,expenses:0,inventoryValue:0,lastInv:''};x.equivQty+=Number(r.raw_payload?.equivalent_sales_qty||0);m.set(r.branch_id,x)}
 for(const r of inv){const x=m.get(r.branch_id);if(x&&(!x.lastInv||String(r.business_date)>=x.lastInv)){x.lastInv=String(r.business_date);x.inventoryValue=Number(r.closing_value||0)}}
 return [...m.values()].map(x=>({...x,avgPrice:x.equivQty?x.net/x.equivQty:0})) as BranchReport[]
}
