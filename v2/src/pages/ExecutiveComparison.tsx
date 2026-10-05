import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
import {fetchAllPages} from '../data/pagination'
import {getApprovedBatchIds} from '../data/core'
import {DataTable} from '../components/DataTable'

const ZERO='00000000-0000-0000-0000-000000000000'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const qty=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)
const pct=(n:number)=>(n*100).toFixed(1)+'%'
const prevMonth=(from:string)=>{const d=new Date(from+'T00:00:00Z'),p=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1)),y=p.getUTCFullYear(),m=p.getUTCMonth()+1,last=new Date(Date.UTC(y,m,0)).getUTCDate();return {from:y+'-'+String(m).padStart(2,'0')+'-01',to:y+'-'+String(m).padStart(2,'0')+'-'+String(last).padStart(2,'0')}}

export function ExecutiveComparison({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let live=true;(async()=>{try{
  const prev=prevMonth(from),ytdFrom=to.slice(0,4)+'-01-01',ids=await getApprovedBatchIds(),safe=ids.length?ids:[ZERO]
  const loadDaily=(a:string,b:string)=>fetchAllPages<any>((x,y)=>{let q=supabase.from('v_branch_daily_kpis').select('branch_id,branch_name,business_date,gross_sales,net_sales,discounts,collections,opening_receivables,closing_receivables,expenses').gte('business_date',a).lte('business_date',b).order('business_date');if(branchId)q=q.eq('branch_id',branchId);return q.range(x,y)})
  const [cur,old,ytd,wh]=await Promise.all([
   loadDaily(from,to),loadDaily(prev.from,prev.to),
   fetchAllPages<any>((a,b)=>{let q=supabase.from('v_branch_daily_kpis').select('branch_id,net_sales').gte('business_date',ytdFrom).lte('business_date',to);if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)}),
   fetchAllPages<any>((a,b)=>{let q=supabase.from('warehouse_daily_summary').select('branch_id,business_date,closing_qty,closing_value').in('batch_id',safe).gte('business_date',from).lte('business_date',to).order('business_date');if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)})
  ])
  const m=new Map<string,any>()
  for(const d of cur){const id=d.branch_id,x=m.get(id)||{branchId:id,branchName:d.branch_name||'—',gross:0,net:0,discounts:0,collections:0,expenses:0,openingDebt:0,closingDebt:0,first:'',last:'',prevNet:0,ytdNet:0,stockQty:0,stockValue:0,lastStock:''};const date=String(d.business_date);if(!x.first||date<x.first){x.first=date;x.openingDebt=Number(d.opening_receivables||0)}if(!x.last||date>=x.last){x.last=date;x.closingDebt=Number(d.closing_receivables||0)}x.gross+=Number(d.gross_sales||0);x.net+=Number(d.net_sales||0);x.discounts+=Number(d.discounts||0);x.collections+=Number(d.collections||0);x.expenses+=Number(d.expenses||0);m.set(id,x)}
  for(const d of old){const x=m.get(d.branch_id);if(x)x.prevNet+=Number(d.net_sales||0)}
  for(const d of ytd){const x=m.get(d.branch_id);if(x)x.ytdNet+=Number(d.net_sales||0)}
  for(const w of wh){const x=m.get(w.branch_id);if(x&&(!x.lastStock||String(w.business_date)>=x.lastStock)){x.lastStock=String(w.business_date);x.stockQty=Number(w.closing_qty||0);x.stockValue=Number(w.closing_value||0)}}
  if(live)setRows([...m.values()].map(x=>({...x,discountRate:x.gross?x.discounts/x.gross:0,expenseRate:x.net?x.expenses/x.net:0,change:x.prevNet?(x.net-x.prevNet)/Math.abs(x.prevNet):0})).sort((a,b)=>b.net-a.net))
 }catch(e:any){if(live)setError(e.message||String(e))}finally{if(live)setLoading(false)}})();return()=>{live=false}},[from,to,branchId])
 if(loading)return <div className="panel loading">جاري تحميل المقارنة التنفيذية…</div>
 return <div>{error&&<div className="error-box">{error}</div>}<DataTable title="المقارنة التنفيذية للفروع" rows={rows} columns={[
  {key:'branchName',label:'الفرع'},{key:'gross',label:'قبل الخصم',numeric:true,render:r=>money(r.gross)},{key:'discounts',label:'الخصم',numeric:true,render:r=>money(r.discounts)},{key:'discountRate',label:'% الخصم',render:r=>pct(r.discountRate)},{key:'net',label:'صافي البيع',numeric:true,render:r=>money(r.net)},{key:'collections',label:'التحصيل',numeric:true,render:r=>money(r.collections)},{key:'openingDebt',label:'مديونية أول',numeric:true,render:r=>money(r.openingDebt)},{key:'closingDebt',label:'مديونية آخر',numeric:true,render:r=>money(r.closingDebt)},{key:'expenses',label:'المصروفات',numeric:true,render:r=>money(r.expenses)},{key:'expenseRate',label:'% المصروفات',render:r=>pct(r.expenseRate)},{key:'prevNet',label:'الشهر السابق',numeric:true,render:r=>money(r.prevNet)},{key:'change',label:'التغير',render:r=>pct(r.change)},{key:'ytdNet',label:'YTD',numeric:true,render:r=>money(r.ytdNet)},{key:'stockQty',label:'كمية المخزون',numeric:true,render:r=>qty(r.stockQty)},{key:'stockValue',label:'قيمة المخزون',numeric:true,render:r=>money(r.stockValue)}
 ]}/></div>
}
