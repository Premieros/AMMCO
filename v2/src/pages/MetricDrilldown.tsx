import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
import {fetchAllPages} from '../data/pagination'
import {getApprovedBatchIds} from '../data/core'
import {DataTable} from '../components/DataTable'

const ZERO='00000000-0000-0000-0000-000000000000'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const qty=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)
type Metric='sales'|'gross'|'discounts'|'quantity'|'collections'|'receivables'|'inventory'|'reps'
const labels:Record<Metric,string>={sales:'صافي المبيعات',gross:'البيع قبل الخصم',discounts:'الخصومات',quantity:'كمية البيع',collections:'التحصيلات',receivables:'المديونيات',inventory:'المخزون',reps:'المناديب'}

export function MetricDrilldown({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [metric,setMetric]=useState<Metric>('sales'),[rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let live=true;(async()=>{setLoading(true);setError('');try{
  const ids=await getApprovedBatchIds(),safe=ids.length?ids:[ZERO]
  if(metric==='reps'){
   const data=await fetchAllPages<any>((a,b)=>{let q=supabase.from('sales_rep_daily').select('branch_id,business_date,rep_name,sales_before_discount,discounts,net_after_discount,deposit_amount,closing_balance,raw_payload,branches(name)').in('batch_id',safe).gte('business_date',from).lte('business_date',to).order('business_date',{ascending:false});if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)})
   if(live)setRows(data.map(r=>({date:r.business_date,branch:Array.isArray(r.branches)?r.branches[0]?.name:r.branches?.name||'—',rep:r.rep_name,gross:Number(r.sales_before_discount||0),discounts:Number(r.discounts||0),net:Number(r.net_after_discount||0),collections:Number(r.deposit_amount||0),closing:Number(r.closing_balance||0),qty:Number(r.raw_payload?.equivalent_sales_qty||0)})));return
  }
  if(metric==='inventory'||metric==='quantity'){
   const data=await fetchAllPages<any>((a,b)=>{let q=supabase.from('warehouse_daily_summary').select('branch_id,business_date,sales_qty,sales_value,closing_qty,closing_value,branches(name)').in('batch_id',safe).gte('business_date',from).lte('business_date',to).order('business_date',{ascending:false});if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)})
   if(live)setRows(data.map(r=>({date:r.business_date,branch:Array.isArray(r.branches)?r.branches[0]?.name:r.branches?.name||'—',salesQty:Number(r.sales_qty||0),salesValue:Number(r.sales_value||0),closingQty:Number(r.closing_qty||0),closingValue:Number(r.closing_value||0)})));return
  }
  const data=await fetchAllPages<any>((a,b)=>{let q=supabase.from('v_branch_daily_kpis').select('branch_id,branch_name,business_date,gross_sales,net_sales,discounts,collections,opening_receivables,closing_receivables,expenses').gte('business_date',from).lte('business_date',to).order('business_date',{ascending:false});if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)})
  if(live)setRows(data.map(r=>({date:r.business_date,branch:r.branch_name||'—',gross:Number(r.gross_sales||0),net:Number(r.net_sales||0),discounts:Number(r.discounts||0),collections:Number(r.collections||0),opening:Number(r.opening_receivables||0),closing:Number(r.closing_receivables||0),expenses:Number(r.expenses||0)})))
 }catch(e:any){if(live)setError(e.message||String(e))}finally{if(live)setLoading(false)}})();return()=>{live=false}},[metric,from,to,branchId])

 const common=[{key:'date',label:'التاريخ'},{key:'branch',label:'الفرع'}] as any[]
 let cols:any[]=common
 if(metric==='reps')cols=[...common,{key:'rep',label:'المندوب'},{key:'gross',label:'قبل الخصم',numeric:true,render:(r:any)=>money(r.gross)},{key:'discounts',label:'الخصم',numeric:true,render:(r:any)=>money(r.discounts)},{key:'net',label:'صافي البيع',numeric:true,render:(r:any)=>money(r.net)},{key:'qty',label:'الكمية المكافئة',numeric:true,render:(r:any)=>qty(r.qty)},{key:'collections',label:'التوريد',numeric:true,render:(r:any)=>money(r.collections)},{key:'closing',label:'الرصيد',numeric:true,render:(r:any)=>money(r.closing)}]
 else if(metric==='inventory'||metric==='quantity')cols=[...common,{key:'salesQty',label:'كمية المبيعات',numeric:true,render:(r:any)=>qty(r.salesQty)},{key:'salesValue',label:'قيمة المبيعات',numeric:true,render:(r:any)=>money(r.salesValue)},{key:'closingQty',label:'رصيد المخزون',numeric:true,render:(r:any)=>qty(r.closingQty)},{key:'closingValue',label:'قيمة المخزون',numeric:true,render:(r:any)=>money(r.closingValue)}]
 else cols=[...common,{key:'gross',label:'قبل الخصم',numeric:true,render:(r:any)=>money(r.gross)},{key:'discounts',label:'الخصم',numeric:true,render:(r:any)=>money(r.discounts)},{key:'net',label:'صافي البيع',numeric:true,render:(r:any)=>money(r.net)},{key:'collections',label:'التحصيل',numeric:true,render:(r:any)=>money(r.collections)},{key:'opening',label:'مديونية أول',numeric:true,render:(r:any)=>money(r.opening)},{key:'closing',label:'مديونية آخر',numeric:true,render:(r:any)=>money(r.closing)},{key:'expenses',label:'المصروفات',numeric:true,render:(r:any)=>money(r.expenses)}]

 return <div><section className="panel report-picker"><label>المؤشر<select value={metric} onChange={e=>setMetric(e.target.value as Metric)}>{(Object.keys(labels) as Metric[]).map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></label></section>{error&&<div className="error-box">{error}</div>}{loading?<div className="panel loading">جاري تحميل التفاصيل…</div>:<DataTable title={'تفاصيل '+labels[metric]} rows={rows} columns={cols}/>}</div>
}
