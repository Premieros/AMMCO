import {useEffect,useState} from 'react'
import {getDashboardAnalytics,type DashboardAnalytics} from '../data/dashboard'
import {getBranches} from '../data/core'
import {getImportHistory} from '../data/imports'
import {DataTable} from '../components/DataTable'

export function ManagementCenter({from,to,branchId}:{from:string;to:string;branchId?:string}){
 const [analytics,setAnalytics]=useState<DashboardAnalytics|null>(null)
 const [pending,setPending]=useState<any[]>([])
 const [branchCount,setBranchCount]=useState(0)
 const [error,setError]=useState('')
 useEffect(()=>{let live=true;(async()=>{try{
  const [a,imports,branches]=await Promise.all([getDashboardAnalytics({from,to,branchId}),getImportHistory(branchId),getBranches()])
  if(!live)return
  setAnalytics(a)
  setPending(imports.filter(x=>['validated','rejected','failed'].includes(x.status)))
  setBranchCount(branchId?1:branches.length)
 }catch(e:any){if(live)setError(e.message||String(e))}})();return()=>{live=false}},[from,to,branchId])
 if(error)return <div className="error-box">{error}</div>
 if(!analytics)return <div className="panel loading">جاري تحميل مركز الإدارة…</div>
 const reporting=analytics.branches.length
 const deductions=analytics.anomalies.length*4+pending.length*5
 const score=Math.max(10,Math.min(100,100-deductions))
 return <div>
  <section className="quality-hero panel"><div className="quality-score"><strong>{score}%</strong><span>سلامة البيانات</span></div><div className="quality-grid"><div><span>التغطية التشغيلية</span><b>{reporting} / {branchCount} فرع</b></div><div><span>تنبيهات نشطة</span><b>{analytics.anomalies.length}</b></div><div><span>ملفات معلقة</span><b>{pending.length}</b></div></div></section>
  <section className="panel"><h2>قائمة التدخل الإداري</h2>{analytics.anomalies.length?<div className="anomaly-list">{analytics.anomalies.map((x,i)=><div className="anomaly-item" key={i}>{x}</div>)}</div>:<p className="muted">لا توجد بنود معلقة تحتاج تدخلاً إداريًا وفق القواعد الحالية.</p>}</section>
  <DataTable title="ملفات الشيت المعلقة والمرفوضة" rows={pending} columns={[
   {key:'branch_id',label:'الفرع',render:r=>r.branch_id},
   {key:'original_file_name',label:'الملف'},
   {key:'period_start',label:'من'},{key:'period_end',label:'إلى'},
   {key:'version',label:'الإصدار',numeric:true},
   {key:'status',label:'الحالة'},
   {key:'uploaded_at',label:'وقت الرفع',render:r=>new Date(r.uploaded_at).toLocaleString('en-GB')}
  ]}/>
 </div>
}
