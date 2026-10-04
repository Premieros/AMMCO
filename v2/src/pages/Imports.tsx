import {FormEvent,useEffect,useMemo,useState} from 'react'
import type {Branch} from '../domain/types'
import {approveImport,getImportHistory,uploadBranchWorkbook} from '../data/imports'
import {DataTable} from '../components/DataTable'

export function Imports({month,branchId,branches,isAdmin}:{month:string;branchId?:string;branches:Branch[];isAdmin:boolean}){
 const [rows,setRows]=useState<any[]>([]),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false)
 const map=useMemo(()=>new Map(branches.map(b=>[b.id,b.name])),[branches])
 const load=()=>getImportHistory(branchId).then(setRows).catch(e=>setMsg(e.message||String(e)))
 useEffect(load,[branchId])
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const f=new FormData(e.currentTarget),file=f.get('file')
  if(!(file instanceof File)||!file.size)return
  try{setBusy(true);const out=await uploadBranchWorkbook({branchId:String(f.get('branch_id')),month:String(f.get('month')),file,historyMode:String(f.get('historyMode')||'append_only'),onProgress:setMsg});setMsg(out.processed.status==='validated'?'تم الرفع والتحليل — جاهز للاعتماد':'تم الرفع ويحتاج مراجعة');(e.currentTarget as HTMLFormElement).reset();load()}catch(x:any){setMsg(x.message||String(x))}finally{setBusy(false)}
 }
 async function approve(id:string){try{setMsg('جاري الاعتماد…');await approveImport(id);setMsg('تم اعتماد الشيت');load()}catch(x:any){setMsg(x.message||String(x))}}
 return <div>{isAdmin&&<section className="panel"><h2>رفع شيت فرع</h2><form className="upload-form" onSubmit={submit}><label>الفرع<select name="branch_id" defaultValue={branchId||''} required><option value="">اختر الفرع</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>الشهر<input name="month" type="month" defaultValue={month} required/></label><label>ملف Excel<input name="file" type="file" accept=".xlsx" required/></label><label>طريقة الاستيراد<select name="historyMode" defaultValue="append_only"><option value="append_only">الأيام الجديدة فقط</option><option value="review">مراجعة التغييرات السابقة</option></select></label><button className="primary" disabled={busy}>{busy?'جاري المعالجة…':'رفع وتحليل'}</button></form>{msg&&<p className="muted">{msg}</p>}</section>}<DataTable title="سجل الاستيراد" rows={rows.map(r=>({...r,branch:map.get(r.branch_id)||'—'}))} columns={[{key:'branch',label:'الفرع'},{key:'file_name',label:'الملف'},{key:'period_start',label:'من'},{key:'period_end',label:'إلى'},{key:'version',label:'الإصدار'},{key:'status',label:'الحالة'},{key:'uploaded_at',label:'تاريخ الرفع',render:r=>new Date(r.uploaded_at).toLocaleString('en-GB')},{key:'action',label:'إجراء',render:r=>isAdmin&&r.status==='validated'?<button className="small-btn" onClick={()=>approve(r.id)}>اعتماد</button>:'—'}]}/></div>
}
