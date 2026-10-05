import {supabase} from '../lib/supabase'
import {fetchAllPages} from './pagination'

export type SheetBatch={id:string;branch_id:string;version:number;status:string;period_start:string;period_end:string;original_file_name:string;uploaded_at:string}

export async function getBranchBatches(branchId:string){
 const {data,error}=await supabase.from('import_batches')
  .select('id,branch_id,version,status,period_start,period_end,original_file_name,uploaded_at')
  .eq('branch_id',branchId).order('uploaded_at',{ascending:false})
 if(error)throw error
 return (data??[]) as SheetBatch[]
}

export async function getBatchContents(batchId:string){
 const [inventory,reps,cash,warehouse,destinations]=await Promise.all([
  fetchAllPages<any>((a,b)=>supabase.from('inventory_daily').select('*').eq('batch_id',batchId).order('business_date').order('product_name').range(a,b)),
  fetchAllPages<any>((a,b)=>supabase.from('sales_rep_daily').select('*').eq('batch_id',batchId).order('business_date').order('rep_name').range(a,b)),
  fetchAllPages<any>((a,b)=>supabase.from('cash_entries').select('*').eq('batch_id',batchId).order('entry_date',{ascending:false}).order('id',{ascending:false}).range(a,b)),
  fetchAllPages<any>((a,b)=>supabase.from('warehouse_daily_summary').select('*').eq('batch_id',batchId).order('business_date').range(a,b)),
  fetchAllPages<any>((a,b)=>supabase.from('cash_destinations').select('id,name,destination_type').eq('is_active',true).order('name').range(a,b)),
 ])
 return {inventory,reps,cash,warehouse,destinations}
}

export async function saveBatchContents(payload:any){
 const {data:{session}}=await supabase.auth.getSession()
 if(!session)throw new Error('انتهت جلسة الدخول')
 const res=await fetch(import.meta.env.VITE_SUPABASE_URL+'/functions/v1/ammco-admin-branch-sheets',{
  method:'POST',
  headers:{Authorization:'Bearer '+session.access_token,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},
  body:JSON.stringify(payload)
 })
 const out=await res.json()
 if(!res.ok)throw new Error(out.error||'تعذر حفظ تعديلات الشيت')
 return out
}
