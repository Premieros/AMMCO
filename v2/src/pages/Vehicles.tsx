import {FormEvent,useEffect,useMemo,useState} from 'react'
import type {Branch} from '../domain/types'
import {getVehicles,parseVehicleReport,saveVehicleAssignment,uploadPetroUp,uploadVehicleReport} from '../data/vehicles'
import {DataTable} from '../components/DataTable'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
export function Vehicles({from,to,month,branchId,branches,isAdmin}:{from:string;to:string;month:string;branchId?:string;branches:Branch[];isAdmin:boolean}){
 const [rows,setRows]=useState<any[]>([]),[msg,setMsg]=useState('')
 const [activeTab,setActiveTab]=useState<'movements'|'petro'|'branch-upload'|'assignment'>('movements')
 const map=useMemo(()=>new Map(branches.map(b=>[b.id,b.name])),[branches])
 const load=()=>getVehicles({from,to,branchId}).then(setRows).catch(e=>setMsg(e.message||String(e)))
 useEffect(()=>{void load()},[from,to,branchId])
 async function petro(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget),file=f.get('file');if(!(file instanceof File))return;try{setMsg('جاري قراءة التقرير…');const parsed=await parseVehicleReport(file);setMsg('تم العثور على '+parsed.length+' حركة — جاري الحفظ…');const out=await uploadPetroUp(month,parsed);setMsg('تم استيراد '+out.inserted+' حركة. غير موزعة: '+(out.unassigned?.length||0));load()}catch(x:any){setMsg(x.message||String(x))}}
 async function assign(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{await saveVehicleAssignment({branchId:String(f.get('branch_id')),month,vehicleLabel:String(f.get('vehicle_label')),repName:String(f.get('rep_name'))});setMsg('تم ربط السيارة بالمندوب');load()}catch(x:any){setMsg(x.message||String(x))}}
 async function vehicleFile(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget),file=f.get('file');if(!(file instanceof File))return;try{setMsg('جاري قراءة تقرير السيارة…');const parsed=await parseVehicleReport(file);if(!parsed.length)throw new Error('لم أتعرف على التقرير');const out=await uploadVehicleReport(String(f.get('branch_id')),month,parsed);setMsg('تم استيراد '+out.inserted+' حركة سيارة. سيارات بدون مندوب: '+(out.unassigned?.length||0));(e.currentTarget as HTMLFormElement).reset();load()}catch(x:any){setMsg(x.message||String(x))}}
 return <div>
  <div className="subpage-tabs no-print">
   <button className={activeTab==='movements'?'active':''} onClick={()=>setActiveTab('movements')}>الحركات</button>
   {isAdmin&&<button className={activeTab==='petro'?'active':''} onClick={()=>setActiveTab('petro')}>رفع بترو أب</button>}
   {isAdmin&&<button className={activeTab==='branch-upload'?'active':''} onClick={()=>setActiveTab('branch-upload')}>رفع سيارة</button>}
   {isAdmin&&<button className={activeTab==='assignment'?'active':''} onClick={()=>setActiveTab('assignment')}>ربط سيارة</button>}
  </div>
  {msg&&<div className="panel"><p className="muted">{msg}</p></div>}
  {activeTab==='movements'&&<DataTable title="حركات السيارات" rows={rows.map(r=>({...r,branch:map.get(r.branch_id)||'—',petro:r.raw_payload?.non_cash?'بترو اب':'سيارة'}))} columns={[{key:'business_date',label:'التاريخ'},{key:'branch',label:'الفرع'},{key:'vehicle_label',label:'السيارة'},{key:'rep_name',label:'المندوب'},{key:'driver_name',label:'السائق'},{key:'fuel_expense',label:'سولار',numeric:true,render:r=>money(r.fuel_expense)},{key:'maintenance_expense',label:'صيانة',numeric:true,render:r=>money(r.maintenance_expense)},{key:'other_expense',label:'أخرى',numeric:true,render:r=>money(r.other_expense)},{key:'petro',label:'المصدر'}]}/>}
  {activeTab==='petro'&&isAdmin&&<section className="panel"><h2>رفع تقرير بترو اب — كل الفروع</h2><form className="upload-form" onSubmit={petro}><label>التقرير<input name="file" type="file" accept=".xlsx,.xls,.csv" required/></label><button className="primary">رفع وتوزيع</button></form></section>}
  {activeTab==='branch-upload'&&isAdmin&&<section className="panel"><h2>رفع تقرير سيارة لفرع</h2><form className="upload-form" onSubmit={vehicleFile}><label>الفرع<select name="branch_id" required><option value="">اختر</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>الملف<input name="file" type="file" accept=".xlsx,.xls,.csv" required/></label><button className="primary">رفع وربط التقرير</button></form></section>}
  {activeTab==='assignment'&&isAdmin&&<section className="panel"><h2>ربط سيارة بمندوب</h2><form className="upload-form" onSubmit={assign}><label>الفرع<select name="branch_id" required><option value="">اختر</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>السيارة<input name="vehicle_label" required/></label><label>المندوب<input name="rep_name" required/></label><button className="primary">حفظ الربط</button></form></section>}
 </div>
}
