import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
import {fetchAllPages} from '../data/pagination'
import {DataTable} from '../components/DataTable'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const pct=(n:number)=>(n*100).toFixed(1)+'%'
export function SalesDaily({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let live=true;(async()=>{try{const data=await fetchAllPages<any>((a,b)=>{let q=supabase.from('v_branch_daily_kpis').select('branch_id,branch_name,business_date,gross_sales,discounts,net_sales,collections,expenses').gte('business_date',from).lte('business_date',to).order('business_date');if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)});if(live)setRows(data)}catch(e:any){if(live)setError(e.message||String(e))}finally{if(live)setLoading(false)}})();return()=>{live=false}},[from,to,branchId])
 if(loading)return <div className="panel loading">جاري تحميل المبيعات اليومية…</div>
 return <div>{error&&<div className="error-box">{error}</div>}<DataTable title="المبيعات اليومية" rows={rows.map(r=>({...r,discount_rate:Number(r.gross_sales||0)?Number(r.discounts||0)/Number(r.gross_sales||0):0}))} columns={[{key:'business_date',label:'التاريخ'},{key:'branch_name',label:'الفرع'},{key:'gross_sales',label:'قبل الخصم',numeric:true,render:r=>money(r.gross_sales)},{key:'discounts',label:'الخصم',numeric:true,render:r=>money(r.discounts)},{key:'discount_rate',label:'% الخصم',render:r=>pct(r.discount_rate)},{key:'net_sales',label:'صافي البيع',numeric:true,render:r=>money(r.net_sales)},{key:'collections',label:'التحصيل',numeric:true,render:r=>money(r.collections)},{key:'expenses',label:'المصروفات',numeric:true,render:r=>money(r.expenses)}]}/></div>
}
