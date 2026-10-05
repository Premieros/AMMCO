import {supabase} from '../lib/supabase'
import {fetchAllPages} from './pagination'
import {getApprovedBatchIds} from './core'
const ZERO='00000000-0000-0000-0000-000000000000'

export type InventoryRow={
 branchId:string;branchName:string;firstDate:string;lastDate:string;
 openingQty:number;openingValue:number;
 incomingFactoryQty:number;incomingFactoryValue:number;
 incomingBranchesQty:number;incomingBranchesValue:number;
 salesQty:number;salesValue:number;
 bonusQty:number;bonusValue:number;
 giftsQty:number;giftsValue:number;
 damagesQty:number;damagesValue:number;
 returnFactoryQty:number;returnFactoryValue:number;
 outgoingBranchesQty:number;outgoingBranchesValue:number;
 adjustmentQty:number;adjustmentValue:number;
 closingQty:number;closingValue:number;
}

export async function getInventory(params:{from:string;to:string;branchId?:string}){
 const ids=await getApprovedBatchIds(),safe=ids.length?ids:[ZERO]
 const [rows,branches]=await Promise.all([
  fetchAllPages<any>((a,b)=>{let q=supabase.from('warehouse_daily_summary').select('branch_id,business_date,opening_qty,opening_value,incoming_factory_qty,incoming_factory_value,incoming_branches_qty,incoming_branches_value,sales_qty,sales_value,bonus_qty,bonus_value,gifts_qty,gifts_value,damages_qty,damages_value,return_factory_qty,return_factory_value,outgoing_branches_qty,outgoing_branches_value,adjustment_qty,adjustment_value,closing_qty,closing_value').in('batch_id',safe).gte('business_date',params.from).lte('business_date',params.to).order('business_date');if(params.branchId)q=q.eq('branch_id',params.branchId);return q.range(a,b)}),
  fetchAllPages<any>((a,b)=>supabase.from('branches').select('id,name').eq('is_active',true).range(a,b))
 ])
 const names=new Map(branches.map(x=>[x.id,x.name])),by=new Map<string,InventoryRow>()
 for(const r of rows){
  let x=by.get(r.branch_id)
  if(!x){
   x={branchId:r.branch_id,branchName:names.get(r.branch_id)||'—',firstDate:r.business_date,lastDate:r.business_date,openingQty:Number(r.opening_qty||0),openingValue:Number(r.opening_value||0),incomingFactoryQty:0,incomingFactoryValue:0,incomingBranchesQty:0,incomingBranchesValue:0,salesQty:0,salesValue:0,bonusQty:0,bonusValue:0,giftsQty:0,giftsValue:0,damagesQty:0,damagesValue:0,returnFactoryQty:0,returnFactoryValue:0,outgoingBranchesQty:0,outgoingBranchesValue:0,adjustmentQty:0,adjustmentValue:0,closingQty:Number(r.closing_qty||0),closingValue:Number(r.closing_value||0)}
   by.set(r.branch_id,x)
  }
  if(String(r.business_date)<x.firstDate){x.firstDate=r.business_date;x.openingQty=Number(r.opening_qty||0);x.openingValue=Number(r.opening_value||0)}
  if(String(r.business_date)>=x.lastDate){x.lastDate=r.business_date;x.closingQty=Number(r.closing_qty||0);x.closingValue=Number(r.closing_value||0)}
  x.incomingFactoryQty+=Number(r.incoming_factory_qty||0);x.incomingFactoryValue+=Number(r.incoming_factory_value||0)
  x.incomingBranchesQty+=Number(r.incoming_branches_qty||0);x.incomingBranchesValue+=Number(r.incoming_branches_value||0)
  x.salesQty+=Number(r.sales_qty||0);x.salesValue+=Number(r.sales_value||0)
  x.bonusQty+=Number(r.bonus_qty||0);x.bonusValue+=Number(r.bonus_value||0)
  x.giftsQty+=Number(r.gifts_qty||0);x.giftsValue+=Number(r.gifts_value||0)
  x.damagesQty+=Number(r.damages_qty||0);x.damagesValue+=Number(r.damages_value||0)
  x.returnFactoryQty+=Number(r.return_factory_qty||0);x.returnFactoryValue+=Number(r.return_factory_value||0)
  x.outgoingBranchesQty+=Number(r.outgoing_branches_qty||0);x.outgoingBranchesValue+=Number(r.outgoing_branches_value||0)
  x.adjustmentQty+=Number(r.adjustment_qty||0);x.adjustmentValue+=Number(r.adjustment_value||0)
 }
 return [...by.values()].sort((a,b)=>a.branchName.localeCompare(b.branchName,'ar'))
}
