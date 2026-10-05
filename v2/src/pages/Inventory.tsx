import {useEffect,useState} from 'react'
import {DataTable} from '../components/DataTable'
import {getInventory,type InventoryRow} from '../data/inventory'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const qty=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)
export function Inventory({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [rows,setRows]=useState<InventoryRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let live=true;setLoading(true);getInventory({from,to,branchId}).then(x=>live&&setRows(x)).catch(e=>live&&setError(e.message||String(e))).finally(()=>live&&setLoading(false));return()=>{live=false}},[from,to,branchId])
 if(loading)return <div className="panel loading">جاري تحميل المخزون…</div>
 return <div>{error&&<div className="error-box">{error}</div>}<DataTable title="حركة المخزون" rows={rows} columns={[
  {key:'branchName',label:'الفرع'},
  {key:'openingQty',label:'افتتاحي كمية',numeric:true,render:r=>qty(r.openingQty)},{key:'openingValue',label:'افتتاحي قيمة',numeric:true,render:r=>money(r.openingValue)},
  {key:'incomingFactoryQty',label:'وارد مصنع كمية',numeric:true,render:r=>qty(r.incomingFactoryQty)},{key:'incomingFactoryValue',label:'وارد مصنع قيمة',numeric:true,render:r=>money(r.incomingFactoryValue)},
  {key:'incomingBranchesQty',label:'وارد فروع كمية',numeric:true,render:r=>qty(r.incomingBranchesQty)},{key:'incomingBranchesValue',label:'وارد فروع قيمة',numeric:true,render:r=>money(r.incomingBranchesValue)},
  {key:'salesQty',label:'مبيعات كمية',numeric:true,render:r=>qty(r.salesQty)},{key:'salesValue',label:'مبيعات قيمة',numeric:true,render:r=>money(r.salesValue)},
  {key:'bonusQty',label:'بونص كمية',numeric:true,render:r=>qty(r.bonusQty)},{key:'bonusValue',label:'بونص قيمة',numeric:true,render:r=>money(r.bonusValue)},
  {key:'giftsQty',label:'هدايا كمية',numeric:true,render:r=>qty(r.giftsQty)},{key:'giftsValue',label:'هدايا قيمة',numeric:true,render:r=>money(r.giftsValue)},
  {key:'damagesQty',label:'تالف كمية',numeric:true,render:r=>qty(r.damagesQty)},{key:'damagesValue',label:'تالف قيمة',numeric:true,render:r=>money(r.damagesValue)},
  {key:'returnFactoryQty',label:'مرتجع مصنع كمية',numeric:true,render:r=>qty(r.returnFactoryQty)},{key:'returnFactoryValue',label:'مرتجع مصنع قيمة',numeric:true,render:r=>money(r.returnFactoryValue)},
  {key:'outgoingBranchesQty',label:'تحويل فروع كمية',numeric:true,render:r=>qty(r.outgoingBranchesQty)},{key:'outgoingBranchesValue',label:'تحويل فروع قيمة',numeric:true,render:r=>money(r.outgoingBranchesValue)},
  {key:'adjustmentQty',label:'تسويات كمية',numeric:true,render:r=>qty(r.adjustmentQty)},{key:'adjustmentValue',label:'تسويات قيمة',numeric:true,render:r=>money(r.adjustmentValue)},
  {key:'closingQty',label:'رصيد آخر كمية',numeric:true,render:r=>qty(r.closingQty)},{key:'closingValue',label:'رصيد آخر قيمة',numeric:true,render:r=>money(r.closingValue)},
  {key:'lastDate',label:'تاريخ الرصيد'}
 ]}/></div>
}
