import {useEffect,useState} from 'react'
import {getRepSummaries,type RepSummary} from '../data/reps'
import {DataTable} from '../components/DataTable'

const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const qty=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)
const pct=(n:number)=>(n*100).toFixed(1)+'%'

export function Reps({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [rows,setRows]=useState<RepSummary[]>([])
 const [error,setError]=useState('')
 const [loading,setLoading]=useState(true)
 useEffect(()=>{let live=true;setLoading(true);setError('');getRepSummaries({from,to,branchId}).then(x=>{if(live)setRows(x.reps)}).catch(e=>live&&setError(e.message||String(e))).finally(()=>live&&setLoading(false));return()=>{live=false}},[from,to,branchId])
 if(error)return <div className="error-box">{error}</div>
 if(loading)return <div className="panel loading">جاري تحميل بيانات المناديب…</div>
 return <DataTable<RepSummary> title="أداء المناديب" rows={rows} columns={[
  {key:'branchName',label:'الفرع'},{key:'repName',label:'المندوب'},
  {key:'grossSales',label:'قبل الخصم',numeric:true,render:r=>money(r.grossSales)},
  {key:'discounts',label:'الخصم',numeric:true,render:r=>money(r.discounts)},
  {key:'netSales',label:'صافي البيع',numeric:true,render:r=>money(r.netSales)},
  {key:'equivalentQty',label:'الكمية المكافئة',numeric:true,render:r=>qty(r.equivalentQty)},
  {key:'avgPrice',label:'متوسط السعر',numeric:true,render:r=>money(r.avgPrice)},
  {key:'openingDebt',label:'مديونية أول',numeric:true,render:r=>money(r.openingDebt)},
  {key:'deposits',label:'التوريد',numeric:true,render:r=>money(r.deposits)},
  {key:'closingDebt',label:'مديونية آخر',numeric:true,render:r=>money(r.closingDebt)},
  {key:'collectionRate',label:'% التحصيل',render:r=>pct(r.collectionRate)},
 ]}/>
}
