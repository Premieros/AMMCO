import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
import {fetchAllPages} from '../data/pagination'
import {DataTable} from '../components/DataTable'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
export function Banks({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let live=true;(async()=>{try{const [acc,entries,branches]=await Promise.all([
 fetchAllPages<any>((a,b)=>{let q=supabase.from('treasury_accounts').select('id,branch_id,name,code,account_type').eq('is_active',true);if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)}),
 fetchAllPages<any>((a,b)=>{let q=supabase.from('cash_entries').select('branch_id,treasury_account_id,entry_date,direction,amount').gte('entry_date',from).lte('entry_date',to);if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)}),
 fetchAllPages<any>((a,b)=>supabase.from('branches').select('id,name').eq('is_active',true).range(a,b))
 ]);const bm=new Map(branches.map(x=>[x.id,x.name])),am=new Map(acc.map(x=>[x.id,x])),m=new Map<string,any>();for(const e of entries){const a=am.get(e.treasury_account_id);if(!a||a.account_type!=='bank')continue;const k=a.branch_id+'|'+a.id,x=m.get(k)||{branch:bm.get(a.branch_id)||'—',account:a.name,code:a.code||'—',incoming:0,outgoing:0};if(e.direction==='in')x.incoming+=Number(e.amount||0);else x.outgoing+=Number(e.amount||0);m.set(k,x)};if(live)setRows([...m.values()].map(x=>({...x,balance:x.incoming-x.outgoing})))}catch(e:any){if(live)setError(e.message||String(e))}finally{if(live)setLoading(false)}})();return()=>{live=false}},[from,to,branchId])
 if(loading)return <div className="panel loading">جاري تحميل البنوك…</div>
 return <div>{error&&<div className="error-box">{error}</div>}<DataTable title="البنوك" rows={rows} columns={[{key:'branch',label:'الفرع'},{key:'account',label:'الحساب'},{key:'code',label:'الكود'},{key:'incoming',label:'وارد',numeric:true,render:r=>money(r.incoming)},{key:'outgoing',label:'صادر',numeric:true,render:r=>money(r.outgoing)},{key:'balance',label:'الصافي',numeric:true,render:r=>money(r.balance)}]}/></div>
}
