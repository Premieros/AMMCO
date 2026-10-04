import {useEffect,useMemo,useState} from 'react'
import type {Branch} from '../domain/types'
import {getExpenses,saveAccrual,type AccrualSetting,type ExpenseRow} from '../data/expenses'
import {DataTable} from '../components/DataTable'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)

export function Expenses({from,to,month,branchId,branches,isAdmin}:{from:string;to:string;month:string;branchId?:string;branches:Branch[];isAdmin:boolean}){
 const [rows,setRows]=useState<ExpenseRow[]>([]),[settings,setSettings]=useState<AccrualSetting[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[msg,setMsg]=useState('')
 const load=()=>{setLoading(true);getExpenses({from,to,month,branchId}).then(x=>{setRows(x.rows);setSettings(x.settings)}).catch(e=>setError(e.message||String(e))).finally(()=>setLoading(false))}
 useEffect(load,[from,to,month,branchId])
 const branchMap=useMemo(()=>new Map(branches.map(b=>[b.id,b.name])),[branches])
 const grouped=useMemo(()=>{const m=new Map<string,{category:string,total:number}>();for(const r of rows){const x=m.get(r.category)||{category:r.category,total:0};x.total+=r.amount;m.set(r.category,x)}return [...m.values()].sort((a,b)=>b.total-a.total)},[rows])
 async function save(b:Branch){
  const wages=Number((document.getElementById('w-'+b.id) as HTMLInputElement)?.value||0)
  const rent=Number((document.getElementById('r-'+b.id) as HTMLInputElement)?.value||0)
  const workingDays=Number((document.getElementById('d-'+b.id) as HTMLInputElement)?.value||0)
  try{setMsg('جاري الحفظ…');await saveAccrual({branchId:b.id,month,wages,rent,workingDays});setMsg('تم الحفظ');load()}catch(e:any){setMsg(e.message||String(e))}
 }
 if(loading)return <div className="panel loading">جاري تحميل المصروفات…</div>
 return <div>
  {error&&<div className="error-box">{error}</div>}
  <div className="kpi-grid"><article className="kpi-card"><span>إجمالي المصروفات الفعلية</span><strong>{money(rows.reduce((s,r)=>s+r.amount,0))} ج.م</strong></article><article className="kpi-card"><span>عدد البنود</span><strong>{grouped.length}</strong></article></div>
  {isAdmin&&<section className="panel"><h2>الأجور والإيجارات وأيام العمل — إدخال يدوي</h2>{msg&&<p className="muted">{msg}</p>}<div className="manual-grid">{branches.filter(b=>!branchId||b.id===branchId).map(b=>{const s=settings.find(x=>x.branch_id===b.id);return <div className="manual-row" key={b.id}><b>{b.name}</b><label>الأجور<input id={'w-'+b.id} type="number" min="0" defaultValue={Number(s?.wages||0)}/></label><label>الإيجار<input id={'r-'+b.id} type="number" min="0" defaultValue={Number(s?.rent||0)}/></label><label>أيام العمل<input id={'d-'+b.id} type="number" min="1" max="31" defaultValue={Number(s?.working_days_basis||30)}/></label><button className="small-btn" onClick={()=>save(b)}>حفظ</button></div>})}</div></section>}
  <DataTable title="المصروفات حسب التصنيف" rows={grouped} columns={[{key:'category',label:'التصنيف'},{key:'total',label:'الإجمالي',numeric:true,render:r=>money(r.total)}]}/>
  <DataTable title="تفاصيل المصروفات" rows={rows.map(r=>({...r,branch:branchMap.get(r.branchId)||'—'}))} columns={[{key:'date',label:'التاريخ'},{key:'branch',label:'الفرع'},{key:'category',label:'التصنيف'},{key:'group',label:'المجموعة'},{key:'type',label:'النوع'},{key:'source',label:'المصدر'},{key:'amount',label:'القيمة',numeric:true,render:r=>money(r.amount)}]}/>
 </div>
}
