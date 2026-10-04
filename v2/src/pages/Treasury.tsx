import {useEffect,useMemo,useState} from 'react'
import type {Branch} from '../domain/types'
import {getTreasury,type CashRow} from '../data/treasury'
import {DataTable} from '../components/DataTable'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)
export function Treasury({from,to,branchId,branches}:{from:string;to:string;branchId?:string;branches:Branch[]}){
 const [rows,setRows]=useState<CashRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let live=true;setLoading(true);getTreasury({from,to,branchId}).then(x=>live&&setRows(x)).catch(e=>live&&setError(e.message||String(e))).finally(()=>live&&setLoading(false));return()=>{live=false}},[from,to,branchId])
 const map=useMemo(()=>new Map(branches.map(b=>[b.id,b.name])),[branches])
 const incoming=rows.filter(r=>r.direction==='in').reduce((s,r)=>s+Number(r.amount||0),0),outgoing=rows.filter(r=>r.direction==='out').reduce((s,r)=>s+Number(r.amount||0),0)
 if(loading)return <div className="panel loading">جاري تحميل الخزينة…</div>
 return <div>{error&&<div className="error-box">{error}</div>}<div className="kpi-grid"><article className="kpi-card"><span>الوارد</span><strong>{money(incoming)}</strong></article><article className="kpi-card"><span>الصادر</span><strong>{money(outgoing)}</strong></article><article className="kpi-card"><span>صافي الحركة</span><strong>{money(incoming-outgoing)}</strong></article></div><DataTable title="حركات الخزينة" rows={rows.map(r=>({...r,branch:map.get(r.branch_id)||'—',inbound:r.direction==='in'?r.amount:0,outbound:r.direction==='out'?r.amount:0}))} columns={[{key:'entry_date',label:'التاريخ'},{key:'branch',label:'الفرع'},{key:'source_code',label:'الكود'},{key:'description',label:'البيان'},{key:'category',label:'التصنيف'},{key:'inbound',label:'وارد',numeric:true,render:r=>money(r.inbound)},{key:'outbound',label:'صادر',numeric:true,render:r=>money(r.outbound)},{key:'running_balance',label:'الرصيد',numeric:true,render:r=>r.running_balance==null?'—':money(r.running_balance)}]}/></div>
}
