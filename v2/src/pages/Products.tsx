import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabase'
import {fetchAllPages} from '../data/pagination'
import {getApprovedBatchIds} from '../data/core'
import {DataTable,type Column} from '../components/DataTable'
const ZERO='00000000-0000-0000-0000-000000000000'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const qty=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)

export function Products({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let live=true;(async()=>{try{
  const ids=await getApprovedBatchIds(),safe=ids.length?ids:[ZERO]
  const [inv,products,branches]=await Promise.all([
   fetchAllPages<any>((a,b)=>{let q=supabase.from('inventory_daily').select('branch_id,business_date,product_id,product_name,sales_qty,closing_qty,closing_value').in('batch_id',safe).gte('business_date',from).lte('business_date',to).order('business_date');if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)}),
   fetchAllPages<any>((a,b)=>supabase.from('products').select('id,source_product_key,name,wholesale_carton_price').range(a,b)),
   fetchAllPages<any>((a,b)=>supabase.from('branches').select('id,name').eq('is_active',true).range(a,b))
  ])
  const pm=new Map(products.map(x=>[x.id,x])),bm=new Map(branches.map(x=>[x.id,x.name])),latest=new Map<string,any>(),sales=new Map<string,number>()
  for(const r of inv){const key=r.branch_id+'|'+(r.product_id||r.product_name);sales.set(key,(sales.get(key)||0)+Number(r.sales_qty||0));const p=latest.get(key);if(!p||r.business_date>=p.business_date)latest.set(key,r)}
  const out=[...latest.values()].map(r=>{const p=pm.get(r.product_id)||{},key=r.branch_id+'|'+(r.product_id||r.product_name);return{branchId:r.branch_id,branch:bm.get(r.branch_id)||'—',sku:p.source_product_key||'—',product:p.name||r.product_name||'—',price:Number(p.wholesale_carton_price||0),sales:Number(sales.get(key)||0),qty:Number(r.closing_qty||0),value:Number(r.closing_value||0),date:r.business_date}})
  if(live)setRows(out)
 }catch(e:any){if(live)setError(e.message||String(e))}finally{if(live)setLoading(false)}})();return()=>{live=false}},[from,to,branchId])

 const branchNames=useMemo(()=>[...new Set(rows.map(r=>r.branch))].sort((a,b)=>String(a).localeCompare(String(b),'ar')),[rows])
 const matrix=useMemo(()=>{
  const m=new Map<string,any>()
  for(const r of rows){const x=m.get(r.product)||{product:r.product};x[r.branch+'__sales']=r.sales;x[r.branch+'__qty']=r.qty;x[r.branch+'__value']=r.value;m.set(r.product,x)}
  return [...m.values()].sort((a,b)=>String(a.product).localeCompare(String(b.product),'ar'))
 },[rows])
 const matrixCols=useMemo(()=>{
  const cols:Column<any>[]=[{key:'product',label:'الصنف'}]
  for(const b of branchNames){cols.push({key:b+'__sales',label:b+' — بيع',numeric:true,render:r=>r[b+'__sales']===undefined?'—':qty(r[b+'__sales'])},{key:b+'__qty',label:b+' — رصيد آخر',numeric:true,render:r=>r[b+'__qty']===undefined?'—':qty(r[b+'__qty'])},{key:b+'__value',label:b+' — قيمة الرصيد',numeric:true,render:r=>r[b+'__value']===undefined?'—':money(r[b+'__value'])})}
  return cols
 },[branchNames])

 if(loading)return <div className="panel loading">جاري تحميل الأصناف…</div>
 return <div>{error&&<div className="error-box">{error}</div>}
  <DataTable title="أرصدة الأصناف" rows={rows} columns={[{key:'branch',label:'الفرع'},{key:'sku',label:'الكود'},{key:'product',label:'الصنف'},{key:'price',label:'سعر الكرتونة',numeric:true,render:r=>money(r.price)},{key:'sales',label:'بيع الفترة',numeric:true,render:r=>qty(r.sales)},{key:'qty',label:'الرصيد',numeric:true,render:r=>qty(r.qty)},{key:'value',label:'القيمة',numeric:true,render:r=>money(r.value)},{key:'date',label:'تاريخ الرصيد'}]}/>
  <DataTable title="مصفوفة الأصناف بين الفروع" rows={matrix} columns={matrixCols}/>
 </div>
}
