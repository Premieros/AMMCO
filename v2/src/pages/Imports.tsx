import {FormEvent,useEffect,useMemo,useState} from 'react'
import type {Branch} from '../domain/types'
import {approveImport,deleteImport,getImportHistory,getImportReview,getImportedDays,processImport,reuploadImport,resolveReviewedImport,uploadBranchWorkbook} from '../data/imports'
import {DataTable} from '../components/DataTable'

function snapshotMetrics(s:any){
 if(!s||typeof s!=='object')return {net:0,collections:0,debt:0,expenses:0,inventory:0}
 if(s.metrics)return {net:Number(s.metrics.netSales||0),collections:Number(s.metrics.collections||0),debt:Number(s.metrics.closingReceivables||0),expenses:Number(s.metrics.expenses||0),inventory:Number(s.metrics.inventoryValue||0)}
 const reps=Array.isArray(s.reps)?s.reps:[],treasury=Array.isArray(s.treasury)?s.treasury:[]
 return {
  net:reps.reduce((a:number,r:any)=>a+Number(r.netAfterDiscount||r.sales||0),0),
  collections:reps.reduce((a:number,r:any)=>a+Number(r.depositAmount||r.collections||0),0),
  debt:reps.reduce((a:number,r:any)=>a+Number(r.closingBalance||0),0),
  expenses:treasury.filter((x:any)=>x.isExpense).reduce((a:number,r:any)=>a+Number(r.amount||0),0),
  inventory:Number(s.warehouse?.closingValue||0)
 }
}
function changedSections(oldS:any,newS:any){
 const labels:Record<string,string>={reps:'المناديب',remittances:'التوريدات',warehouse:'حركة المخزن',treasury:'الخزنة'}
 return Object.keys(labels).filter(k=>JSON.stringify(oldS?.[k]??null)!==JSON.stringify(newS?.[k]??null)).map(k=>labels[k])
}
const fm=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)

export function Imports({month,branchId,branches,isAdmin}:{month:string;branchId?:string;branches:Branch[];isAdmin:boolean}){
 const [rows,setRows]=useState<any[]>([]),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[review,setReview]=useState<any|null>(null),[reupload,setReupload]=useState<any|null>(null)
 const [uploadMonth,setUploadMonth]=useState(month)
 const [bulkMonth,setBulkMonth]=useState(month)
 const [uploadBranch,setUploadBranch]=useState(branchId||'')
 const [activeTab,setActiveTab]=useState<'single'|'bulk'|'coverage'|'history'>('single')
 const [filledDays,setFilledDays]=useState<string[]>([])
 const [coverageDays,setCoverageDays]=useState<Record<string,string[]>>({})
 const map=useMemo(()=>new Map(branches.map(b=>[b.id,b.name])),[branches])
 const load=()=>getImportHistory(branchId).then(setRows).catch(e=>setMsg(e.message||String(e)))
 useEffect(()=>{void load()},[branchId])
 useEffect(()=>{setUploadMonth(month);setBulkMonth(month)},[month])
 useEffect(()=>{if(branchId)setUploadBranch(branchId)},[branchId])
 useEffect(()=>{let live=true;if(!uploadBranch||!uploadMonth){setFilledDays([]);return}getImportedDays({month:uploadMonth,branchId:uploadBranch}).then(x=>{if(live)setFilledDays([...new Set(x.map(r=>r.business_date))])}).catch(()=>{if(live)setFilledDays([])});return()=>{live=false}},[uploadMonth,uploadBranch])
 useEffect(()=>{let live=true;if(!uploadMonth){setCoverageDays({});return}getImportedDays({month:uploadMonth}).then(rows=>{if(!live)return;const next:Record<string,string[]>={};for(const r of rows){(next[r.branch_id]??=[]).push(r.business_date)};for(const k of Object.keys(next))next[k]=[...new Set(next[k])];setCoverageDays(next)}).catch(()=>{if(live)setCoverageDays({})});return()=>{live=false}},[uploadMonth])

 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const f=new FormData(e.currentTarget),file=f.get('file')
  if(!(file instanceof File)||!file.size)return
  const chosenMonth=String(f.get('month')||uploadMonth)
  const historyMode=String(f.get('historyMode')||'append_only')
  const selectedBranch=String(f.get('branch_id'))
  const name=file.name.toLowerCase()
  const octoberNamed=/اكتوبر|أكتوبر|october|oct\b/.test(name)
  if(octoberNamed&&!chosenMonth.endsWith('-10')){setMsg('اسم الملف يشير إلى أكتوبر بينما الشهر المختار '+chosenMonth+' — صحح الشهر قبل الرفع');return}
  try{
   setBusy(true)
   const out=await uploadBranchWorkbook({branchId:selectedBranch,month:chosenMonth,file,historyMode,onProgress:setMsg})
   if(out.processed.status==='validated'){
    await approveImport(out.uploaded.batchId)
    setMsg('تم رفع الشيت وتحليله واعتماده بنجاح')
   }else if(out.processed.noNewDays)setMsg('لا توجد حركة جديدة مقارنة بآخر نسخة معتمدة.')
   else setMsg('تم الرفع ويحتاج فروق التغييرات قبل الاستبدال')
   ;(e.currentTarget as HTMLFormElement).reset()
   await load()
   const [days,allDays]=await Promise.all([getImportedDays({month:chosenMonth,branchId:selectedBranch}),getImportedDays({month:chosenMonth})])
   setFilledDays([...new Set(days.map(r=>r.business_date))])
   const next:Record<string,string[]>={};for(const r of allDays){(next[r.branch_id]??=[]).push(r.business_date)};for(const k of Object.keys(next))next[k]=[...new Set(next[k])];setCoverageDays(next)
  }catch(x:any){setMsg(x.message||String(x))}finally{setBusy(false)}
 }

 async function bulk(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const form=e.currentTarget,fd=new FormData(form),mode=String(fd.get('historyMode')||'append_only'),m=String(fd.get('month')||bulkMonth)
  const inputs=[...form.querySelectorAll<HTMLInputElement>('input[type=file][data-branch-id]')].filter(i=>i.files?.[0])
  if(!inputs.length){setMsg('اختر ملفًا واحدًا على الأقل');return}
  setBusy(true);let ok=0,reviewCount=0,failed=0
  for(const input of inputs){
   try{
    const out=await uploadBranchWorkbook({branchId:String(input.dataset.branchId),month:m,file:input.files![0],historyMode:mode,onProgress:s=>setMsg((input.dataset.branchName||'الفرع')+' — '+s)})
    if(out.processed.status==='validated'){await approveImport(out.uploaded.batchId);ok++}else reviewCount++
    input.value=''
   }catch{failed++}
  }
  setBusy(false);setMsg('انتهى الرفع الجماعي — تم الاعتماد: '+ok+' • تحتاج قرار: '+reviewCount+' • فشل: '+failed);await load();const allDays=await getImportedDays({month:m});const next:Record<string,string[]>={};for(const r of allDays){(next[r.branch_id]??=[]).push(r.business_date)};for(const k of Object.keys(next))next[k]=[...new Set(next[k])];setCoverageDays(next)
 }

 async function approve(id:string){try{setMsg('جاري الاعتماد…');await approveImport(id);setMsg('تم اعتماد الشيت');await load()}catch(x:any){setMsg(x.message||String(x))}}
 async function remove(r:any){if(!confirm('سيتم حذف الشيت «'+(r.original_file_name||'')+'» وبياناته المرتبطة. هل تريد المتابعة؟'))return;try{setMsg('جاري الحذف…');await deleteImport(r.id);setMsg('تم الحذف');await load()}catch(x:any){setMsg(x.message||String(x))}}
 async function rerun(id:string){try{setMsg('جاري إعادة التحليل…');await processImport(id);setMsg('تمت إعادة المعالجة');await load()}catch(x:any){setMsg(x.message||String(x))}}
 async function rerunCumulative(id:string){
  try{
   setMsg('جاري إعادة التحليل بالتحديث اليومي التراكمي…')
   const out=await processImport(id,'append_only')
   if(out.status==='validated'){
    await approveImport(id)
    setMsg('تمت إعادة المعالجة والاعتماد بنجاح')
   }else if(out.noNewDays)setMsg('لا توجد حركة جديدة في هذه النسخة')
   else setMsg('تمت إعادة المعالجة وتحتاج قرار')
   await load()
   const allDays=await getImportedDays({month:uploadMonth})
   const next:Record<string,string[]>={};for(const r of allDays){(next[r.branch_id]??=[]).push(r.business_date)};for(const k of Object.keys(next))next[k]=[...new Set(next[k])];setCoverageDays(next)
  }catch(x:any){setMsg(x.message||String(x))}
 }
 async function openReview(r:any){try{setMsg('جاري تحميل الفروق…');const data=await getImportReview(r.id);setReview({batch:r,...data});setMsg('')}catch(x:any){setMsg(x.message||String(x))}}
 async function submitReupload(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!reupload)return;const f=new FormData(e.currentTarget),file=f.get('file');if(!(file instanceof File)||!file.size)return;try{setBusy(true);const out=await reuploadImport({branchId:reupload.branch_id,periodStart:reupload.period_start,periodEnd:reupload.period_end,file,onProgress:setMsg});setMsg(out.processed.status==='validated'?'تم رفع النسخة الجديدة وتحليلها واعتمادها':'تم رفع النسخة الجديدة وتحتاج قرار');setReupload(null);await load()}catch(x:any){setMsg(x.message||String(x))}finally{setBusy(false)}}
 async function resolve(mode:'append_only'|'replace'){
  if(!review||busy)return
  try{
   setBusy(true)
   setMsg(mode==='replace'?'جارٍ تطبيق التحديث واعتماد النسخة…':'جارٍ اعتماد الإضافات الجديدة مع الاحتفاظ بالسابق…')
   await resolveReviewedImport(review.batch.id,mode)
   setReview(null)
   setMsg(mode==='replace'?'تم تطبيق التحديث واعتماد النسخة الجديدة':'تم الاحتفاظ بالسابق واعتماد الإضافات الجديدة')
   await load()
   const allDays=await getImportedDays({month:uploadMonth})
   const next:Record<string,string[]>={};for(const r of allDays){(next[r.branch_id]??=[]).push(r.business_date)};for(const k of Object.keys(next))next[k]=[...new Set(next[k])];setCoverageDays(next)
  }catch(x:any){setMsg(x.message||String(x))}
  finally{setBusy(false)}
 }

 return <div className="imports-page">
  <div className="subpage-tabs no-print">
   <button className={activeTab==='single'?'active':''} onClick={()=>setActiveTab('single')}>رفع فردي</button>
   {isAdmin&&<button className={activeTab==='bulk'?'active':''} onClick={()=>setActiveTab('bulk')}>رفع جماعي</button>}
   <button className={activeTab==='coverage'?'active':''} onClick={()=>setActiveTab('coverage')}>تغطية الأيام</button>
   <button className={activeTab==='history'?'active':''} onClick={()=>setActiveTab('history')}>سجل الاستيراد</button>
  </div>

  {activeTab==='single'&&isAdmin&&<section className="panel import-section">
   <div className="section-heading"><div><span>استيراد شيت</span><h2>رفع شيت فرع</h2></div><small>حدد الشهر أولًا ثم اختر الفرع والملف</small></div>
   <form className="upload-form" onSubmit={submit}>
    <label>شهر الرفع<input name="month" type="month" value={uploadMonth} onChange={e=>setUploadMonth(e.target.value)} required/></label>
    <label>الفرع<select name="branch_id" value={uploadBranch} onChange={e=>setUploadBranch(e.target.value)} required><option value="">اختر الفرع</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label>ملف Excel<input name="file" type="file" accept=".xlsx" required/></label>
    <label>طريقة الاستيراد<select name="historyMode" defaultValue="append_only"><option value="append_only">تحديث يومي تراكمي</option><option value="review">فروق التغييرات السابقة</option></select></label>
    <button className="primary" disabled={busy}>{busy?'جاري المعالجة…':'رفع وتحليل'}</button>
   </form>

   <div className="filled-days-card">
    <div className="filled-days-head"><div><b>أيام بها بيع أو توريد</b><span>{uploadBranch?((map.get(uploadBranch)||'الفرع')+' · '+uploadMonth):'اختر الفرع لعرض الأيام'}</span></div><strong>{filledDays.length}</strong></div>
    {uploadBranch&&uploadMonth?<div className="days-grid">
     {Array.from({length:new Date(Number(uploadMonth.slice(0,4)),Number(uploadMonth.slice(5,7)),0).getDate()},(_,i)=>i+1).map(day=>{
      const d=uploadMonth+'-'+String(day).padStart(2,'0'),filled=filledDays.includes(d)
      return <span key={day} className={filled?'filled':''} title={filled?'به بيع/توريد':'بدون بيع/توريد'}>{day}</span>
     })}
    </div>:<p className="muted">بعد اختيار الفرع سيظهر هنا كل يوم به بيع/توريد فعليًا في النظام لهذا الشهر.</p>}
    <div className="days-legend"><span><i className="legend-dot filled"/>بيع/توريد</span><span><i className="legend-dot"/>بدون بيع/توريد</span></div>
   </div>
  </section>}

  {activeTab==='bulk'&&isAdmin&&<section className="panel import-section">
   <div className="section-heading"><div><span>رفع متعدد</span><h2>رفع جماعي للفروع</h2></div><small>شهر واحد لكل الملفات المختارة</small></div>
   <form className="bulk-v2" onSubmit={bulk}>
    <div className="upload-form"><label>شهر الرفع<input name="month" type="month" value={bulkMonth} onChange={e=>setBulkMonth(e.target.value)}/></label><label>طريقة التعامل<select name="historyMode" defaultValue="append_only"><option value="append_only">تحديث يومي تراكمي</option><option value="review">فروق التغييرات</option></select></label></div>
    <div className="bulk-list">{branches.map(b=><label className="bulk-item" key={b.id}><span><b>{b.name}</b><small>{b.code||''}</small></span><input type="file" data-branch-id={b.id} data-branch-name={b.name} accept=".xlsx"/></label>)}</div>
    <button className="primary" disabled={busy}>رفع الملفات المحددة</button>
   </form>
  </section>}

  {msg&&<div className="panel"><p className="muted">{msg}</p></div>}

  {activeTab==='coverage'&&<section className="panel import-section">
   <div className="section-heading"><div><span>متابعة الشهر</span><h2>تغطية الأيام لكل فرع</h2></div><label className="coverage-month">الشهر<input type="month" value={uploadMonth} onChange={e=>setUploadMonth(e.target.value)}/></label></div>
   <div className="coverage-table-wrap">
    <div className="coverage-table" style={{'--days':new Date(Number(uploadMonth.slice(0,4)),Number(uploadMonth.slice(5,7)),0).getDate()} as any}>
     <div className="coverage-header"><b>الفرع</b>{Array.from({length:new Date(Number(uploadMonth.slice(0,4)),Number(uploadMonth.slice(5,7)),0).getDate()},(_,i)=><span key={i+1}>{i+1}</span>)}<b>المجموع</b></div>
     {branches.map(b=>{const days=new Set(coverageDays[b.id]||[]),daysInMonth=new Date(Number(uploadMonth.slice(0,4)),Number(uploadMonth.slice(5,7)),0).getDate();return <div className="coverage-row" key={b.id}><b>{b.name}</b>{Array.from({length:daysInMonth},(_,i)=>{const day=i+1,d=uploadMonth+'-'+String(day).padStart(2,'0'),filled=days.has(d);return <span key={day} className={filled?'filled':''} title={filled?'بيع/توريد':'بدون بيع/توريد'}>{filled?'✓':'·'}</span>})}<strong className={days.size===daysInMonth?'complete':''}>{days.size}/{daysInMonth}</strong></div>})}
    </div>
   </div>
   <div className="days-legend"><span><i className="legend-dot filled"/>يوم بيع/توريد</span><span><i className="legend-dot"/>بدون بيع/توريد</span></div>
  </section>}

  {activeTab==='history'&&<DataTable title="سجل الاستيراد" rows={rows.map(r=>({...r,branch:map.get(r.branch_id)||'—'}))} columns={[
   {key:'branch',label:'الفرع'},{key:'original_file_name',label:'الملف'},{key:'period_start',label:'من'},{key:'period_end',label:'إلى'},{key:'version',label:'الإصدار'},{key:'status',label:'الحالة',render:r=>r.status==='approved'?'معتمد':r.status==='validated'?'جاهز للاعتماد':r.status==='processing'?'جاري التحليل':r.status==='rejected'&&r.metadata?.no_new_days?'نسخة قديمة — أعد التحليل':r.status==='rejected'?'تحتاج قرار':r.status},
   {key:'uploaded_at',label:'تاريخ الرفع',render:r=>new Date(r.uploaded_at).toLocaleString('en-GB')},
   {key:'action',label:'إجراء',filter:false,render:r=><div className="inline-actions">
    {isAdmin&&r.status==='validated'&&<button className="small-btn" onClick={()=>approve(r.id)}>اعتماد</button>}
    {isAdmin&&['uploaded','failed'].includes(r.status)&&<button className="small-btn" onClick={()=>rerun(r.id)}>إعادة التحليل</button>}
    {r.status==='rejected'&&r.metadata?.no_new_days&&<button className="small-btn" onClick={()=>rerunCumulative(r.id)}>إعادة تحليل تراكمي</button>}
    {r.status==='rejected'&&!r.metadata?.no_new_days&&<button className="small-btn" onClick={()=>openReview(r)}>فروق</button>}
    {isAdmin&&<button className="small-btn" onClick={()=>setReupload(r)}>إعادة رفع</button>}
    {isAdmin&&<button className="small-btn" onClick={()=>remove(r)}>حذف</button>}
   </div>}
  ]}/>}

  {reupload&&<div className="modal-backdrop"><form className="modal-card" onSubmit={submitReupload}><div className="modal-head"><h3>إعادة رفع الشيت</h3><button type="button" className="small-btn" onClick={()=>setReupload(null)}>إغلاق</button></div><p className="muted">الفترة: {reupload.period_start} — {reupload.period_end}</p><label className="upload-file-label">ملف Excel الجديد<input name="file" type="file" accept=".xlsx" required/></label>{msg&&<p className="muted">{msg}</p>}<button className="primary" disabled={busy}>{busy?'جاري الرفع…':'رفع وتحليل النسخة الجديدة'}</button></form></div>}
  {review&&<div className="modal-backdrop"><div className="modal-card wide-modal"><div className="modal-head"><h3>فروق فروق الشيت</h3><button className="small-btn" onClick={()=>setReview(null)}>إغلاق</button></div>
   <p className="muted">الأخطاء: {review.issues.filter((x:any)=>x.severity==='error').length} • التحذيرات: {review.issues.filter((x:any)=>x.severity==='warning').length} • الأيام المتغيرة: {review.changes.length}</p>
   {!!review.issues.length&&<section className="review-section"><h4>ملاحظات التحقق</h4><div className="review-list">{review.issues.map((x:any,i:number)=><div className={'review-card issue-'+x.severity} key={i}><div><b>{x.code||'ملاحظة'}</b><span>{x.sheet_name||'—'}{x.row_number?' • صف '+x.row_number:''}</span></div><span>{x.severity} — {x.message}</span></div>)}</div></section>}
   {!!review.changes.length&&<section className="review-section"><h4>الأيام المتغيرة</h4><div className="review-list">{review.changes.map((ch:any)=>{const a=snapshotMetrics(ch.old_snapshot),b=snapshotMetrics(ch.new_snapshot);const diffs=[['صافي المبيعات',a.net,b.net],['التحصيل',a.collections,b.collections],['مديونية آخر',a.debt,b.debt],['المصروفات',a.expenses,b.expenses],['قيمة المخزون',a.inventory,b.inventory]].filter((x:any)=>Math.abs(Number(x[1])-Number(x[2]))>.02);return <div className="review-card review-change" key={ch.business_date}><div><b>{ch.business_date}</b><span>{changedSections(ch.old_snapshot,ch.new_snapshot).join('، ')||'تغيير في محتوى اليوم'}</span></div><div className="diff-grid">{diffs.map((x:any)=><span key={x[0]}><small>{x[0]}</small><b>{fm(x[1])} ← {fm(x[2])}</b></span>)}</div><em>{ch.resolution_status||'غير محسوم'}</em></div>})}</div></section>}
   <div className="inline-actions review-actions"><button className="small-btn" disabled={busy} onClick={()=>resolve('append_only')}>احتفظ بالسابق واعتمد الإضافات فقط</button><button className="primary" disabled={busy} onClick={()=>resolve('replace')}>{busy?'جارٍ تطبيق التحديث…':'اعتماد التحديث'}</button></div>
  </div></div>}
 </div>
}