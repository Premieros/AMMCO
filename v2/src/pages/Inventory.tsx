import {useEffect,useState} from 'react'
import {DataTable} from '../components/DataTable'
import {getInventory,type InventoryRow} from '../data/inventory'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const qty=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)
export function Inventory({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [rows,setRows]=useState<InventoryRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let live=true;setLoading(true);getInventory({from,to,branchId}).then(x=>live&&setRows(x)).catch(e=>live&&setError(e.message||String(e))).finally(()=>live&&setLoading(false));return()=>{live=false}},[from,to,branchId])
 if(loading)return <div className="panel loading">جاري تحميل المخزون…</div>
 return <div>{error&&<div className="error-box">{error}</div>}<DataTable title="المخزون حسب الفرع" rows={rows} columns={[{key:'branchName',label:'الفرع'},{key:'salesQty',label:'كمية المبيعات',numeric:true,render:r=>qty(r.salesQty)},{key:'closingQty',label:'رصيد المخزون',numeric:true,render:r=>qty(r.closingQty)},{key:'closingValue',label:'قيمة المخزون',numeric:true,render:r=>money(r.closingValue)},{key:'date',label:'تاريخ الرصيد'}]}/></div>
}
