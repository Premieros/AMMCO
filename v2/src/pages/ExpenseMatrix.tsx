import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
import {fetchAllPages} from '../data/pagination'
import {DataTable} from '../components/DataTable'
const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const pct=(n:number)=>(n*100).toFixed(1)+'%'
export function ExpenseMatrix({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let live=true;(async()=>{try{
  const [sales,expenses,settings,branches]=await Promise.all([
   fetchAllPages<any>((a,b)=>{let q=supabase.from('v_branch_daily_kpis').select('branch_id,business_date,net_sales').gte('business_date',from).lte('business_date',to);if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)}),
   fetchAllPages<any>((a,b)=>{let q=supabase.from('v_expense_analysis').select('branch_id,canonical_category,expense_group,amount').gte('entry_date',from).lte('entry_date',to);if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)}),
   fetchAllPages<any>((a,b)=>{let q=supabase.from('branch_expense_accrual_settings').select('branch_id,month_start,wages,branch_manager,sector_manager,rent,carried_expenses,commission_rate,working_days_basis').lte('month_start',to).order('month_start',{ascending:false});if(branchId)q=q.eq('branch_id',branchId);return q.range(a,b)}),
   fetchAllPages<any>((a,b)=>{let q=supabase.from('branches').select('id,name').eq('is_active',true);if(branchId)q=q.eq('id',branchId);return q.range(a,b)})
  ])
  const salesBy=new Map<string,number>(),daysBy=new Map<string,Set<string>>(),latest=new Map<string,any>(),expBy=new Map<string,any>()
  for(const r of sales){salesBy.set(r.branch_id,(salesBy.get(r.branch_id)||0)+Number(r.net_sales||0));const s=daysBy.get(r.branch_id)||new Set<string>();s.add(r.business_date);daysBy.set(r.branch_id,s)}
  for(const r of settings)if(!latest.has(r.branch_id))latest.set(r.branch_id,r)
  for(const r of expenses){const t=((r.canonical_category||'')+' '+(r.expense_group||'')).toLowerCase(),x=expBy.get(r.branch_id)||{treasury:0,fuel:0,petro:0};x.treasury+=Number(r.amount||0);if(/سولار|وقود|fuel/.test(t))x.fuel+=Number(r.amount||0);if(/بترو|petro/.test(t))x.petro+=Number(r.amount||0);expBy.set(r.branch_id,x)}
  const out=branches.map(b=>{const s=salesBy.get(b.id)||0,st=latest.get(b.id)||{},ex=expBy.get(b.id)||{treasury:0,fuel:0,petro:0},days=(daysBy.get(b.id)||new Set()).size,basis=Math.max(1,Number(st.working_days_basis||30)),wages=Number(st.wages||0)+Number(st.branch_manager||0)+Number(st.sector_manager||0),rent=Number(st.rent||0),accrued=wages+rent,carried=Number(st.carried_expenses||0),toDate=(accrued*(Math.min(days,basis)/basis))+carried,commission=s*Number(st.commission_rate||0),vehicle=ex.fuel+ex.petro,total=toDate+ex.treasury+commission;return{branch:b.name,sales:s,days:basis,wages,rent,accrued,carried,toDate,fuel:ex.fuel,petro:ex.petro,vehicle,vehicleRate:s?vehicle/s:0,treasury:ex.treasury,commission,total,totalRate:s?total/s:0}})
  if(live)setRows(out)
 }catch(e:any){if(live)setError(e.message||String(e))}finally{if(live)setLoading(false)}})();return()=>{live=false}},[from,to,branchId])
 if(loading)return <div className="panel loading">جاري تحميل تحليلي المصروفات…</div>
 return <div>{error&&<div className="error-box">{error}</div>}<DataTable title="تحليلي المصروفات" rows={rows} columns={[{key:'branch',label:'الفرع'},{key:'sales',label:'المبيعات',numeric:true,render:r=>money(r.sales)},{key:'days',label:'أيام العمل',numeric:true},{key:'wages',label:'أجور',numeric:true,render:r=>money(r.wages)},{key:'rent',label:'إيجارات',numeric:true,render:r=>money(r.rent)},{key:'accrued',label:'إجمالي المستحق',numeric:true,render:r=>money(r.accrued)},{key:'carried',label:'مصروفات مرحلة',numeric:true,render:r=>money(r.carried)},{key:'toDate',label:'المستحق حتى تاريخه',numeric:true,render:r=>money(r.toDate)},{key:'fuel',label:'م. سولار',numeric:true,render:r=>money(r.fuel)},{key:'petro',label:'بترو أب',numeric:true,render:r=>money(r.petro)},{key:'vehicle',label:'إجمالي سيارات',numeric:true,render:r=>money(r.vehicle)},{key:'vehicleRate',label:'% السيارات',render:r=>pct(r.vehicleRate)},{key:'treasury',label:'مصروفات الخزينة',numeric:true,render:r=>money(r.treasury)},{key:'commission',label:'عمولات',numeric:true,render:r=>money(r.commission)},{key:'total',label:'المصروفات',numeric:true,render:r=>money(r.total)},{key:'totalRate',label:'% المصروفات',render:r=>pct(r.totalRate)}]}/></div>
}
