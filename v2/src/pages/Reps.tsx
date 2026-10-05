import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabase'
import {getRepSummaries,type RepSummary} from '../data/reps'
import {saveVehicleAssignment} from '../data/vehicles'
import {DataTable} from '../components/DataTable'

const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const qty=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)
const pct=(n:number)=>(n*100).toFixed(1)+'%'

export function Reps({from,to,branchId,isAdmin=false,month}:{from:string;to:string;branchId?:string;isAdmin?:boolean;month?:string}){
 const [rows,setRows]=useState<RepSummary[]>([])
 const [assignments,setAssignments]=useState<any[]>([])
 const [error,setError]=useState('')
 const [loading,setLoading]=useState(true)
 const [msg,setMsg]=useState('')
 const activeMonth=month||from.slice(0,7)

 async function load(){
  setLoading(true);setError('')
  try{
   const [summary,{data,error:assignError}]=await Promise.all([
    getRepSummaries({from,to,branchId}),
    (()=>{let q=supabase.from('vehicle_daily').select('id,branch_id,vehicle_label,rep_name,raw_payload').contains('raw_payload',{manual_assignment:true}).order('id',{ascending:false});if(branchId)q=q.eq('branch_id',branchId);return q})()
   ])
   if(assignError)throw assignError
   setRows(summary.reps);setAssignments(data||[])
  }catch(e:any){setError(e.message||String(e))}finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[from,to,branchId])

 const latestByRep=useMemo(()=>{const m=new Map<string,any>();for(const a of assignments){if(!a.rep_name)continue;const k=a.branch_id+'|'+a.rep_name;if(!m.has(k))m.set(k,a)}return m},[assignments])

 async function save(row:RepSummary,id:string){
  const el=document.getElementById(id) as HTMLInputElement|null
  const vehicleLabel=el?.value.trim()||''
  if(!vehicleLabel)return
  try{setMsg('جاري حفظ ربط السيارة…');await saveVehicleAssignment({branchId:row.branchId,month:activeMonth,vehicleLabel,repName:row.repName});setMsg('تم حفظ ربط السيارة');await load()}catch(e:any){setMsg(e.message||String(e))}
 }

 if(error)return <div className="error-box">{error}</div>
 if(loading)return <div className="panel loading">جاري تحميل بيانات المناديب…</div>
 const decorated=rows.map((r,i)=>({...r,vehicle:latestByRep.get(r.branchId+'|'+r.repName)?.vehicle_label||'',inputId:'rep-vehicle-'+i}))
 return <div>{msg&&<div className="panel"><p className="muted">{msg}</p></div>}<DataTable<any> title="أداء المناديب" rows={decorated} columns={[
  {key:'branchName',label:'الفرع'},{key:'repName',label:'المندوب'},
  {key:'vehicle',label:'السيارة',filter:false,render:r=>isAdmin?<div className="inline-car-editor"><input id={r.inputId} defaultValue={r.vehicle} placeholder="اكتب السيارة"/><button className="small-btn" onClick={()=>save(r,r.inputId)}>حفظ</button></div>:(r.vehicle||'—')},
  {key:'grossSales',label:'قبل الخصم',numeric:true,render:r=>money(r.grossSales)},
  {key:'discounts',label:'الخصم',numeric:true,render:r=>money(r.discounts)},
  {key:'netSales',label:'صافي البيع',numeric:true,render:r=>money(r.netSales)},
  {key:'equivalentQty',label:'الكمية المكافئة',numeric:true,render:r=>qty(r.equivalentQty)},
  {key:'avgPrice',label:'متوسط السعر',numeric:true,render:r=>money(r.avgPrice)},
  {key:'openingDebt',label:'مديونية أول',numeric:true,render:r=>money(r.openingDebt)},
  {key:'deposits',label:'التوريد',numeric:true,render:r=>money(r.deposits)},
  {key:'closingDebt',label:'مديونية آخر',numeric:true,render:r=>money(r.closingDebt)},
  {key:'collectionRate',label:'% التحصيل',render:r=>pct(r.collectionRate)},
 ]}/></div>
}
