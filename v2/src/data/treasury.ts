import {supabase} from '../lib/supabase'
import {fetchAllPages} from './pagination'
export type CashRow={id:number;branch_id:string;entry_date:string;source_code:string|null;description:string|null;category:string|null;canonical_category:string|null;expense_group:string|null;treasury_account_id:string|null;direction:string;amount:number;running_balance:number|null;entry_kind:string|null;is_expense:boolean}
export async function getTreasury(params:{from:string;to:string;branchId?:string}){
 return fetchAllPages<CashRow>((fromRow,toRow)=>{let q=supabase.from('cash_entries').select('id,branch_id,entry_date,source_code,description,category,canonical_category,expense_group,treasury_account_id,direction,amount,running_balance,entry_kind,is_expense').gte('entry_date',params.from).lte('entry_date',params.to).order('entry_date',{ascending:true}).order('id',{ascending:true});if(params.branchId)q=q.eq('branch_id',params.branchId);return q.range(fromRow,toRow)})
}

export async function updateCashEntry(input:{id:number;source_code:string;entry_date:string;description:string;category:string;inbound:number;outbound:number;running_balance:string|number;reason:string}){
 const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('انتهت جلسة الدخول')
 const res=await fetch(import.meta.env.VITE_SUPABASE_URL+'/functions/v1/ammco-admin-cash',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(input)})
 const out=await res.json();if(!res.ok)throw new Error(out.error||'تعذر حفظ التعديل');return out
}

export async function getTreasuryAuditContext(entry:CashRow){
 const [{data:accounts,error:aErr},{data:audit,error:lErr}]=await Promise.all([
  supabase.from('treasury_accounts').select('id,name,account_type').eq('branch_id',entry.branch_id).eq('is_active',true).order('name'),
  supabase.from('cash_entry_correction_log').select('*').eq('cash_entry_id',entry.id).order('changed_at',{ascending:false})
 ])
 const err=aErr||lErr
 if(err)throw err
 return {accounts:accounts??[],audit:audit??[]}
}

export async function editTreasuryAnalytics(input:{id:number;description:string;canonicalCategory:string;expenseGroup:string;treasuryAccountId:string;reason:string}){
 const {error}=await supabase.rpc('edit_cash_entry',{
  p_cash_entry_id:input.id,
  p_description:input.description,
  p_canonical_category:input.canonicalCategory,
  p_expense_group:input.expenseGroup,
  p_treasury_account_id:input.treasuryAccountId,
  p_reason:input.reason
 })
 if(error)throw error
}
