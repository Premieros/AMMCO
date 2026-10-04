import {useEffect,useState} from 'react'
import {getDashboardSummary,type DashboardSummary} from '../data/core'
import {KpiCard} from '../components/KpiCard'

const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)+' ج.م'
const qty=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)

export function Dashboard({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [data,setData]=useState<DashboardSummary|null>(null)
 const [error,setError]=useState('')
 useEffect(()=>{let live=true;setData(null);setError('');getDashboardSummary({from,to,branchId}).then(x=>live&&setData(x)).catch(e=>live&&setError(e.message||String(e)));return()=>{live=false}},[from,to,branchId])
 if(error)return <div className="error-box">{error}</div>
 if(!data)return <div className="panel loading">جاري تحميل لوحة التحكم…</div>
 return <div className="dashboard-page">
  <div className="kpi-grid">
   <KpiCard title="صافي المبيعات" value={money(data.netSales)}/>
   <KpiCard title="التوريد" value={money(data.collections)}/>
   <KpiCard title="المديونية" value={money(data.closingDebt)}/>
   <KpiCard title="قيمة الخصم" value={money(data.discounts)} hint={data.grossSales?((data.discounts/data.grossSales)*100).toFixed(1)+'% من قبل الخصم':''}/>
   <KpiCard title="المصروفات" value={money(data.expenses)} hint={data.netSales?((data.expenses/data.netSales)*100).toFixed(1)+'% من المبيعات':''}/>
   <KpiCard title="الكمية المكافئة" value={qty(data.equivalentQty)}/>
   <KpiCard title="متوسط السعر" value={money(data.avgPrice)}/>
   <KpiCard title="رصيد الخزينة" value={money(data.closingCash)} hint={data.branches+' فروع لها بيانات'}/>
  </div>
  <section className="panel"><h2>الفترة الحالية</h2><p>{from} ← {to}</p><p className="muted">كل مؤشرات هذه الشاشة تأتي من طبقة البيانات الموحدة، والكمية من بيانات المناديب المعتمدة.</p></section>
 </div>
}
