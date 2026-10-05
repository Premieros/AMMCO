import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
import {fetchAllPages} from '../data/pagination'
import {getApprovedBatchIds} from '../data/core'
import {DataTable} from '../components/DataTable'
const ZERO='00000000-0000-0000-0000-000000000000'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const qty=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)
const pct=(n:number)=>(n*100).toFixed(1)+'%'

export function FuelAnalysis({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let live=true;(async()=>{try{
  const ids=await getApprovedBatchIds(),safe=ids.length?ids:[ZERO]
  const [sales,assignments,vehicles,branches]=await Promise.all([
   fetchAllPages<any>((a,b)=>{let q=supabase.from('sales_rep_daily').select('branch_id,rep_name,sales_before_discount,discounts,net_after_discount,raw_payload').in('batch_id',safe).gte('business_date',from).lte('business_date',to);if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)}),
   fetchAllPages<any>((a,b)=>{let q=supabase.from('vehicle_daily').select('id,branch_id,business_date,vehicle_label,rep_name,raw_payload').in('batch_id',safe).contains('raw_payload',{manual_assignment:true}).order('id',{ascending:false});if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)}),
   fetchAllPages<any>((a,b)=>{let q=supabase.from('vehicle_daily').select('branch_id,business_date,vehicle_label,rep_name,fuel_expense,other_expense,raw_payload').in('batch_id',safe).gte('business_date',from).lte('business_date',to).contains('raw_payload',{non_cash:true});if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)}),
   fetchAllPages<any>((a,b)=>supabase.from('branches').select('id,name').eq('is_active',true).range(a,b))
  ])
  const names=new Map(branches.map(x=>[x.id,x.name])),latest=new Map<string,any>(),repAgg=new Map<string,any>(),petroByVehicle=new Map<string,number>()
  for(const a of assignments){if(!a.rep_name||!a.vehicle_label)continue;const k=a.branch_id+'|'+a.vehicle_label;if(!latest.has(k))latest.set(k,a)}
  for(const r of sales){const k=r.branch_id+'|'+String(r.rep_name||'').trim(),x=repAgg.get(k)||{gross:0,discount:0,net:0,equiv:0};x.gross+=Number(r.sales_before_discount||0);x.discount+=Number(r.discounts||0);x.net+=Number(r.net_after_discount||0);x.equiv+=Number(r.raw_payload?.equivalent_sales_qty||0);repAgg.set(k,x)}
  for(const v of vehicles){const k=v.branch_id+'|'+String(v.vehicle_label||'').trim();petroByVehicle.set(k,(petroByVehicle.get(k)||0)+Number(v.fuel_expense||0)+Number(v.other_expense||0))}
  const refCovered=from<='2026-09-01'&&to>='2026-09-28'
  const out=[...latest.values()].map(a=>{const ar=a.raw_payload?.analysis_report||{},s=repAgg.get(a.branch_id+'|'+String(a.rep_name||'').trim())||{gross:0,discount:0,net:0,equiv:0},carKey=a.branch_id+'|'+String(a.vehicle_label||'').trim(),hasLive=petroByVehicle.has(carKey),petro=hasLive?Number(petroByVehicle.get(carKey)||0):(refCovered?Number(ar.petro_up_reference||0):0),cash=refCovered?Number(ar.cash_fuel||0):0,total=petro+cash,target=Number(ar.target||0);return{vehicle:a.vehicle_label,branch:names.get(a.branch_id)||'—',rep:a.rep_name||'—',saleType:ar.sale_type||'—',petro,cash,total,fuelRate:s.net?total/s.net:0,fuelPerCarton:s.equiv?total/s.equiv:0,target,gross:s.gross,discount:s.discount,net:s.net,cartons:s.equiv,avgPrice:s.equiv?s.net/s.equiv:0,achievement:target?s.net/target:0,source:hasLive?'مصادر موحدة':'مرجع 28/9 + مصادر موحدة'}})
  out.sort((a,b)=>a.branch.localeCompare(b.branch,'ar')||a.rep.localeCompare(b.rep,'ar'))
  if(live)setRows(out)
 }catch(e:any){if(live)setError(e.message||String(e))}finally{if(live)setLoading(false)}})();return()=>{live=false}},[from,to,branchId])
 if(loading)return <div className="panel loading">جاري تحميل تحليلي السولار والسيارات…</div>
 return <div>{error&&<div className="error-box">{error}</div>}<DataTable title="تحليلي السولار والسيارات" rows={rows} columns={[{key:'vehicle',label:'السيارة'},{key:'branch',label:'الفرع'},{key:'rep',label:'المندوب'},{key:'saleType',label:'نوع البيع'},{key:'petro',label:'بترو أب غير نقدي',numeric:true,render:r=>money(r.petro)},{key:'cash',label:'سولار نقدي',numeric:true,render:r=>money(r.cash)},{key:'total',label:'إجمالي السولار',numeric:true,render:r=>money(r.total)},{key:'fuelRate',label:'نسبة السولار',render:r=>pct(r.fuelRate)},{key:'fuelPerCarton',label:'نصيب الكرتونة',numeric:true,render:r=>money(r.fuelPerCarton)},{key:'target',label:'التارجت',numeric:true,render:r=>money(r.target)},{key:'gross',label:'قبل الخصم',numeric:true,render:r=>money(r.gross)},{key:'discount',label:'الخصم',numeric:true,render:r=>money(r.discount)},{key:'net',label:'البيع',numeric:true,render:r=>money(r.net)},{key:'cartons',label:'الكراتين',numeric:true,render:r=>qty(r.cartons)},{key:'avgPrice',label:'متوسط السعر',numeric:true,render:r=>money(r.avgPrice)},{key:'achievement',label:'تحقيق التارجت',render:r=>pct(r.achievement)},{key:'source',label:'المصدر'}]}/></div>
}
