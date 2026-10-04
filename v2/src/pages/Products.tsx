import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
import {fetchAllPages} from '../data/pagination'
import {getApprovedBatchIds} from '../data/core'
import {DataTable} from '../components/DataTable'
const ZERO='00000000-0000-0000-0000-000000000000'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const qty=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)
export function Products({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let live=true;(async()=>{try{const ids=await getApprovedBatchIds(),safe=ids.length?ids:[ZERO];const [inv,products,branches]=await Promise.all([
 fetchAllPages<any>((a,b)=>{let q=supabase.from('inventory_daily').select('branch_id,business_date,product_id,closing_qty,closing_value').in('batch_id',safe).gte('business_date',from).lte('business_date',to).order('business_date');if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)}),
 fetchAllPages<any>((a,b)=>supabase.from('products').select('id,sku,name,wholesale_carton_price').range(a,b)),
 fetchAllPages<any>((a,b)=>supabase.from('branches').select('id,name').eq('is_active',true).range(a,b))
 ]);const pm=new Map(products.map(x=>[x.id,x])),bm=new Map(branches.map(x=>[x.id,x.name])),latest=new Map<string,any>();for(const r of inv){const k=r.branch_id+'|'+r.product_id,p=latest.get(k);if(!p||r.business_date>=p.business_date)latest.set(k,r)};const out=[...latest.values()].map(r=>{const p=pm.get(r.product_id)||{};return{branch:bm.get(r.branch_id)||'—',sku:p.sku||'—',product:p.name||'—',price:Number(p.wholesale_carton_price||0),qty:Number(r.closing_qty||0),value:Number(r.closing_value||0),date:r.business_date}});if(live)setRows(out)}catch(e:any){if(live)setError(e.message||String(e))}finally{if(live)setLoading(false)}})();return()=>{live=false}},[from,to,branchId])
 if(loading)return <div className="panel loading">جاري تحميل الأصناف…</div>
 return <div>{error&&<div className="error-box">{error}</div>}<DataTable title="أرصدة الأصناف" rows={rows} columns={[{key:'branch',label:'الفرع'},{key:'sku',label:'الكود'},{key:'product',label:'الصنف'},{key:'price',label:'سعر الكرتونة',numeric:true,render:r=>money(r.price)},{key:'qty',label:'الرصيد',numeric:true,render:r=>qty(r.qty)},{key:'value',label:'القيمة',numeric:true,render:r=>money(r.value)},{key:'date',label:'تاريخ الرصيد'}]}/></div>
}
