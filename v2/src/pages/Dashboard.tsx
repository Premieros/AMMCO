import {useEffect,useState} from 'react'
import {getDashboardSummary,type DashboardSummary} from '../data/core'
import {getDashboardAnalytics,type DashboardAnalytics} from '../data/dashboard'
import {KpiCard} from '../components/KpiCard'
import {TimelineChart} from '../components/TimelineChart'
import {DataTable} from '../components/DataTable'

const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)+' ج.م'
const qty=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)
const delta=(now:number,prev:number)=>prev?((now-prev)/Math.abs(prev))*100:0

export function Dashboard({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [data,setData]=useState<DashboardSummary|null>(null)
 const [analytics,setAnalytics]=useState<DashboardAnalytics|null>(null)
 const [error,setError]=useState('')
 useEffect(()=>{let live=true;setData(null);setAnalytics(null);setError('');Promise.all([getDashboardSummary({from,to,branchId}),getDashboardAnalytics({from,to,branchId})]).then(([x,a])=>{if(live){setData(x);setAnalytics(a)}}).catch(e=>live&&setError(e.message||String(e)));return()=>{live=false}},[from,to,branchId])
 if(error)return <div className="error-box">{error}</div>
 if(!data||!analytics)return <div className="panel loading">جاري تحميل لوحة التحكم…</div>
 return <div className="dashboard-page">
  <div className="kpi-grid">
   <KpiCard title="إجمالي قبل الخصم" value={money(data.grossSales)} hint={data.grossSales?('الخصم '+((data.discounts/data.grossSales)*100).toFixed(1)+'%'):''}/>
   <KpiCard title="صافي المبيعات" value={money(data.netSales)} hint={(delta(analytics.current.sales,analytics.previous.sales)>=0?'+':'')+delta(analytics.current.sales,analytics.previous.sales).toFixed(1)+'% مقابل الفترة السابقة'}/>
   <KpiCard title="التوريد" value={money(data.collections)} hint={(delta(analytics.current.collections,analytics.previous.collections)>=0?'+':'')+delta(analytics.current.collections,analytics.previous.collections).toFixed(1)+'% مقابل السابقة'}/>
   <KpiCard title="نسبة التحصيل" value={(data.collectionRate*100).toFixed(1)+'%'} hint="التوريد ÷ صافي المبيعات"/>
   <KpiCard title="المديونية" value={money(data.closingDebt)}/>
   <KpiCard title="قيمة الخصم" value={money(data.discounts)} hint={data.grossSales?((data.discounts/data.grossSales)*100).toFixed(1)+'% من قبل الخصم':''}/>
   <KpiCard title="المصروفات" value={money(data.expenses)} hint={data.netSales?((data.expenses/data.netSales)*100).toFixed(1)+'% من المبيعات':''}/>
   <KpiCard title="الكمية المكافئة" value={qty(data.equivalentQty)}/>
   <KpiCard title="متوسط السعر" value={money(data.avgPrice)}/>
   <KpiCard title="رصيد الخزينة" value={money(data.closingCash)} hint={data.branches+' فروع لها بيانات'}/>
   <KpiCard title="قيمة المخزون" value={money(data.inventoryValue)} hint="آخر رصيد مخزون لكل فرع"/>
   <KpiCard title="المرتجعات" value={money(data.returnsValue)}/>
   <KpiCard title="البونص" value={money(data.bonusesValue)}/>
   <KpiCard title="الهدايا" value={money(data.giftsValue)}/>
   <KpiCard title="التالف" value={money(data.damagesValue)}/>
   <KpiCard title="عدد الفروع" value={String(data.branches)} hint={branchId?'الفرع المحدد':'فروع لها بيانات في الفترة'}/>
  </div>
  <TimelineChart points={analytics.points}/>
  <div className="executive-grid">
   <section className="panel"><h2>تنبيهات وتحليلات</h2>{analytics.anomalies.length?<div className="anomaly-list">{analytics.anomalies.map((x,i)=><div className="anomaly-item" key={i}>{x}</div>)}</div>:<p className="muted">لا توجد انحرافات بارزة وفق القواعد الحالية.</p>}</section>
   <DataTable title="ملخص أداء الفروع" rows={analytics.branches} columns={[{key:'branchName',label:'الفرع'},{key:'sales',label:'المبيعات',numeric:true,render:r=>money(r.sales)},{key:'expenses',label:'المصروفات',numeric:true,render:r=>money(r.expenses)},{key:'collections',label:'التحصيل',numeric:true,render:r=>money(r.collections)},{key:'closingDebt',label:'المديونية',numeric:true,render:r=>money(r.closingDebt)},{key:'expenseRatio',label:'نسبة المصروفات',render:r=>(r.expenseRatio*100).toFixed(1)+'%'}]}/>
  </div>
 </div>
}
