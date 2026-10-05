import {useEffect,useMemo,useState} from 'react'
import type {Branch} from '../domain/types'
import {getBatchContents,getBranchBatches,saveBatchContents,type SheetBatch} from '../data/branchSheets'
import {deleteImport,reuploadImport} from '../data/imports'

type Tab='inventory'|'reps'|'cash'|'warehouse'
const num=(v:any)=>Number(v??0)
const money=(v:any)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(num(v))

export function BranchSheets({branches,initialBranchId=''}:{branches:Branch[];initialBranchId?:string}){
 const [branchId,setBranchId]=useState(initialBranchId||branches[0]?.id||'')
 const [batches,setBatches]=useState<SheetBatch[]>([])
 const [batchId,setBatchId]=useState('')
 const [tab,setTab]=useState<Tab>('inventory')
 const [search,setSearch]=useState('')
 const [day,setDay]=useState('all')
 const [inventory,setInventory]=useState<any[]>([]),[reps,setReps]=useState<any[]>([]),[cash,setCash]=useState<any[]>([]),[warehouse,setWarehouse]=useState<any[]>([]),[destinations,setDestinations]=useState<any[]>([])
 const [invEdits,setInvEdits]=useState<Map<number,any>>(new Map()),[repEdits,setRepEdits]=useState<Map<number,any>>(new Map()),[cashEdits,setCashEdits]=useState<Map<number,any>>(new Map()),[whEdits,setWhEdits]=useState<Map<number,any>>(new Map())
 const [cashDeletes,setCashDeletes]=useState<Set<number>>(new Set()),[cashNew,setCashNew]=useState<any[]>([])
 const [msg,setMsg]=useState(''),[saving,setSaving]=useState(false)

 const dirty=invEdits.size+repEdits.size+cashEdits.size+whEdits.size+cashDeletes.size+cashNew.length

 useEffect(()=>{if(!branchId)return;getBranchBatches(branchId).then(x=>{setBatches(x);const approved=x.find(b=>b.status==='approved')||x[0];setBatchId(approved?.id||'')}).catch(e=>setMsg(e.message||String(e)))},[branchId])
 useEffect(()=>{if(!batchId){setInventory([]);setReps([]);setCash([]);setWarehouse([]);return}setMsg('جاري تحميل محتويات الشيت…');getBatchContents(batchId).then(x=>{setInventory(x.inventory);setReps(x.reps);setCash(x.cash);setWarehouse(x.warehouse);setDestinations(x.destinations);setInvEdits(new Map());setRepEdits(new Map());setCashEdits(new Map());setWhEdits(new Map());setCashDeletes(new Set());setCashNew([]);setMsg('')}).catch(e=>setMsg(e.message||String(e)))},[batchId])

 const selectedBatch=batches.find(b=>b.id===batchId)
 const days=useMemo(()=>[...new Set([...inventory.map(x=>x.business_date),...reps.map(x=>x.business_date),...cash.map(x=>x.entry_date),...warehouse.map(x=>x.business_date)])].filter(Boolean).sort(),[inventory,reps,cash,warehouse])

 const update=(kind:Tab,id:number,key:string,value:any)=>{
  const setter=kind==='inventory'?setInventory:kind==='reps'?setReps:kind==='cash'?setCash:setWarehouse
  setter((prev:any[])=>prev.map(r=>r.id===id?{...r,[key]:value}:r))
  const editSetter=kind==='inventory'?setInvEdits:kind==='reps'?setRepEdits:kind==='cash'?setCashEdits:setWhEdits
  editSetter((prev:Map<number,any>)=>{const n=new Map(prev);n.set(id,{...(n.get(id)||{}),[key]:value});return n})
 }
 const filter=(rows:any[],dateKey:string,fields:string[])=>rows.filter(r=>(day==='all'||r[dateKey]===day)&&(!search||fields.some(f=>String(r[f]??'').toLowerCase().includes(search.toLowerCase()))))

 const invRows=filter(inventory,'business_date',['product_name','barcode'])
 const repRows=filter(reps,'business_date',['rep_name'])
 const cashRows=filter(cash,'entry_date',['description','canonical_category','category'])
 const whRows=filter(warehouse,'business_date',['business_date'])
 const metrics=useMemo(()=>({gross:reps.reduce((s,r)=>s+num(r.sales_before_discount),0),net:reps.reduce((s,r)=>s+num(r.net_after_discount),0),discounts:reps.reduce((s,r)=>s+num(r.discounts),0),collections:reps.reduce((s,r)=>s+num(r.deposit_amount),0),expenses:cash.filter(r=>r.is_expense).reduce((s,r)=>s+num(r.amount),0),products:new Set(inventory.map(r=>r.product_name)).size,repCount:new Set(reps.map(r=>r.rep_name)).size}),[reps,cash,inventory])

 async function saveAll(){
  if(!selectedBatch)return
  try{setSaving(true);setMsg('جاري حفظ التعديلات وإعادة حساب المؤشرات…');const out=await saveBatchContents({batchId:selectedBatch.id,branchId,inventoryEdits:[...invEdits].map(([id,e])=>({id,...e})),repEdits:[...repEdits].map(([id,e])=>({id,...e})),cashEdits:[...cashEdits].map(([id,e])=>({id,...e})),warehouseEdits:[...whEdits].map(([id,e])=>({id,...e})),cashDeletes:[...cashDeletes],cashNew:cashNew.map(({__tempId,...r}:any)=>r)});setMsg('تم الحفظ وتحديث '+out.affectedDatesCount+' يوم');const x=await getBatchContents(selectedBatch.id);setInventory(x.inventory);setReps(x.reps);setCash(x.cash);setWarehouse(x.warehouse);setDestinations(x.destinations);setInvEdits(new Map());setRepEdits(new Map());setCashEdits(new Map());setWhEdits(new Map());setCashDeletes(new Set());setCashNew([])}catch(e:any){setMsg(e.message||String(e))}finally{setSaving(false)}
 }
 useEffect(()=>{
  const handler=(e:KeyboardEvent)=>{
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){
    e.preventDefault()
    if(dirty>0&&!saving)void saveAll()
   }
  }
  window.addEventListener('keydown',handler)
  return()=>window.removeEventListener('keydown',handler)
 },[dirty,saving,batchId,branchId,invEdits,repEdits,cashEdits,whEdits,cashDeletes,cashNew])

 async function deleteCurrentBatch(){
  if(!selectedBatch||!confirm('سيتم حذف النسخة الحالية وكل بياناتها المرتبطة. هل تريد المتابعة؟'))return
  try{setMsg('جاري حذف النسخة…');await deleteImport(selectedBatch.id);const next=await getBranchBatches(branchId);setBatches(next);const pick=next.find(b=>b.status==='approved')||next[0];setBatchId(pick?.id||'');setMsg('تم حذف النسخة')}catch(e:any){setMsg(e.message||String(e))}
 }

 async function replaceCurrentBatch(file:File){
  if(!selectedBatch)return
  try{setMsg('جاري استبدال النسخة…');const out=await reuploadImport({branchId,periodStart:selectedBatch.period_start,periodEnd:selectedBatch.period_end,file,onProgress:setMsg});const next=await getBranchBatches(branchId);setBatches(next);setBatchId(out.uploaded.batchId);setMsg(out.processed.status==='validated'?'تم رفع وتحليل واعتماد النسخة الجديدة':'تم رفع النسخة الجديدة وتحتاج مراجعة')}catch(e:any){setMsg(e.message||String(e))}
 }


 function addCash(){
  if(!selectedBatch)return
  const temp=-Date.now(),row={id:temp,entry_date:selectedBatch.period_start,description:'',category:'أخرى',canonical_category:'أخرى',expense_group:null,amount:0,direction:'out',is_expense:true,destination_id:null,running_balance:null}
  setCash([row,...cash])
  setCashNew([...cashNew,{__tempId:temp,...row,id:undefined}])
 }

 return <div>
  <section className="panel sheet-editor-toolbar"><div className="sheet-selectors"><label>الفرع<select value={branchId} onChange={e=>setBranchId(e.target.value)}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>نسخة الشيت<select value={batchId} onChange={e=>setBatchId(e.target.value)}><option value="">اختر النسخة</option>{batches.map(b=><option key={b.id} value={b.id}>إصدار {b.version} — {b.status} — {b.period_start} → {b.period_end}</option>)}</select></label><label>اليوم<select value={day} onChange={e=>setDay(e.target.value)}><option value="all">كل الأيام</option>{days.map(d=><option key={d} value={d}>{d}</option>)}</select></label><label>بحث<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث…"/></label></div><div className="inline-actions"><button className="small-btn" onClick={addCash} disabled={!selectedBatch}>+ حركة خزينة</button><label className="small-btn file-action">استبدال النسخة<input type="file" accept=".xlsx" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void replaceCurrentBatch(file);e.currentTarget.value=''}}/></label><button className="small-btn danger-soft" onClick={deleteCurrentBatch} disabled={!selectedBatch}>حذف النسخة</button><button className="primary" onClick={saveAll} disabled={!dirty||saving}>{saving?'جاري الحفظ…':'حفظ كل التعديلات ('+dirty+')'}</button></div>{msg&&<p className="muted">{msg}</p>}</section>

  {selectedBatch&&<div className="kpi-grid"><article className="kpi-card"><span>صافي المبيعات</span><strong>{money(metrics.net)}</strong></article><article className="kpi-card"><span>التحصيل</span><strong>{money(metrics.collections)}</strong></article><article className="kpi-card"><span>الخصم</span><strong>{money(metrics.discounts)}</strong></article><article className="kpi-card"><span>المصروفات</span><strong>{money(metrics.expenses)}</strong></article></div>}

  <div className="sheet-tabs">{([['inventory','المخزون'],['reps','المناديب'],['cash','الخزينة'],['warehouse','ملخص المخزون']] as const).map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</div>

  {tab==='inventory'&&<EditableTable rows={invRows} columns={[
   ['business_date','التاريخ','readonly'],['product_name','الصنف','text'],['barcode','باركود','text'],['unit_value','قيمة الوحدة','number'],['opening_qty','افتتاحي','number'],['incoming_factory_qty','وارد مصنع','number'],['incoming_branches_qty','وارد فروع','number'],['sales_qty','مبيعات','number'],['bonus_qty','بونص','number'],['gifts_qty','هدايا','number'],['damages_qty','تالف','number'],['return_factory_qty','مرتجع مصنع','number'],['outgoing_branches_qty','تحويل فروع','number'],['adjustments_qty','تسويات','number'],['closing_qty','رصيد آخر','number'],['closing_value','قيمة الرصيد','number']
  ]} onChange={(id,key,v)=>update('inventory',id,key,v)}/>}
  {tab==='reps'&&<EditableTable rows={repRows} columns={[
   ['business_date','التاريخ','readonly'],['rep_name','المندوب','text'],['opening_balance','افتتاحي','number'],['sales_before_discount','قبل الخصم','number'],['discounts','الخصم','number'],['net_after_discount','صافي البيع','number'],['deposit_amount','التوريد','number'],['expense_amount','مصروف','number'],['closing_balance','رصيد آخر','number']
  ]} onChange={(id,key,v)=>update('reps',id,key,v)}/>}
  {tab==='cash'&&<EditableTable rows={cashRows} columns={[
   ['entry_date','التاريخ','date'],['description','البيان','text'],['category','التصنيف الأصلي','text'],['canonical_category','التوجيه','text'],['expense_group','مجموعة المصروف','text'],['destination_id','الوجهة','destination'],['amount','القيمة','number'],['direction','الحركة','select'],['is_expense','مصروف؟','boolean']
  ]} destinations={destinations} onChange={(id,key,v)=>{if(id<0){setCash(prev=>prev.map(r=>r.id===id?{...r,[key]:v}:r));setCashNew(prev=>prev.map((r:any)=>r.__tempId===id?{...r,[key]:v}:r));return}update('cash',id,key,v)}} onDelete={id=>{if(id<0){setCash(prev=>prev.filter(r=>r.id!==id));setCashNew(prev=>prev.filter((r:any)=>r.__tempId!==id));return}setCash(prev=>prev.filter(r=>r.id!==id));setCashDeletes(prev=>new Set(prev).add(id))}}/>}
  {tab==='warehouse'&&<EditableTable rows={whRows} columns={[
   ['business_date','التاريخ','readonly'],['opening_qty','افتتاحي كمية','number'],['opening_value','افتتاحي قيمة','number'],['incoming_factory_qty','وارد مصنع كمية','number'],['incoming_factory_value','وارد مصنع قيمة','number'],['sales_qty','مبيعات كمية','number'],['sales_value','مبيعات قيمة','number'],['bonus_qty','بونص كمية','number'],['damages_qty','تالف كمية','number'],['closing_qty','رصيد آخر كمية','number'],['closing_value','رصيد آخر قيمة','number']
  ]} onChange={(id,key,v)=>update('warehouse',id,key,v)}/>}
 </div>
}

function EditableTable({rows,columns,onChange,onDelete,destinations=[]}:{rows:any[];columns:[string,string,string][];onChange:(id:number,key:string,value:any)=>void;onDelete?:(id:number)=>void;destinations?:any[]}){
 return <section className="panel table-panel"><div className="table-head"><div><h2>محرر البيانات</h2><span>{rows.length} صف</span></div></div><div className="table-wrap"><table className="edit-table"><thead><tr>{columns.map(c=><th key={c[0]}>{c[1]}</th>)}{onDelete&&<th>حذف</th>}</tr></thead><tbody>{rows.map(r=><tr key={r.id}>{columns.map(([key,_label,type])=><td key={key}>{type==='readonly'?<span>{r[key]??'—'}</span>:type==='boolean'?<input type="checkbox" checked={Boolean(r[key])} onChange={e=>onChange(r.id,key,e.target.checked)}/>:type==='select'?<select value={r[key]||'out'} onChange={e=>onChange(r.id,key,e.target.value)}><option value="in">وارد</option><option value="out">صادر</option></select>:type==='destination'?<select value={r[key]||''} onChange={e=>onChange(r.id,key,e.target.value||null)}><option value="">بدون وجهة</option>{destinations.map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select>:<input type={type==='number'?'number':type==='date'?'date':'text'} step={type==='number'?'0.01':undefined} value={r[key]??''} onChange={e=>onChange(r.id,key,type==='number'?Number(e.target.value):e.target.value)}/>}</td>)}{onDelete&&<td><button className="small-btn" onClick={()=>onDelete(r.id)}>حذف</button></td>}</tr>)}</tbody></table></div></section>
}
