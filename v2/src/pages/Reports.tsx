import {useEffect,useState} from 'react'
import {getBranchReport,type BranchReport} from '../data/reports'
import {DataTable} from '../components/DataTable'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const qty=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)
export function Reports({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [rows,setRows]=useState<BranchReport[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let live=true;setLoading(true);getBranchReport({from,to,branchId}).then(x=>live&&setRows(x)).catch(e=>live&&setError(e.message||String(e))).finally(()=>live&&setLoading(false));return()=>{live=false}},[from,to,branchId])
 if(loading)return <div className="panel loading">جاري تحميل التقرير المجمع…</div>
 return <div>{error&&<div className="error-box">{error}</div>}<DataTable title="التقرير المجمع" rows={rows} columns={[{key:'branchName',label:'الفرع'},{key:'net',label:'المبيعات',numeric:true,render:r=>money(r.net)},{key:'collections',label:'التوريد',numeric:true,render:r=>money(r.collections)},{key:'closingDebt',label:'المديونية',numeric:true,render:r=>money(r.closingDebt)},{key:'discounts',label:'الخصم',numeric:true,render:r=>money(r.discounts)},{key:'equivQty',label:'الكمية المكافئة',numeric:true,render:r=>qty(r.equivQty)},{key:'avgPrice',label:'متوسط السعر',numeric:true,render:r=>money(r.avgPrice)},{key:'expenses',label:'المصروفات',numeric:true,render:r=>money(r.expenses)},{key:'inventoryValue',label:'قيمة المخزون',numeric:true,render:r=>money(r.inventoryValue)}]}/></div>
}
