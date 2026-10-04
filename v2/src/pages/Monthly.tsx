import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
import {fetchAllPages} from '../data/pagination'
import {getApprovedBatchIds} from '../data/core'
import {DataTable} from '../components/DataTable'
const ZERO='00000000-0000-0000-0000-000000000000'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const pct=(n:number)=>(n*100).toFixed(1)+'%'
export function Monthly({year,branchId}:{year:string;branchId?:string}){
 const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let live=true;(async()=>{try{
  const ids=await getApprovedBatchIds(),safe=ids.length?ids:[ZERO],from=year+'-01-01',to=year+'-12-31'
  const [daily,wh,exp]=await Promise.all([
   fetchAllPages<any>((a,b)=>{let q=supabase.from('v_branch_daily_kpis').select('branch_id,business_date,gross_sales,net_sales,discounts,collections,closing_receivables').gte('business_date',from).lte('business_date',to);if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)}),
   fetchAllPages<any>((a,b)=>{let q=supabase.from('warehouse_daily_summary').select('branch_id,business_date,closing_value').in('batch_id',safe).gte('business_date',from).lte('business_date',to);if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)}),
   fetchAllPages<any>((a,b)=>{let q=supabase.from('v_expense_analysis').select('branch_id,entry_date,amount').gte('entry_date',from).lte('entry_date',to);if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)})
  ])
  const by=new Map<string,any>(),lastDebt=new Map<string,any>(),lastInv=new Map<string,any>()
  for(const r of daily){const m=r.business_date.slice(0,7),x=by.get(m)||{month:m,gross:0,net:0,disc:0,coll:0,exp:0,debt:0,inv:0};x.gross+=Number(r.gross_sales||0);x.net+=Number(r.net_sales||0);x.disc+=Number(r.discounts||0);x.coll+=Number(r.collections||0);by.set(m,x);const k=m+'|'+r.branch_id,p=lastDebt.get(k);if(!p||r.business_date>=p.date)lastDebt.set(k,{date:r.business_date,value:Number(r.closing_receivables||0)})}
  for(const r of wh){const m=r.business_date.slice(0,7),k=m+'|'+r.branch_id,p=lastInv.get(k);if(!p||r.business_date>=p.date)lastInv.set(k,{date:r.business_date,value:Number(r.closing_value||0)})}
  for(const r of exp){const m=r.entry_date.slice(0,7),x=by.get(m)||{month:m,gross:0,net:0,disc:0,coll:0,exp:0,debt:0,inv:0};x.exp+=Number(r.amount||0);by.set(m,x)}
  lastDebt.forEach((v,k)=>{const x=by.get(k.slice(0,7));if(x)x.debt+=v.value});lastInv.forEach((v,k)=>{const x=by.get(k.slice(0,7));if(x)x.inv+=v.value})
  let ytd=0;const out=[...by.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(x=>{ytd+=x.net;return{...x,ytd}})
  if(live)setRows(out)
 }catch(e:any){if(live)setError(e.message||String(e))}finally{if(live)setLoading(false)}})();return()=>{live=false}},[year,branchId])
 if(loading)return <div className="panel loading">جاري تحميل التحليل الشهري…</div>
 return <div>{error&&<div className="error-box">{error}</div>}<DataTable title={'التحليل الشهري وYTD — '+year} rows={rows} columns={[{key:'month',label:'الشهر'},{key:'gross',label:'قبل الخصم',numeric:true,render:r=>money(r.gross)},{key:'disc',label:'الخصم',numeric:true,render:r=>money(r.disc)},{key:'discRate',label:'% الخصم',render:r=>pct(r.gross?r.disc/r.gross:0)},{key:'net',label:'صافي المبيعات',numeric:true,render:r=>money(r.net)},{key:'coll',label:'التحصيل',numeric:true,render:r=>money(r.coll)},{key:'exp',label:'المصروفات',numeric:true,render:r=>money(r.exp)},{key:'debt',label:'مديونية آخر الشهر',numeric:true,render:r=>money(r.debt)},{key:'inv',label:'مخزون آخر الشهر',numeric:true,render:r=>money(r.inv)},{key:'ytd',label:'YTD',numeric:true,render:r=>money(r.ytd)}]}/></div>
}
