import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
import {fetchAllPages} from '../data/pagination'
import {getApprovedBatchIds} from '../data/core'
import {DataTable} from '../components/DataTable'
const ZERO='00000000-0000-0000-0000-000000000000'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const qty=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)

export function RepDaily({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let live=true;(async()=>{
  try{
   const ids=await getApprovedBatchIds(),safe=ids.length?ids:[ZERO]
   const [sales,vehicles,branches]=await Promise.all([
    fetchAllPages<any>((a,b)=>{let q=supabase.from('sales_rep_daily').select('branch_id,business_date,rep_name,sales_before_discount,discounts,net_after_discount,deposit_amount,expense_amount,closing_balance,raw_payload').in('batch_id',safe).gte('business_date',from).lte('business_date',to).order('business_date');if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)}),
    fetchAllPages<any>((a,b)=>{let q=supabase.from('vehicle_daily').select('branch_id,business_date,vehicle_label,rep_name,fuel_expense,maintenance_expense,other_expense,raw_payload').in('batch_id',safe).gte('business_date',from).lte('business_date',to);if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)}),
    fetchAllPages<any>((a,b)=>supabase.from('branches').select('id,name').eq('is_active',true).range(a,b))
   ])
   const names=new Map(branches.map(x=>[x.id,x.name])),vm=new Map<string,any>()
   for(const v of vehicles){const k=v.branch_id+'|'+v.business_date+'|'+String(v.rep_name||'').trim(),x=vm.get(k)||{cars:new Set<string>(),fuel:0,liters:0,maintenance:0,other:0};if(v.vehicle_label)x.cars.add(v.vehicle_label);x.fuel+=Number(v.fuel_expense||0);x.liters+=Number(v.raw_payload?.fuel_liters||0);x.maintenance+=Number(v.maintenance_expense||0);x.other+=Number(v.other_expense||0);vm.set(k,x)}
   const out=sales.map(r=>{const v=vm.get(r.branch_id+'|'+r.business_date+'|'+String(r.rep_name||'').trim())||{cars:new Set(),fuel:0,liters:0,maintenance:0,other:0};return{date:r.business_date,branch:names.get(r.branch_id)||'—',rep:r.rep_name,gross:Number(r.sales_before_discount||0),discount:Number(r.discounts||0),net:Number(r.net_after_discount||0),qty:Number(r.raw_payload?.equivalent_sales_qty||0),deposit:Number(r.deposit_amount||0),closing:Number(r.closing_balance||0),vehicle:[...v.cars].join('، '),fuel:v.fuel,fuelLiters:v.liters,maintenance:v.maintenance,vehicleOther:v.other}})
   if(live)setRows(out)
  }catch(e:any){if(live)setError(e.message||String(e))}finally{if(live)setLoading(false)}
 })();return()=>{live=false}},[from,to,branchId])
 if(loading)return <div className="panel loading">جاري تحميل يوميات المناديب…</div>
 return <div>{error&&<div className="error-box">{error}</div>}<DataTable title="يوميات المناديب" rows={rows} columns={[{key:'date',label:'التاريخ'},{key:'branch',label:'الفرع'},{key:'rep',label:'المندوب'},{key:'gross',label:'قبل الخصم',numeric:true,render:r=>money(r.gross)},{key:'discount',label:'الخصم',numeric:true,render:r=>money(r.discount)},{key:'net',label:'صافي البيع',numeric:true,render:r=>money(r.net)},{key:'qty',label:'الكمية المكافئة',numeric:true,render:r=>qty(r.qty)},{key:'deposit',label:'التوريد',numeric:true,render:r=>money(r.deposit)},{key:'closing',label:'الرصيد',numeric:true,render:r=>money(r.closing)},{key:'vehicle',label:'السيارة'},{key:'fuel',label:'تكلفة السولار',numeric:true,render:r=>money(r.fuel)},{key:'fuelLiters',label:'لترات السولار',numeric:true,render:r=>qty(r.fuelLiters)},{key:'maintenance',label:'الصيانة',numeric:true,render:r=>money(r.maintenance)},{key:'vehicleOther',label:'أخرى سيارات',numeric:true,render:r=>money(r.vehicleOther)}]}/></div>
}
