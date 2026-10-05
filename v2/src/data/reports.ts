import {supabase} from '../lib/supabase'
import {fetchAllPages} from './pagination'
import {getApprovedBatchIds} from './core'
const ZERO='00000000-0000-0000-0000-000000000000'

export type BranchReport={
 branchId:string;branchName:string;
 openingDebt:number;gross:number;net:number;discounts:number;discountRate:number;collections:number;
 monthDebt:number;closingDebt:number;equivQty:number;avgPrice:number;
 expenses:number;expenseRate:number;fuel:number;petro:number;maintenance:number;
 inventoryQty:number;inventoryValue:number;closingCash:number
}

export async function getBranchReport(params:{from:string;to:string;branchId?:string}){
 const ids=await getApprovedBatchIds(),safe=ids.length?ids:[ZERO]
 const [daily,reps,warehouse,expenses,remittances,branches]=await Promise.all([
  fetchAllPages<any>((a,b)=>{let q=supabase.from('v_branch_daily_kpis').select('branch_id,business_date,gross_sales,net_sales,discounts,collections,closing_receivables,expenses,closing_cash').gte('business_date',params.from).lte('business_date',params.to).order('business_date');if(params.branchId)q=q.eq('branch_id',params.branchId);return q.range(a,b)}),
  fetchAllPages<any>((a,b)=>{let q=supabase.from('sales_rep_daily').select('branch_id,raw_payload').in('batch_id',safe).gte('business_date',params.from).lte('business_date',params.to);if(params.branchId)q=q.eq('branch_id',params.branchId);return q.range(a,b)}),
  fetchAllPages<any>((a,b)=>{let q=supabase.from('warehouse_daily_summary').select('branch_id,business_date,closing_qty,closing_value').in('batch_id',safe).gte('business_date',params.from).lte('business_date',params.to).order('business_date');if(params.branchId)q=q.eq('branch_id',params.branchId);return q.range(a,b)}),
  fetchAllPages<any>((a,b)=>{let q=supabase.from('v_expense_analysis').select('branch_id,canonical_category,expense_group,amount').gte('entry_date',params.from).lte('entry_date',params.to);if(params.branchId)q=q.eq('branch_id',params.branchId);return q.range(a,b)}),
  fetchAllPages<any>((a,b)=>{let q=supabase.from('rep_remittance_daily').select('branch_id,business_date,rep_name,opening_debt').in('batch_id',safe).gte('business_date',params.from).lte('business_date',params.to).order('business_date');if(params.branchId)q=q.eq('branch_id',params.branchId);return q.range(a,b)}),
  fetchAllPages<any>((a,b)=>supabase.from('branches').select('id,name').eq('is_active',true).range(a,b))
 ])
 const names=new Map(branches.map(x=>[x.id,x.name]))
 const by=new Map<string,any>()
 const make=(id:string)=>({branchId:id,branchName:names.get(id)||'—',openingDebt:0,gross:0,net:0,discounts:0,collections:0,closingDebt:0,lastDate:'',equivQty:0,expenses:0,inventoryQty:0,inventoryValue:0,lastInv:'',closingCash:0,fuel:0,petro:0,maintenance:0})
 for(const r of daily){
  const x=by.get(r.branch_id)||make(r.branch_id)
  x.gross+=Number(r.gross_sales||0);x.net+=Number(r.net_sales||0);x.discounts+=Number(r.discounts||0);x.collections+=Number(r.collections||0);x.expenses+=Number(r.expenses||0)
  if(!x.lastDate||String(r.business_date)>=x.lastDate){x.lastDate=String(r.business_date);x.closingDebt=Number(r.closing_receivables||0);x.closingCash=Number(r.closing_cash||0)}
  by.set(r.branch_id,x)
 }
 for(const r of reps){const x=by.get(r.branch_id)||make(r.branch_id);x.equivQty+=Number(r.raw_payload?.equivalent_sales_qty||0);by.set(r.branch_id,x)}
 for(const r of warehouse){const x=by.get(r.branch_id)||make(r.branch_id);if(!x.lastInv||String(r.business_date)>=x.lastInv){x.lastInv=String(r.business_date);x.inventoryQty=Number(r.closing_qty||0);x.inventoryValue=Number(r.closing_value||0)}by.set(r.branch_id,x)}
 for(const r of expenses){const x=by.get(r.branch_id)||make(r.branch_id),t=((r.canonical_category||'')+' '+(r.expense_group||'')).toLowerCase(),v=Number(r.amount||0);if(/سولار|وقود|fuel/.test(t))x.fuel+=v;if(/بترو|petro/.test(t))x.petro+=v;if(/صيان|maintenance/.test(t))x.maintenance+=v;by.set(r.branch_id,x)}
 const seen=new Set<string>()
 for(const r of remittances){const repKey=r.branch_id+'|'+String(r.rep_name||'').trim();if(seen.has(repKey))continue;seen.add(repKey);const x=by.get(r.branch_id)||make(r.branch_id);x.openingDebt+=Number(r.opening_debt||0);by.set(r.branch_id,x)}
 return [...by.values()].map(x=>({
  branchId:x.branchId,branchName:x.branchName,openingDebt:x.openingDebt,gross:x.gross,net:x.net,discounts:x.discounts,discountRate:x.gross?x.discounts/x.gross:0,collections:x.collections,monthDebt:x.net-x.collections,closingDebt:x.closingDebt,equivQty:x.equivQty,avgPrice:x.equivQty?x.net/x.equivQty:0,expenses:x.expenses,expenseRate:x.net?x.expenses/x.net:0,fuel:x.fuel,petro:x.petro,maintenance:x.maintenance,inventoryQty:x.inventoryQty,inventoryValue:x.inventoryValue,closingCash:x.closingCash
 })).sort((a,b)=>b.net-a.net) as BranchReport[]
}
