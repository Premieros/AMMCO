import {useEffect,useState} from 'react'
import {getBranchReport,type BranchReport} from '../data/reports'
import {DataTable} from '../components/DataTable'
import {SalesDaily} from './SalesDaily'
import {Receivables} from './Receivables'
import {Reps} from './Reps'
import {ExpenseMatrix} from './ExpenseMatrix'
import {FuelAnalysis} from './FuelAnalysis'
import {Inventory} from './Inventory'
import {Products} from './Products'
import {Monthly} from './Monthly'
import {Banks} from './Banks'

const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const qty=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)

type ReportId='executive'|'sales'|'receivables'|'reps'|'expense-matrix'|'fuel-analysis'|'inventory'|'products'|'monthly'|'banks'
const groups=[
 {label:'الإدارة المالية',items:[['executive','التقرير التنفيذي'],['monthly','التحليل الشهري وYTD']]},
 {label:'المبيعات والعملاء',items:[['sales','المبيعات اليومية'],['receivables','المديونيات والتحصيل'],['reps','أداء المناديب']]},
 {label:'المصروفات والتكاليف',items:[['fuel-analysis','تحليلي السولار والسيارات'],['expense-matrix','تحليلي المصروفات']]},
 {label:'المخزون والأصناف',items:[['inventory','حركة المخزون'],['products','أرصدة الأصناف']]},
 {label:'النقدية والبنوك',items:[['banks','البنوك وYTD']]}
] as const

function Executive({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [rows,setRows]=useState<BranchReport[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let live=true;setLoading(true);getBranchReport({from,to,branchId}).then(x=>live&&setRows(x)).catch(e=>live&&setError(e.message||String(e))).finally(()=>live&&setLoading(false));return()=>{live=false}},[from,to,branchId])
 if(loading)return <div className="panel loading">جاري تحميل التقرير التنفيذي…</div>
 return <div>{error&&<div className="error-box">{error}</div>}<DataTable title="التقرير التنفيذي" rows={rows} columns={[
  {key:'branchName',label:'الفرع'},
  {key:'openingDebt',label:'افتتاحي مديونية',numeric:true,render:r=>money(r.openingDebt)},
  {key:'net',label:'المبيعات',numeric:true,render:r=>money(r.net)},
  {key:'collections',label:'التحصيل',numeric:true,render:r=>money(r.collections)},
  {key:'monthDebt',label:'مديونية الشهر',numeric:true,render:r=>money(r.monthDebt)},
  {key:'closingDebt',label:'مديونية تراكمية',numeric:true,render:r=>money(r.closingDebt)},
  {key:'discounts',label:'الخصم',numeric:true,render:r=>money(r.discounts)},
  {key:'discountRate',label:'% الخصم',render:r=>(r.discountRate*100).toFixed(1)+'%'},
  {key:'equivQty',label:'الكمية المكافئة',numeric:true,render:r=>qty(r.equivQty)},
  {key:'avgPrice',label:'متوسط السعر',numeric:true,render:r=>money(r.avgPrice)},
  {key:'fuel',label:'م. سولار',numeric:true,render:r=>money(r.fuel)},
  {key:'petro',label:'بترو أب',numeric:true,render:r=>money(r.petro)},
  {key:'maintenance',label:'الصيانة',numeric:true,render:r=>money(r.maintenance)},
  {key:'inventoryQty',label:'كمية المخزون',numeric:true,render:r=>qty(r.inventoryQty)},
  {key:'inventoryValue',label:'قيمة المخزون',numeric:true,render:r=>money(r.inventoryValue)},
  {key:'closingCash',label:'رصيد الخزينة',numeric:true,render:r=>money(r.closingCash)},
  {key:'expenses',label:'المصروفات',numeric:true,render:r=>money(r.expenses)},
  {key:'expenseRate',label:'% المصروفات',render:r=>(r.expenseRate*100).toFixed(1)+'%'}
 ]}/></div>
}

export function Reports({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [report,setReport]=useState<ReportId>('executive')
 return <div>
  <section className="panel report-picker"><label>التقرير<select value={report} onChange={e=>setReport(e.target.value as ReportId)}>{groups.map(g=><optgroup key={g.label} label={g.label}>{g.items.map(([id,label])=><option key={id} value={id}>{label}</option>)}</optgroup>)}</select></label></section>
  {report==='executive'&&<Executive from={from} to={to} branchId={branchId}/>}
  {report==='sales'&&<SalesDaily from={from} to={to} branchId={branchId}/>}
  {report==='receivables'&&<Receivables from={from} to={to} branchId={branchId}/>}
  {report==='reps'&&<Reps from={from} to={to} branchId={branchId}/>}
  {report==='expense-matrix'&&<ExpenseMatrix from={from} to={to} branchId={branchId}/>}
  {report==='fuel-analysis'&&<FuelAnalysis from={from} to={to} branchId={branchId}/>}
  {report==='inventory'&&<Inventory from={from} to={to} branchId={branchId}/>}
  {report==='products'&&<Products from={from} to={to} branchId={branchId}/>}
  {report==='monthly'&&<Monthly year={from.slice(0,4)} branchId={branchId}/>}
  {report==='banks'&&<Banks from={from.slice(0,4)+'-01-01'} to={to} branchId={branchId}/>}
 </div>
}
