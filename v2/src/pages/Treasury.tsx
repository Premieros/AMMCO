import {FormEvent,useEffect,useMemo,useState} from 'react'
import type {Branch} from '../domain/types'
import {editTreasuryAnalytics,getTreasury,getTreasuryAuditContext,updateCashEntry,type CashRow} from '../data/treasury'
import {DataTable} from '../components/DataTable'

const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)

export function Treasury({from,to,branchId,branches,isAdmin=false}:{from:string;to:string;branchId?:string;branches:Branch[];isAdmin?:boolean}){
 const [rows,setRows]=useState<CashRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[edit,setEdit]=useState<CashRow|null>(null),[msg,setMsg]=useState('')
 const [accounts,setAccounts]=useState<any[]>([]),[audit,setAudit]=useState<any[]>([])
 const load=()=>{setLoading(true);return getTreasury({from,to,branchId}).then(setRows).catch(e=>setError(e.message||String(e))).finally(()=>setLoading(false))}
 useEffect(()=>{void load()},[from,to,branchId])
 const map=useMemo(()=>new Map(branches.map(b=>[b.id,b.name])),[branches])
 const branchCash=useMemo(()=>{
  const by=new Map<string,{branchId:string;branch:string;opening:number|null;incoming:number;outgoing:number;net:number;closing:number|null;lastDate:string}>()
  const visibleBranches=branchId?branches.filter(b=>b.id===branchId):branches
  for(const b of visibleBranches)by.set(b.id,{branchId:b.id,branch:b.name,opening:null,incoming:0,outgoing:0,net:0,closing:null,lastDate:'—'})
  for(const r of rows){
   let x=by.get(r.branch_id)
   if(!x){x={branchId:r.branch_id,branch:map.get(r.branch_id)||'—',opening:null,incoming:0,outgoing:0,net:0,closing:null,lastDate:r.entry_date};by.set(r.branch_id,x)}
   const amount=Number(r.amount||0),signed=r.direction==='in'?amount:-amount
   if(x.opening===null&&r.running_balance!==null)x.opening=Number(r.running_balance)-signed
   if(r.direction==='in')x.incoming+=amount
   if(r.direction==='out')x.outgoing+=amount
   x.net=x.incoming-x.outgoing
   x.lastDate=r.entry_date
  }
  for(const x of by.values()){
   x.net=x.incoming-x.outgoing
   if(x.opening!==null)x.closing=x.opening+x.incoming-x.outgoing
  }
  return [...by.values()].sort((a,b)=>a.branch.localeCompare(b.branch,'ar'))
 },[rows,map,branches,branchId])
 const openingCash=branchCash.reduce((s,x)=>s+Number(x.opening||0),0)
 const incoming=branchCash.reduce((s,x)=>s+x.incoming,0)
 const outgoing=branchCash.reduce((s,x)=>s+x.outgoing,0)
 const closingCash=openingCash+incoming-outgoing

 async function openEdit(r:CashRow){
  setEdit(r);setMsg('');setAccounts([]);setAudit([])
  try{const ctx=await getTreasuryAuditContext(r);setAccounts(ctx.accounts);setAudit(ctx.audit)}catch(x:any){setMsg(x.message||String(x))}
 }

 async function saveSource(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!edit)return;const f=new FormData(e.currentTarget)
  try{
   setMsg('جاري حفظ السطر الأصلي…')
   await updateCashEntry({id:edit.id,source_code:String(f.get('source_code')||''),entry_date:String(f.get('entry_date')||''),description:String(f.get('description')||''),category:String(f.get('category')||''),inbound:Number(f.get('inbound')||0),outbound:Number(f.get('outbound')||0),running_balance:String(f.get('running_balance')||''),reason:String(f.get('reason')||'')})
   setMsg('تم حفظ تعديل السطر الأصلي')
   await load()
   const fresh=rows.find(x=>x.id===edit.id)||edit
   const ctx=await getTreasuryAuditContext(fresh);setAudit(ctx.audit);setAccounts(ctx.accounts)
  }catch(x:any){setMsg(x.message||String(x))}
 }

 async function saveAnalytics(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!edit)return;const f=new FormData(e.currentTarget)
  try{
   setMsg('جاري حفظ التصحيح الإداري…')
   await editTreasuryAnalytics({id:edit.id,description:String(f.get('description')||''),canonicalCategory:String(f.get('canonical_category')||''),expenseGroup:String(f.get('expense_group')||''),treasuryAccountId:String(f.get('treasury_account_id')||''),reason:String(f.get('reason')||'')})
   setMsg('تم حفظ التصحيح في سجل المراجعة')
   await load()
   const ctx=await getTreasuryAuditContext(edit);setAudit(ctx.audit);setAccounts(ctx.accounts)
  }catch(x:any){setMsg(x.message||String(x))}
 }

 if(loading)return <div className="panel loading">جاري تحميل الخزينة…</div>
 return <div>
  {error&&<div className="error-box">{error}</div>}
  <div className="kpi-grid"><article className="kpi-card"><span>رصيد أول الفترة</span><strong>{money(openingCash)}</strong></article><article className="kpi-card"><span>الوارد</span><strong>{money(incoming)}</strong></article><article className="kpi-card"><span>الصادر</span><strong>{money(outgoing)}</strong></article><article className="kpi-card"><span>رصيد آخر / صافي النقدية</span><strong>{money(closingCash)}</strong><small>رصيد أول + الوارد − الصادر</small></article></div>
  <DataTable title={branchId?"ملخص خزينة الفرع":"صافي الخزينة حسب الفرع"} rows={branchCash} columns={[
   {key:'branch',label:'الفرع'},
   {key:'opening',label:'رصيد أول',numeric:true,render:r=>r.opening==null?'—':money(r.opening)},
   {key:'incoming',label:'الوارد',numeric:true,render:r=>money(r.incoming)},
   {key:'outgoing',label:'الصادر',numeric:true,render:r=>money(r.outgoing)},
   {key:'net',label:'صافي الحركة',numeric:true,render:r=>money(r.net)},
   {key:'closing',label:'رصيد آخر',numeric:true,total:false,render:r=>r.closing==null?'—':money(r.closing)},
   {key:'lastDate',label:'آخر حركة',total:false}
  ]}/> 
  <DataTable title="حركات الخزينة" rows={rows.map(r=>({...r,branch:map.get(r.branch_id)||'—',inbound:r.direction==='in'?r.amount:0,outbound:r.direction==='out'?r.amount:0}))} columns={[
   {key:'entry_date',label:'التاريخ'},{key:'branch',label:'الفرع'},{key:'source_code',label:'الكود'},{key:'description',label:'البيان'},{key:'category',label:'التصنيف الأصلي'},{key:'canonical_category',label:'التوجيه الحالي'},{key:'inbound',label:'وارد',numeric:true,render:r=>money(r.inbound)},{key:'outbound',label:'صادر',numeric:true,render:r=>money(r.outbound)},{key:'running_balance',label:'الرصيد',numeric:true,total:false,render:r=>r.running_balance==null?'—':money(r.running_balance)},{key:'action',label:'إجراء',filter:false,render:r=>isAdmin?<button className="small-btn" onClick={()=>openEdit(r)}>تعديل / سجل</button>:'—'}
  ]}/>

  {edit&&<div className="modal-backdrop"><div className="modal-card wide-modal"><div className="modal-head"><h3>حركة الخزينة #{edit.id}</h3><button type="button" className="small-btn" onClick={()=>setEdit(null)}>إغلاق</button></div>
   <section className="modal-section"><h4>تعديل السطر الأصلي</h4><form onSubmit={saveSource}><div className="form-grid"><label>الكود<input name="source_code" defaultValue={edit.source_code||''}/></label><label>التاريخ<input name="entry_date" type="date" defaultValue={edit.entry_date} required/></label><label>البيان<input name="description" defaultValue={edit.description||''}/></label><label>التصنيف<input name="category" defaultValue={edit.category||''}/></label><label>الوارد<input name="inbound" type="number" min="0" step="0.01" defaultValue={edit.direction==='in'?Number(edit.amount||0):0}/></label><label>الصادر<input name="outbound" type="number" min="0" step="0.01" defaultValue={edit.direction==='out'?Number(edit.amount||0):0}/></label><label>رصيد آخر<input name="running_balance" type="number" step="0.01" defaultValue={edit.running_balance??''}/></label><label className="full">سبب التعديل<textarea name="reason" rows={2} required placeholder="سبب التعديل"></textarea></label></div><button className="primary">حفظ السطر</button></form></section>

   <section className="modal-section"><h4>التصحيح الإداري التحليلي</h4><form onSubmit={saveAnalytics}><div className="form-grid"><label>الخزنة / البنك<select name="treasury_account_id" defaultValue={edit.treasury_account_id||accounts[0]?.id||''} required><option value="" disabled>اختر الخزنة</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>البيان<input name="description" defaultValue={edit.description||''}/></label><label>التوجيه<input name="canonical_category" defaultValue={edit.canonical_category||edit.category||''}/></label><label>مجموعة المصروف<select name="expense_group" defaultValue={edit.expense_group||''}><option value="">بدون مجموعة</option><option>اجور وحوافز وعمولات</option><option>مصروفات السيارات</option><option>تشغيل ومرافق</option><option>اداري ومالي</option><option>انتقالات وسفر</option><option>مصروفات أخرى</option></select></label><label className="full">سبب التصحيح<input name="reason" required placeholder="سبب التصحيح الإداري"/></label></div><button className="primary">حفظ التصحيح</button></form></section>

   {msg&&<p className="muted">{msg}</p>}
   <section className="audit-block"><h4>سجل التعديلات</h4>{audit.length?<div className="audit-list">{audit.map(a=><div className="audit-item" key={a.id}><b>{a.reason}</b><span>البيان: {a.old_description||'—'} → {a.new_description||'—'}</span><span>التوجيه: {a.old_canonical_category||'—'} → {a.new_canonical_category||'—'}</span><small>{a.changed_at?new Date(a.changed_at).toLocaleString('en-GB'):'—'}</small></div>)}</div>:<p className="muted">لا توجد تعديلات سابقة.</p>}</section>
  </div></div>}
 </div>
}
