import {supabase} from '../lib/supabase'
import {fetchAllPages} from './pagination'

export async function getImportHistory(branchId?:string){
 return fetchAllPages<any>((from,to)=>{let q=supabase.from('import_batches').select('id,branch_id,file_name,period_start,period_end,status,version,uploaded_at,validated_at,approved_at,metadata').order('uploaded_at',{ascending:false});if(branchId)q=q.eq('branch_id',branchId);return q.range(from,to)})
}

export async function uploadBranchWorkbook(input:{branchId:string;month:string;file:File;historyMode:string;onProgress?:(x:string)=>void}){
 const [y,m]=input.month.split('-').map(Number)
 const periodStart=input.month+'-01',periodEnd=input.month+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0')
 input.onProgress?.('قراءة الملف')
 const parser:any=await import(/* @vite-ignore */ '/AMMCO/workbook-parser.js')
 const parsed=await parser.parseWorkbookBrowser(input.file,{periodStart,periodEnd})
 const {data:{session}}=await supabase.auth.getSession()
 if(!session)throw new Error('انتهت جلسة الدخول')
 input.onProgress?.('رفع الملف')
 const fd=new FormData();fd.set('branch_id',input.branchId);fd.set('period_start',periodStart);fd.set('period_end',periodEnd);fd.set('file',input.file)
 let res=await fetch(import.meta.env.VITE_SUPABASE_URL+'/functions/v1/ammco-import-upload',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},body:fd})
 const uploaded=await res.json();if(!res.ok)throw new Error(uploaded.error||'تعذر رفع الملف')
 input.onProgress?.('تحليل البيانات')
 res=await fetch(import.meta.env.VITE_SUPABASE_URL+'/functions/v1/ammco-import-process',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({batchId:uploaded.batchId,parsed,historyMode:input.historyMode})})
 const processed=await res.json();if(!res.ok)throw new Error(processed.error||'تعذر تحليل الملف')
 return {uploaded,processed}
}

export async function approveImport(batchId:string){
 const {data,error}=await supabase.rpc('approve_import_batch',{p_batch_id:batchId})
 if(error)throw error
 return data
}
