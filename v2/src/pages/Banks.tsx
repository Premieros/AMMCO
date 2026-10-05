import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabase'
import {fetchAllPages} from '../data/pagination'
import {getApprovedBatchIds} from '../data/core'
import {DataTable} from '../components/DataTable'

const ZERO='00000000-0000-0000-0000-000000000000'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)
const isBankTransfer=(r:any)=>{
 const text=[r.canonical_category,r.category,r.description].filter(Boolean).join(' ')
 return /(بنك|البنك|ايداع|إيداع|تحويل)/i.test(text)
}

export function Banks({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let live=true;setLoading(true);setError('');(async()=>{try{
  const ids=await getApprovedBatchIds(),safe=ids.length?ids:[ZERO]
  const [entries,branches]=await Promise.all([
   fetchAllPages<any>((a,b)=>{let q=supabase.from('cash_entries')
    .select('id,branch_id,entry_date,source_code,description,category,canonical_category,direction,amount')
    .in('batch_id',safe).gte('entry_date',from).lte('entry_date',to)
    .order('entry_date',{ascending:true}).order('id',{ascending:true})
    if(branchId)q=q.eq('branch_id',branchId)
    return q.range(a,b)
   }),
   fetchAllPages<any>((a,b)=>supabase.from('branches').select('id,name').eq('is_active',true).range(a,b))
  ])
  const bm=new Map(branches.map(x=>[x.id,x.name]))
  const out=entries.filter(isBankTransfer).map(r=>({
   ...r,
   branch:bm.get(r.branch_id)||'—',
   movement:r.direction==='in'?'وارد':'صادر',
   incoming:r.direction==='in'?Number(r.amount||0):0,
   outgoing:r.direction==='out'?Number(r.amount||0):0,
   classification:r.canonical_category||r.category||'غير مصنف'
  }))
  if(live)setRows(out)
 }catch(e:any){if(live)setError(e.message||String(e))}finally{if(live)setLoading(false)}})();return()=>{live=false}},[from,to,branchId])

 const summary=useMemo(()=>{
  const m=new Map<string,any>()
  for(const r of rows){
   const key=r.branch+'|'+r.classification
   const x=m.get(key)||{branch:r.branch,classification:r.classification,count:0,incoming:0,outgoing:0,net:0}
   x.count++;x.incoming+=r.incoming;x.outgoing+=r.outgoing;x.net=x.incoming-x.outgoing
   m.set(key,x)
  }
  return [...m.values()].sort((a,b)=>a.branch.localeCompare(b.branch,'ar')||a.classification.localeCompare(b.classification,'ar'))
 },[rows])

 const totalIn=rows.reduce((s,r)=>s+r.incoming,0),totalOut=rows.reduce((s,r)=>s+r.outgoing,0)

 if(loading)return <div className="panel loading">جاري تحميل البنوك والتحويلات…</div>
 return <div>
  {error&&<div className="error-box">{error}</div>}
  <div className="kpi-grid">
   <article className="kpi-card"><span>عدد الحركات</span><strong>{rows.length}</strong></article>
   <article className="kpi-card"><span>إجمالي الوارد البنكي</span><strong>{money(totalIn)}</strong></article>
   <article className="kpi-card"><span>إجمالي التحويلات / الصادر</span><strong>{money(totalOut)}</strong></article>
   <article className="kpi-card"><span>الصافي</span><strong>{money(totalIn-totalOut)}</strong></article>
  </div>
  <DataTable title="ملخص البنوك والتحويلات" rows={summary} columns={[
   {key:'branch',label:'الفرع'},
   {key:'classification',label:'التصنيف'},
   {key:'count',label:'عدد الحركات',numeric:true},
   {key:'incoming',label:'وارد',numeric:true,render:r=>money(r.incoming)},
   {key:'outgoing',label:'صادر / تحويل',numeric:true,render:r=>money(r.outgoing)},
   {key:'net',label:'الصافي',numeric:true,render:r=>money(r.net)}
  ]}/>
  <DataTable title="تفاصيل حركات البنوك والتحويلات" rows={rows} columns={[
   {key:'entry_date',label:'التاريخ'},
   {key:'branch',label:'الفرع'},
   {key:'source_code',label:'الكود'},
   {key:'classification',label:'التصنيف'},
   {key:'description',label:'البيان'},
   {key:'movement',label:'الحركة'},
   {key:'incoming',label:'وارد',numeric:true,render:r=>money(r.incoming)},
   {key:'outgoing',label:'صادر / تحويل',numeric:true,render:r=>money(r.outgoing)}
  ]}/>
 </div>
}
