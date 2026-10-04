import {supabase} from '../lib/supabase'
import {fetchAllPages} from './pagination'
import {getApprovedBatchIds} from './core'
const ZERO='00000000-0000-0000-0000-000000000000'
export type InventoryRow={branchId:string;branchName:string;date:string;closingQty:number;closingValue:number;salesQty:number}
export async function getInventory(params:{from:string;to:string;branchId?:string}){
 const ids=await getApprovedBatchIds(),safe=ids.length?ids:[ZERO]
 const [rows,branches]=await Promise.all([
  fetchAllPages<any>((a,b)=>{let q=supabase.from('warehouse_daily_summary').select('branch_id,business_date,sales_qty,closing_qty,closing_value').in('batch_id',safe).gte('business_date',params.from).lte('business_date',params.to).order('business_date');if(params.branchId)q=q.eq('branch_id',params.branchId);return q.range(a,b)}),
  fetchAllPages<any>((a,b)=>supabase.from('branches').select('id,name').eq('is_active',true).range(a,b))
 ])
 const names=new Map(branches.map(x=>[x.id,x.name])),latest=new Map<string,any>(),sales=new Map<string,number>()
 for(const r of rows){sales.set(r.branch_id,(sales.get(r.branch_id)||0)+Number(r.sales_qty||0));const p=latest.get(r.branch_id);if(!p||String(r.business_date)>=String(p.business_date))latest.set(r.branch_id,r)}
 return [...latest.values()].map(r=>({branchId:r.branch_id,branchName:names.get(r.branch_id)||'—',date:r.business_date,closingQty:Number(r.closing_qty||0),closingValue:Number(r.closing_value||0),salesQty:sales.get(r.branch_id)||0})) as InventoryRow[]
}
