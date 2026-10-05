import {FormEvent,useEffect,useMemo,useState} from 'react'
import type {Branch} from '../domain/types'
import {approveImport,deleteImport,getImportHistory,getImportReview,processImport,resolveReviewedImport,uploadBranchWorkbook} from '../data/imports'
import {DataTable} from '../components/DataTable'

export function Imports({month,branchId,branches,isAdmin}:{month:string;branchId?:string;branches:Branch[];isAdmin:boolean}){
 const [rows,setRows]=useState<any[]>([]),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[review,setReview]=useState<any|null>(null)
 const map=useMemo(()=>new Map(branches.map(b=>[b.id,b.name])),[branches])
 const load=()=>getImportHistory(branchId).then(setRows).catch(e=>setMsg(e.message||String(e)))
 useEffect(()=>{void load()},[branchId])

 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const f=new FormData(e.currentTarget),file=f.get('file')
  if(!(file instanceof File)||!file.size)return
  try{setBusy(true);const out=await uploadBranchWorkbook({branchId:String(f.get('branch_id')),month:String(f.get('month')),file,historyMode:String(f.get('historyMode')||'append_only'),onProgress:setMsg});setMsg(out.processed.status==='validated'?'تم الرفع والتحليل — جاهز للاعتماد':out.processed.noNewDays?'لا توجد أيام جديدة':'تم الرفع ويحتاج مراجعة');(e.currentTarget as HTMLFormElement).reset();await load()}catch(x:any){setMsg(x.message||String(x))}finally{setBusy(false)}
 }

 async function bulk(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const form=e.currentTarget,fd=new FormData(form),mode=String(fd.get('historyMode')||'append_only'),m=String(fd.get('month')||month)
  const inputs=[...form.querySelectorAll<HTMLInputElement>('input[type=file][data-branch-id]')].filter(i=>i.files?.[0])
  if(!inputs.length){setMsg('اختر ملفًا واحدًا على الأقل');return}
  setBusy(true);let ok=0,reviewCount=0,failed=0
  for(const input of inputs){
   try{
    const out=await uploadBranchWorkbook({branchId:String(input.dataset.branchId),month:m,file:input.files![0],historyMode:mode,onProgress:s=>setMsg((input.dataset.branchName||'الفرع')+' — '+s)})
    if(out.processed.status==='validated')ok++;else reviewCount++
    input.value=''
   }catch{failed++}
  }
  setBusy(false);setMsg('انتهى الرفع الجماعي — ناجح: '+ok+' • مراجعة: '+reviewCount+' • فشل: '+failed);await load()
 }

 async function approve(id:string){try{setMsg('جاري الاعتماد…');await approveImport(id);setMsg('تم اعتماد الشيت');await load()}catch(x:any){setMsg(x.message||String(x))}}
 async function remove(r:any){if(!confirm('سيتم حذف الشيت «'+(r.original_file_name||'')+'» وبياناته المرتبطة. هل تريد المتابعة؟'))return;try{setMsg('جاري الحذف…');await deleteImport(r.id);setMsg('تم الحذف');await load()}catch(x:any){setMsg(x.message||String(x))}}
 async function rerun(id:string){try{setMsg('جاري إعادة التحليل…');await processImport(id);setMsg('تمت إعادة المعالجة');await load()}catch(x:any){setMsg(x.message||String(x))}}
 async function openReview(r:any){try{setMsg('جاري تحميل المراجعة…');const data=await getImportReview(r.id);setReview({batch:r,...data});setMsg('')}catch(x:any){setMsg(x.message||String(x))}}
 async function resolve(mode:'append_only'|'replace'){if(!review)return;try{setMsg('جاري تجهيز النسخة…');await resolveReviewedImport(review.batch.id,mode);setReview(null);setMsg(mode==='replace'?'تم اعتماد الاستبدال':'تم الاحتفاظ بالقديم واعتماد الجديد فقط');await load()}catch(x:any){setMsg(x.message||String(x))}}

 return <div>
  {isAdmin&&<section className="panel"><h2>رفع شيت فرع</h2><form className="upload-form" onSubmit={submit}><label>الفرع<select name="branch_id" defaultValue={branchId||''} required><option value="">اختر الفرع</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>الشهر<input name="month" type="month" defaultValue={month} required/></label><label>ملف Excel<input name="file" type="file" accept=".xlsx" required/></label><label>طريقة الاستيراد<select name="historyMode" defaultValue="append_only"><option value="append_only">الأيام الجديدة فقط</option><option value="review">مراجعة التغييرات السابقة</option></select></label><button className="primary" disabled={busy}>{busy?'جاري المعالجة…':'رفع وتحليل'}</button></form></section>}

  {isAdmin&&<section className="panel"><h2>رفع جماعي للفروع</h2><form className="bulk-v2" onSubmit={bulk}><div className="upload-form"><label>الشهر<input name="month" type="month" defaultValue={month}/></label><label>طريقة التعامل<select name="historyMode" defaultValue="append_only"><option value="append_only">الأيام الجديدة فقط</option><option value="review">مراجعة التغييرات</option></select></label></div><div className="bulk-list">{branches.map(b=><label className="bulk-item" key={b.id}><span><b>{b.name}</b><small>{b.code||''}</small></span><input type="file" data-branch-id={b.id} data-branch-name={b.name} accept=".xlsx"/></label>)}</div><button className="primary" disabled={busy}>رفع الملفات المحددة</button></form></section>}

  {msg&&<div className="panel"><p className="muted">{msg}</p></div>}

  <DataTable title="سجل الاستيراد" rows={rows.map(r=>({...r,branch:map.get(r.branch_id)||'—'}))} columns={[
   {key:'branch',label:'الفرع'},{key:'original_file_name',label:'الملف'},{key:'period_start',label:'من'},{key:'period_end',label:'إلى'},{key:'version',label:'الإصدار'},{key:'status',label:'الحالة'},
   {key:'uploaded_at',label:'تاريخ الرفع',render:r=>new Date(r.uploaded_at).toLocaleString('en-GB')},
   {key:'action',label:'إجراء',filter:false,render:r=><div className="inline-actions">
    {isAdmin&&r.status==='validated'&&<button className="small-btn" onClick={()=>approve(r.id)}>اعتماد</button>}
    {isAdmin&&['uploaded','failed'].includes(r.status)&&<button className="small-btn" onClick={()=>rerun(r.id)}>إعادة التحليل</button>}
    {r.status==='rejected'&&<button className="small-btn" onClick={()=>openReview(r)}>مراجعة</button>}
    {isAdmin&&<button className="small-btn" onClick={()=>remove(r)}>حذف</button>}
   </div>}
  ]}/>

  {review&&<div className="modal-backdrop"><div className="modal-card"><div className="modal-head"><h3>مراجعة فروق الشيت</h3><button className="small-btn" onClick={()=>setReview(null)}>إغلاق</button></div><p className="muted">الأخطاء: {review.issues.filter((x:any)=>x.severity==='error').length} • التحذيرات: {review.issues.filter((x:any)=>x.severity==='warning').length} • الأيام المتغيرة: {review.changes.length}</p><div className="review-list">{review.changes.map((ch:any)=><div className="review-card" key={ch.business_date}><b>{ch.business_date}</b><span>{ch.resolution_status||'غير محسوم'}</span></div>)}</div><div className="inline-actions review-actions"><button className="small-btn" onClick={()=>resolve('append_only')}>احتفظ بالسابق واستورد الجديد فقط</button><button className="primary" onClick={()=>resolve('replace')}>اعتماد الاستبدال بهذه النسخة</button></div></div></div>}
 </div>
}
