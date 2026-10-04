import {supabase} from '../lib/supabase'
import {fetchAllPages} from './pagination'
export type CashRow={id:number;branch_id:string;entry_date:string;source_code:string|null;description:string|null;category:string|null;direction:string;amount:number;running_balance:number|null;entry_kind:string|null;is_expense:boolean}
export async function getTreasury(params:{from:string;to:string;branchId?:string}){
 return fetchAllPages<CashRow>((fromRow,toRow)=>{let q=supabase.from('cash_entries').select('id,branch_id,entry_date,source_code,description,category,direction,amount,running_balance,entry_kind,is_expense').gte('entry_date',params.from).lte('entry_date',params.to).order('entry_date',{ascending:true}).order('id',{ascending:true});if(params.branchId)q=q.eq('branch_id',params.branchId);return q.range(fromRow,toRow)})
}
