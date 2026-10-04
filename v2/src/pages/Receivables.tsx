import {useEffect,useState} from 'react'
import {getRepSummaries,type ReceivableSummary} from '../data/reps'
import {DataTable} from '../components/DataTable'

const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const pct=(n:number)=>(n*100).toFixed(1)+'%'

export function Receivables({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [rows,setRows]=useState<ReceivableSummary[]>([])
 const [error,setError]=useState('')
 const [loading,setLoading]=useState(true)
 useEffect(()=>{let live=true;setLoading(true);setError('');getRepSummaries({from,to,branchId}).then(x=>{if(live)setRows(x.receivables)}).catch(e=>live&&setError(e.message||String(e))).finally(()=>live&&setLoading(false));return()=>{live=false}},[from,to,branchId])
 if(error)return <div className="error-box">{error}</div>
 if(loading)return <div className="panel loading">جاري تحميل المديونية والتحصيل…</div>
 return <DataTable<ReceivableSummary> title="المديونية والتحصيل حسب الفرع" rows={rows} columns={[
  {key:'branchName',label:'الفرع'},
  {key:'openingDebt',label:'افتتاحي المديونية',numeric:true,render:r=>money(r.openingDebt)},
  {key:'netSales',label:'صافي المبيعات',numeric:true,render:r=>money(r.netSales)},
  {key:'deposits',label:'التحصيل / التوريد',numeric:true,render:r=>money(r.deposits)},
  {key:'closingDebt',label:'مديونية آخر',numeric:true,render:r=>money(r.closingDebt)},
  {key:'collectionRate',label:'% التحصيل',render:r=>pct(r.collectionRate)}
 ]}/>
}
