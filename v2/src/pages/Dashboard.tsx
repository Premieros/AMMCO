import {useEffect,useState} from 'react'
import {getDashboardSummary,type DashboardSummary} from '../data/core'
import {getDashboardAnalytics,type DashboardAnalytics} from '../data/dashboard'
import {KpiCard} from '../components/KpiCard'
import {TimelineChart} from '../components/TimelineChart'
import {DataTable} from '../components/DataTable'
import {BadgeDollarSign,Boxes,Building2,Gift,HandCoins,Percent,Receipt,RotateCcw,Scale,ShoppingCart,TrendingDown,WalletCards} from 'lucide-react'

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
 return <div className="dashboard-page premium-dashboard">
  <section className="dashboard-hero">
   <div className="dashboard-hero-copy">
    <span className="dashboard-hero-eyebrow">ملخص الأداء التنفيذي</span>
    <h2>نظرة شاملة على أداء الفترة</h2>
    <p>{from} ← {to}{branchId?' · الفرع المحدد':' · كل الفروع'}</p>
   </div>
   <div className="dashboard-hero-stats">
    <div><span>صافي المبيعات</span><strong>{money(data.netSales)}</strong></div>
    <div><span>التوريد</span><strong>{money(data.collections)}</strong></div>
    <div><span>رصيد الخزينة</span><strong>{money(data.closingCash)}</strong></div>
   </div>
  </section>

  <section className="dashboard-section">
   <div className="dashboard-section-head"><div><span>المؤشرات</span><h2>ملخص الأداء</h2></div><small>كل المؤشرات في عرض واحد</small></div>
   <div className="kpi-grid dashboard-kpi-wall">
    <KpiCard tone="blue" icon={<ShoppingCart size={18}/>} title="إجمالي قبل الخصم" value={money(data.grossSales)} hint={data.grossSales?('الخصم '+((data.discounts/data.grossSales)*100).toFixed(1)+'%'):''}/>
    <KpiCard tone="green" icon={<BadgeDollarSign size={18}/>} title="صافي المبيعات" value={money(data.netSales)} hint={(delta(analytics.current.sales,analytics.previous.sales)>=0?'+':'')+delta(analytics.current.sales,analytics.previous.sales).toFixed(1)+'% مقابل الفترة السابقة'}/>
    <KpiCard tone="cyan" icon={<HandCoins size={18}/>} title="التوريد" value={money(data.collections)} hint={(delta(analytics.current.collections,analytics.previous.collections)>=0?'+':'')+delta(analytics.current.collections,analytics.previous.collections).toFixed(1)+'% مقابل السابقة'}/>
    <KpiCard tone="violet" icon={<Percent size={18}/>} title="نسبة التحصيل" value={(data.collectionRate*100).toFixed(1)+'%'} hint="التوريد ÷ صافي المبيعات"/>
    <KpiCard tone="amber" icon={<WalletCards size={18}/>} title="المديونية" value={money(data.closingDebt)}/>
    <KpiCard tone="red" icon={<TrendingDown size={18}/>} title="التالف" value={money(data.damagesValue)} hint={'الكمية: '+qty(data.damagesQty)}/>
    <KpiCard tone="amber" icon={<Receipt size={18}/>} title="المصروفات" value={money(data.expenses)} hint={data.netSales?((data.expenses/data.netSales)*100).toFixed(1)+'% من المبيعات':''}/>
    <KpiCard tone="neutral" icon={<Scale size={18}/>} title="الكمية المكافئة" value={qty(data.equivalentQty)}/>
    <KpiCard tone="blue" icon={<BadgeDollarSign size={18}/>} title="متوسط السعر" value={money(data.avgPrice)}/>
    <KpiCard tone="green" icon={<WalletCards size={18}/>} title="رصيد الخزينة" value={money(data.closingCash)} hint={data.branches+' فروع لها بيانات'}/>
    <KpiCard tone="cyan" icon={<Boxes size={18}/>} title="المخزون" value={money(data.inventoryValue)} hint={'الكمية: '+qty(data.inventoryQty)}/>
    <KpiCard tone="violet" icon={<RotateCcw size={18}/>} title="المرتجعات" value={money(data.returnsValue)} hint={'الكمية: '+qty(data.returnsQty)}/>
    <KpiCard tone="green" icon={<Gift size={18}/>} title="البونص" value={money(data.bonusesValue)} hint={'الكمية: '+qty(data.bonusesQty)}/>
    <KpiCard tone="blue" icon={<Gift size={18}/>} title="الهدايا" value={money(data.giftsValue)} hint={'الكمية: '+qty(data.giftsQty)}/>
    <KpiCard tone="neutral" icon={<Building2 size={18}/>} title="عدد الفروع" value={String(data.branches)} hint={branchId?'الفرع المحدد':'فروع لها بيانات في الفترة'}/>
   </div>
  </section>

  <section className="dashboard-section">
   <div className="dashboard-section-head"><div><span>الاتجاهات</span><h2>حركة الفترة</h2></div></div>
   <TimelineChart points={analytics.points}/>
  </section>

  <section className="dashboard-section">
   <div className="dashboard-section-head"><div><span>المتابعة التنفيذية</span><h2>التنبيهات وأداء الفروع</h2></div></div>
   <div className="executive-grid">
    <section className="panel executive-alerts"><h2>تنبيهات وتحليلات</h2>{analytics.anomalies.length?<div className="anomaly-list">{analytics.anomalies.map((x,i)=><div className="anomaly-item" key={i}>{x}</div>)}</div>:<p className="muted">لا توجد انحرافات بارزة وفق القواعد الحالية.</p>}</section>
    <DataTable title="ملخص أداء الفروع" rows={analytics.branches} columns={[{key:'branchName',label:'الفرع'},{key:'sales',label:'المبيعات',numeric:true,render:r=>money(r.sales)},{key:'expenses',label:'المصروفات',numeric:true,render:r=>money(r.expenses)},{key:'collections',label:'التحصيل',numeric:true,render:r=>money(r.collections)},{key:'closingDebt',label:'المديونية',numeric:true,render:r=>money(r.closingDebt)},{key:'expenseRatio',label:'نسبة المصروفات',render:r=>(r.expenseRatio*100).toFixed(1)+'%'}]}/>
   </div>
  </section>
 </div>
}