import {supabase} from '../lib/supabase'
import {fetchAllPages} from './pagination'

async function authedPost(path:string,body:any){
 const {data:{session}}=await supabase.auth.getSession()
 if(!session)throw new Error('انتهت جلسة الدخول')
 const res=await fetch(import.meta.env.VITE_SUPABASE_URL+path,{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)})
 const out=await res.json()
 if(!res.ok)throw new Error(out.error||'تعذر تنفيذ العملية')
 return out
}

export async function getImportHistory(branchId?:string){
 return fetchAllPages<any>((from,to)=>{
  let q=supabase.from('import_batches')
   .select('id,branch_id,original_file_name,period_start,period_end,status,version,uploaded_at,validated_at,approved_at,failure_message,metadata')
   .order('uploaded_at',{ascending:false})
  if(branchId)q=q.eq('branch_id',branchId)
  return q.range(from,to)
 })
}


export async function getImportedDays(input:{month:string;branchId?:string}){
 const [y,m]=input.month.split('-').map(Number)
 const from=input.month+'-01'
 const to=input.month+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0')
 const rows=await fetchAllPages<{branch_id:string;business_date:string;net_sales:number;collections:number}>((a,b)=>{
  let q=supabase.from('v_branch_daily_kpis')
   .select('branch_id,business_date,net_sales,collections')
   .gte('business_date',from).lte('business_date',to)
   .order('business_date',{ascending:true})
  if(input.branchId)q=q.eq('branch_id',input.branchId)
  return q.range(a,b)
 })
 return rows.filter(r=>Math.abs(Number(r.net_sales||0))>.005||Math.abs(Number(r.collections||0))>.005)
}

export async function uploadBranchWorkbook(input:{branchId:string;month:string;file:File;historyMode:string;onProgress?:(x:string)=>void}){
 const [y,m]=input.month.split('-').map(Number)
 const periodStart=input.month+'-01',periodEnd=input.month+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0')
 input.onProgress?.('قراءة الملف')
 const parserUrl='/AMMCO/workbook-parser.js'
 const parser:any=await import(/* @vite-ignore */ parserUrl)
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

export const processImport=(batchId:string,historyMode?:'append_only'|'review'|'replace')=>authedPost('/functions/v1/ammco-import-process',{batchId,...(historyMode?{historyMode}:{})})
export const deleteImport=(batchId:string)=>authedPost('/functions/v1/ammco-import-delete',{batchId})

export async function getImportReview(batchId:string){
 const [{data:issues,error:issuesError},{data:changes,error:changesError}]=await Promise.all([
  supabase.from('import_validation_issues').select('code,severity,message,sheet_name,row_number').eq('batch_id',batchId).order('severity',{ascending:true}).limit(200),
  supabase.from('import_day_changes').select('business_date,old_snapshot,new_snapshot,resolution_status').eq('batch_id',batchId).order('business_date').limit(100)
 ])
 const error=issuesError||changesError
 if(error)throw error
 return {issues:issues||[],changes:changes||[]}
}

export async function resolveReviewedImport(batchId:string,mode:'append_only'|'replace'){
 const out=await processImport(batchId,mode)
 if(out.noNewDays)return out
 if(out.status!=='validated')throw new Error('النسخة ما زالت تحتاج مراجعة')
 await approveImport(batchId)
 return out
}

export async function reuploadImport(input:{branchId:string;periodStart:string;periodEnd:string;file:File;onProgress?:(x:string)=>void}){
 input.onProgress?.('قراءة الملف')
 const parserUrl='/AMMCO/workbook-parser.js'
 const parser:any=await import(/* @vite-ignore */ parserUrl)
 const parsed=await parser.parseWorkbookBrowser(input.file,{periodStart:input.periodStart,periodEnd:input.periodEnd})
 const {data:{session}}=await supabase.auth.getSession()
 if(!session)throw new Error('انتهت جلسة الدخول')
 input.onProgress?.('رفع النسخة الجديدة')
 const fd=new FormData();fd.set('branch_id',input.branchId);fd.set('period_start',input.periodStart);fd.set('period_end',input.periodEnd);fd.set('file',input.file)
 let res=await fetch(import.meta.env.VITE_SUPABASE_URL+'/functions/v1/ammco-import-upload',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},body:fd})
 const uploaded=await res.json();if(!res.ok)throw new Error(uploaded.error||'تعذر رفع الملف')
 input.onProgress?.('تحليل النسخة')
 res=await fetch(import.meta.env.VITE_SUPABASE_URL+'/functions/v1/ammco-import-process',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({batchId:uploaded.batchId,parsed,historyMode:'review'})})
 const processed=await res.json();if(!res.ok)throw new Error(processed.error||'تعذر تحليل الملف')
 if(processed.status==='validated')await approveImport(uploaded.batchId)
 return {uploaded,processed}
}
