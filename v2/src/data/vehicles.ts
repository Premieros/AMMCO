import * as XLSX from 'xlsx'
import {supabase} from '../lib/supabase'
import {fetchAllPages} from './pagination'
import {getApprovedBatchIds} from './core'
const ZERO='00000000-0000-0000-0000-000000000000'

const norm=(v:any)=>String(v??'').replace(/\s+/g,'').replace(/أ|إ|آ/g,'ا').replace(/ة/g,'ه').toLowerCase()
const num=(v:any)=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0}
const date=(v:any)=>{
 if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString().slice(0,10)
 if(typeof v==='number'){const d=XLSX.SSF.parse_date_code(v);if(d)return String(d.y).padStart(4,'0')+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0')}
 const s=String(v??'').trim()
 let m=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/)
 if(m)return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0')
 m=s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/)
 if(m)return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0')
 return ''
}

export async function parseVehicleReport(file:File){
 const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true})
 const aliases:any={
  business_date:['التاريخ','تاريخ','date','اليوم'],
  vehicle_label:['المركبه','المركبة','السياره','سيارة','رقمالسياره','رقمسياره','car','vehicle','vehicleno'],
  driver_name:['قائدالمركبه','قائدالمركبة','السائق','سائق','السواق','driver'],
  fuel_expense:['التكلفه','التكلفة','سولار','الوقود','وقود','بنزين','fuel','diesel'],
  fuel_liters:['عدداللترات','اللترات','لترات','liters','litres'],
  fuel_price:['سعرالوقود','سعرالسولار','fuelprice'],
  invoice_no:['رقمالفاتوره','رقمالفاتورة','invoice'],
  station:['المحطه','المحطة','station'],
  payment_method:['طريقهالسداد','طريقةالسداد','paymentmethod'],
  service_fee:['اكراميهالعامل','إكراميةالعامل','رسومالخدمه','رسومالخدمة','servicefee'],
  maintenance_expense:['الصيانه','صيانه','maintenance','repair'],
  other_expense:['مصروفاتاخرى','مصروفاتاخري','اخري','اخرى','otherexpense'],
  sales:['المبيعات','مبيعات','البيع','بيع','sales'],
  opening_odometer:['عداداول','عدادالبدايه','عدادبدايه','openingodometer','startkm'],
  closing_odometer:['عدادالكيلومتر','عداداخر','عدادالنهايه','عدادنهايه','closingodometer','odometer','endkm']
 }
 const lookup=new Map<string,string>();Object.entries(aliases).forEach(([k,vals]:any)=>vals.forEach((v:string)=>lookup.set(norm(v),k)))
 const rows:any[]=[]
 for(const sheetName of wb.SheetNames){
  const aoa:any[][]=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,raw:true,defval:null})
  let header=-1,map:any={}
  for(let r=0;r<Math.min(aoa.length,20);r++){const candidate:any={};(aoa[r]||[]).forEach((v,i)=>{const k=lookup.get(norm(v));if(k)candidate[k]=i});if(candidate.vehicle_label!==undefined&&(candidate.business_date!==undefined||candidate.fuel_expense!==undefined)){header=r;map=candidate;break}}
  if(header<0)continue
  let lastVehicle=''
  for(let r=header+1;r<aoa.length;r++){
   const line=aoa[r]||[],val=(k:string)=>map[k]===undefined?null:line[map[k]]
   const vehicle=String(val('vehicle_label')??'').trim()||lastVehicle;if(vehicle)lastVehicle=vehicle
   const d=date(val('business_date'));if(!vehicle||!d)continue
   rows.push({business_date:d,vehicle_label:vehicle,driver_name:String(val('driver_name')??'').trim(),fuel_expense:num(val('fuel_expense')),maintenance_expense:num(val('maintenance_expense')),other_expense:num(val('other_expense'))+num(val('service_fee')),sales:num(val('sales')),fuel_liters:num(val('fuel_liters')),fuel_price:num(val('fuel_price')),invoice_no:String(val('invoice_no')??'').trim(),station:String(val('station')??'').trim(),payment_method:String(val('payment_method')??'').trim(),opening_odometer:map.opening_odometer===undefined?null:num(val('opening_odometer')),closing_odometer:map.closing_odometer===undefined?null:num(val('closing_odometer'))})
  }
 }
 return rows
}

async function adminCall(payload:any){
 const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('انتهت جلسة الدخول')
 const res=await fetch(import.meta.env.VITE_SUPABASE_URL+'/functions/v1/ammco-admin-vehicles',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(payload)})
 const out=await res.json();if(!res.ok)throw new Error(out.error||'تعذر تنفيذ العملية');return out
}
export const uploadPetroUp=(month:string,rows:any[])=>adminCall({action:'import_global',report_type:'petro_up_non_cash',month,rows})
export const saveVehicleAssignment=(input:{branchId:string;month:string;vehicleLabel:string;repName:string})=>adminCall({action:'assign',branch_id:input.branchId,month:input.month,vehicle_label:input.vehicleLabel,rep_name:input.repName})

export async function getVehicles(params:{from:string;to:string;branchId?:string}){
 const ids=await getApprovedBatchIds(),safe=ids.length?ids:[ZERO]
 return fetchAllPages<any>((a,b)=>{let q=supabase.from('vehicle_daily').select('id,branch_id,business_date,vehicle_label,rep_name,driver_name,fuel_expense,maintenance_expense,other_expense,total_expense,raw_payload').in('batch_id',safe).gte('business_date',params.from).lte('business_date',params.to).order('business_date');if(params.branchId)q=q.eq('branch_id',params.branchId);return q.range(a,b)})
}
