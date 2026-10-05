import {useEffect,useMemo,useState} from 'react'
import type {Branch} from '../domain/types'
import {getExpenses,saveAccrual,setExpenseType,type AccrualSetting,type ExpenseRow} from '../data/expenses'
import {EXPENSE_CATALOG,normalizeExpenseLabel} from '../domain/expense-catalog'
import {DataTable} from '../components/DataTable'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)

export function Expenses({from,to,month,branchId,branches,isAdmin}:{from:string;to:string;month:string;branchId?:string;branches:Branch[];isAdmin:boolean}){
 const [rows,setRows]=useState<ExpenseRow[]>([]),[settings,setSettings]=useState<AccrualSetting[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[msg,setMsg]=useState('')
 const load=()=>{setLoading(true);getExpenses({from,to,month,branchId}).then(x=>{setRows(x.rows);setSettings(x.settings)}).catch(e=>setError(e.message||String(e))).finally(()=>setLoading(false))}
 useEffect(load,[from,to,month,branchId])
 const branchMap=useMemo(()=>new Map(branches.map(b=>[b.id,b.name])),[branches])
 const grouped=useMemo(()=>{const m=new Map<string,{category:string,total:number,kind:string,ids:number[],type:string}>();for(const x of EXPENSE_CATALOG)m.set(x.label,{category:x.label,total:0,kind:x.kind,ids:[],type:x.kind==='non_expense'?'غير مصروف':'تلقائي'});for(const r of rows){const label=normalizeExpenseLabel(r.category);const x=m.get(label)||{category:label,total:0,kind:r.isExpense?'expense':'non_expense',ids:[],type:r.type};x.total+=r.amount;if(r.isExpense&&typeof r.id==='number')x.ids.push(r.id);if(r.isExpense&&r.type!=='تلقائي')x.type=r.type;m.set(label,x)}return [...m.values()].sort((a,b)=>b.total-a.total||a.category.localeCompare(b.category,'ar'))},[rows])
 async function save(b:Branch){
  const wages=Number((document.getElementById('w-'+b.id) as HTMLInputElement)?.value||0)
  const rent=Number((document.getElementById('r-'+b.id) as HTMLInputElement)?.value||0)
  const workingDays=Number((document.getElementById('d-'+b.id) as HTMLInputElement)?.value||0)
  const branchManager=Number((document.getElementById('bm-'+b.id) as HTMLInputElement)?.value||0)
  const sectorManager=Number((document.getElementById('sm-'+b.id) as HTMLInputElement)?.value||0)
  const carriedExpenses=Number((document.getElementById('ce-'+b.id) as HTMLInputElement)?.value||0)
  const commissionRate=Number((document.getElementById('cr-'+b.id) as HTMLInputElement)?.value||0)/100
  try{setMsg('جاري الحفظ…');await saveAccrual({branchId:b.id,month,wages,rent,workingDays,branchManager,sectorManager,carriedExpenses,commissionRate});setMsg('تم الحفظ');load()}catch(e:any){setMsg(e.message||String(e))}
 }
 if(loading)return <div className="panel loading">جاري تحميل المصروفات…</div>
 return <div>
  {error&&<div className="error-box">{error}</div>}
  <div className="kpi-grid"><article className="kpi-card"><span>إجمالي المصروفات الفعلية</span><strong>{money(rows.filter(r=>r.isExpense).reduce((s,r)=>s+r.amount,0))} ج.م</strong></article><article className="kpi-card"><span>عدد التصنيفات</span><strong>{grouped.length}</strong></article></div>
  {isAdmin&&<section className="panel"><h2>إعدادات المستحقات الشهرية</h2><p className="muted">الأجور والإيجار وأيام العمل ومديري الفرع/القطاع والمصروفات المرحلة والعمولة.</p>{msg&&<p className="muted">{msg}</p>}<div className="manual-grid">{branches.filter(b=>!branchId||b.id===branchId).map(b=>{const s=settings.find(x=>x.branch_id===b.id);return <div className="manual-row expanded" key={b.id}><b>{b.name}</b><label>الأجور<input id={'w-'+b.id} type="number" min="0" defaultValue={Number(s?.wages||0)}/></label><label>مدير الفرع<input id={'bm-'+b.id} type="number" min="0" defaultValue={Number(s?.branch_manager||0)}/></label><label>مدير القطاع<input id={'sm-'+b.id} type="number" min="0" defaultValue={Number(s?.sector_manager||0)}/></label><label>الإيجار<input id={'r-'+b.id} type="number" min="0" defaultValue={Number(s?.rent||0)}/></label><label>مصروفات مرحلة<input id={'ce-'+b.id} type="number" min="0" defaultValue={Number(s?.carried_expenses||0)}/></label><label>العمولة %<input id={'cr-'+b.id} type="number" min="0" max="100" step="0.01" defaultValue={Number(s?.commission_rate||0)*100}/></label><label>أيام العمل<input id={'d-'+b.id} type="number" min="1" max="31" defaultValue={Number(s?.working_days_basis||30)}/></label><button className="small-btn" onClick={()=>save(b)}>حفظ</button></div>})}</div></section>}
  <DataTable title="التصنيفات" rows={grouped} columns={[{key:'category',label:'التصنيف'},{key:'kind',label:'الحالة',render:r=>r.kind==='expense'?'مصروف':'غير مصروف'},{key:'type',label:'النوع'},{key:'total',label:'القيمة',numeric:true,render:r=>money(r.total)},{key:'action',label:'تغيير النوع',render:r=>isAdmin&&r.kind==='expense'&&r.ids.length?<div className="inline-actions"><button className="small-btn" onClick={async()=>{await setExpenseType(r.ids,'تشغيلي',r.category);load()}}>تشغيلي</button><button className="small-btn" onClick={async()=>{await setExpenseType(r.ids,'غير تشغيلي',r.category);load()}}>غير تشغيلي</button></div>:'—'}]}/>
  <DataTable title="تفاصيل المصروفات" rows={rows.map(r=>({...r,branch:branchMap.get(r.branchId)||'—'}))} columns={[{key:'date',label:'التاريخ'},{key:'branch',label:'الفرع'},{key:'category',label:'التصنيف'},{key:'group',label:'المجموعة'},{key:'type',label:'النوع'},{key:'source',label:'المصدر'},{key:'amount',label:'القيمة',numeric:true,render:r=>money(r.amount)}]}/>
 </div>
}
