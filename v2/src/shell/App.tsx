import {useEffect,useMemo,useState} from 'react'
import type {Session} from '@supabase/supabase-js'
import {supabase} from '../lib/supabase'
import {getAllowedBranchIds,getApprovedMonths,getBranches,getLatestApprovedPeriod,getProfile} from '../data/core'
import type {Branch,Profile} from '../domain/types'
import {Dashboard} from '../pages/Dashboard'
import {Reports} from '../pages/Reports'
import {Reps} from '../pages/Reps'
import {RepDaily} from '../pages/RepDaily'
import {Receivables} from '../pages/Receivables'
import {Monthly} from '../pages/Monthly'
import {Products} from '../pages/Products'
import {Banks} from '../pages/Banks'
import {Expenses} from '../pages/Expenses'
import {Treasury} from '../pages/Treasury'
import {Imports} from '../pages/Imports'
import {Inventory} from '../pages/Inventory'
import {Vehicles} from '../pages/Vehicles'
import {UsersPage} from '../pages/Users'
import {BranchesPage} from '../pages/Branches'
import {Settings} from '../pages/Settings'
import {ManagementCenter} from '../pages/ManagementCenter'
import {BranchSheets} from '../pages/BranchSheets'
import {ExecutiveComparison} from '../pages/ExecutiveComparison'
import {MetricDrilldown} from '../pages/MetricDrilldown'
import {Login} from '../pages/Login'
import {LayoutDashboard,FileBarChart2,Users,Receipt,WalletCards,Upload,UserCog,LogOut,Boxes,Truck,Settings as SettingsIcon,ShieldAlert} from 'lucide-react'

type Route='dashboard'|'management'|'comparison'|'drilldown'|'reports'|'reps'|'rep-daily'|'receivables'|'monthly'|'products'|'banks'|'expenses'|'treasury'|'inventory'|'vehicles'|'imports'|'branch-sheets'|'branches'|'users'|'settings'
const nav=[
 ['dashboard','لوحة التحكم',LayoutDashboard],
 ['management','مركز الإدارة',ShieldAlert],
 ['comparison','المقارنة التنفيذية',FileBarChart2],
 ['drilldown','تحليل المؤشرات',LayoutDashboard],
 ['reports','التقارير',FileBarChart2],
 ['reps','المناديب',Users],
 ['rep-daily','يوميات المناديب',Users],
 ['receivables','المديونية والتحصيل',WalletCards],
 ['monthly','التحليل الشهري وYTD',FileBarChart2],
 ['products','الأصناف',Boxes],
 ['banks','البنوك وYTD',WalletCards],
 ['expenses','المصروفات',Receipt],
 ['treasury','الخزينة',WalletCards],
 ['inventory','المخزون',Boxes],
 ['vehicles','السيارات وبترو اب',Truck],
 ['imports','الاستيراد',Upload],
 ['branch-sheets','محرر الشيتات',FileBarChart2],
 ['branches','إدارة الفروع',Boxes],
 ['users','إدارة المستخدمين',UserCog],
 ['settings','الإعدادات',SettingsIcon],
] as const

const monthBounds=(month:string)=>{
 const [y,m]=month.split('-').map(Number)
 const last=new Date(y,m,0).getDate()
 return {from:month+'-01',to:month+'-'+String(last).padStart(2,'0')}
}
const routeFromHash=():Route=>{
 const raw=(location.hash.replace(/^#\/?/,'').split('?')[0]||'dashboard') as Route
 return nav.some(x=>x[0]===raw)?raw:'dashboard'
}

export function App(){
 const [session,setSession]=useState<Session|null>(null)
 const [profile,setProfile]=useState<Profile|null>(null)
 const [branches,setBranches]=useState<Branch[]>([])
 const [allowedIds,setAllowedIds]=useState<string[]>([])
 const [route,setRoute]=useState<Route>(routeFromHash())
 const [branchId,setBranchId]=useState('')
 const [month,setMonth]=useState('')
 const [approvedMonths,setApprovedMonths]=useState<string[]>([])
 const [manualFrom,setManualFrom]=useState('')
 const [manualTo,setManualTo]=useState('')
 const [manualPeriod,setManualPeriod]=useState(false)
 const [ready,setReady]=useState(false)
 const [navProgress,setNavProgress]=useState(0)
 const [navLoading,setNavLoading]=useState(false)
 const [interactionBusy,setInteractionBusy]=useState(false)
 const [interactionLabel,setInteractionLabel]=useState('جاري التنفيذ…')
 const [error,setError]=useState('')

 useEffect(()=>{
  supabase.auth.getSession().then(({data})=>setSession(data.session))
  const {data:sub}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next))
  const onHash=()=>setRoute(routeFromHash())
  addEventListener('hashchange',onHash)
  return()=>{sub.subscription.unsubscribe();removeEventListener('hashchange',onHash)}
 },[])

 useEffect(()=>{
  let live=true
  if(!session){setProfile(null);setBranches([]);setAllowedIds([]);setReady(true);return}
  setReady(false);setError('')
  Promise.all([getProfile(session.user.id),getBranches(),getLatestApprovedPeriod(),getApprovedMonths()])
   .then(async([p,b,period,months])=>{
    if(!live)return
    if(!p||!p.is_active)throw new Error('الحساب غير نشط أو غير مربوط بالمؤسسة.')
    const ids=await getAllowedBranchIds(session.user.id,p.role)
    if(!live)return
    setProfile(p);setAllowedIds(ids)
    setBranches((p.role==='admin'||p.role==='analyst')?b:b.filter(x=>ids.includes(x.id)))
    const initial=(period?.period_end||new Date().toISOString().slice(0,10)).slice(0,7)
    setApprovedMonths(months.length?months:[initial])
    setMonth(months.includes(initial)?initial:(months[0]||initial))
    setReady(true)
   })
   .catch(e=>{if(live){setError(e.message||String(e));setReady(true)}})
  return()=>{live=false}
 },[session?.user.id])

 const period=useMemo(()=>manualPeriod&&manualFrom&&manualTo&&manualTo>=manualFrom?{from:manualFrom,to:manualTo}:month?monthBounds(month):{from:'',to:''},[month,manualPeriod,manualFrom,manualTo])
 const monthLabel=(value:string)=>{
  const [y,m]=value.split('-').map(Number)
  return new Intl.DateTimeFormat('ar-EG',{month:'long',year:'numeric'}).format(new Date(Date.UTC(y,m-1,1)))
 }

 useEffect(()=>{
  if(!ready||!session)return
  setNavLoading(true);setNavProgress(12)
  const steps=[[90,32],[220,56],[420,78],[700,92],[950,100]] as const
  const timers=steps.map(([ms,p])=>window.setTimeout(()=>setNavProgress(p),ms))
  const done=window.setTimeout(()=>setNavLoading(false),1120)
  return()=>{timers.forEach(clearTimeout);clearTimeout(done)}
 },[route,branchId,month,manualPeriod,manualFrom,manualTo,ready,session?.user.id])

 useEffect(()=>{
  let timer=0
  const handler=(e:MouseEvent)=>{
   const el=(e.target as HTMLElement).closest('button,a,[role="button"]') as HTMLElement|null
   if(!el||el.getAttribute('aria-disabled')==='true'||(el as HTMLButtonElement).disabled)return
   el.classList.add('interaction-pressed')
   window.setTimeout(()=>el.classList.remove('interaction-pressed'),220)
   const label=(el.textContent||el.getAttribute('title')||'جاري التنفيذ').trim().replace(/\s+/g,' ').slice(0,42)
   setInteractionLabel(label?'جاري: '+label:'جاري التنفيذ…')
   setInteractionBusy(true)
   window.clearTimeout(timer)
   timer=window.setTimeout(()=>setInteractionBusy(false),900)
  }
  document.addEventListener('click',handler,true)
  return()=>{document.removeEventListener('click',handler,true);window.clearTimeout(timer)}
 },[])
 const applyPreset=(type:'month'|'prev'|'ytd'|'last7')=>{
  if(type==='month'){setManualPeriod(false);return}
  const bounds=monthBounds(month),end=new Date(bounds.to+'T00:00:00')
  if(type==='prev'){
   const [y,m]=month.split('-').map(Number),d=new Date(y,m-2,1),pm=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),p=monthBounds(pm)
   setManualFrom(p.from);setManualTo(p.to);setManualPeriod(true);return
  }
  if(type==='ytd'){setManualFrom(month.slice(0,4)+'-01-01');setManualTo(bounds.to);setManualPeriod(true);return}
  const start=new Date(end.getTime()-6*86400000);setManualFrom(start.toISOString().slice(0,10));setManualTo(bounds.to);setManualPeriod(true)
 }
 if(!ready)return <div className="boot">AMMCO</div>
 if(!session)return <Login/>
 if(error)return <main className="login-page"><div className="login-card"><div className="error-box">{error}</div><button className="primary" onClick={()=>supabase.auth.signOut()}>خروج</button></div></main>
 if(!profile||!month)return <div className="boot">AMMCO</div>

 const visibleNav=nav.filter(([id])=>!['users','branches','branch-sheets'].includes(id)||profile.role==='admin')
 const activeBranch=branches.find(b=>b.id===branchId)

 return <div className="app-shell">
  {navLoading&&<div className="route-progress" aria-live="polite"><span style={{width:navProgress+'%'}}/><b><i className="spinner-dot"/>{navProgress}%</b></div>}
  {interactionBusy&&<div className="interaction-toast" aria-live="polite"><span className="action-spinner"/><b>{interactionLabel}</b></div>}
  <aside className="sidebar">
   <div className="brand"><span className="brand-mark">A</span><div><b>AMMCO</b><span>Management Intelligence</span></div></div>
   <div className="nav-caption">القائمة الرئيسية</div>
   <nav>{visibleNav.map(([id,label,Icon])=><a key={id} className={route===id?'active':''} href={'#/'+id} onClick={()=>{setNavProgress(8);setNavLoading(true);setInteractionLabel('جاري فتح '+label);setInteractionBusy(true)}}><span className="nav-icon">{navLoading&&route!==id?<span className="mini-spinner"/>:<Icon size={18}/>}</span><span>{label}</span></a>)}</nav>
   <div className="sidebar-foot"><span>AMMCO v2</span><small>نظام التقارير والإدارة</small></div>
  </aside>
  <main>
   <header className="topbar clean-topbar">
    <div className="clean-topbar-main">
     <div className="page-heading clean-page-title">
      <span className="eyebrow page-breadcrumb">AMMCO / {manualPeriod?'فترة مخصصة':'تقرير شهري'}</span>
      <h1>{visibleNav.find(x=>x[0]===route)?.[1]||'AMMCO'}</h1>
      <div className="context-row page-meta"><span>{activeBranch?.name||'كل الفروع'}</span><i>•</i><span>{period.from} ← {period.to}</span></div>
     </div>
     <div className="clean-filters-row no-print">
      <label className="filter-field compact-field"><span>الشهر</span><select value={month} onChange={e=>{setMonth(e.target.value);setManualPeriod(false)}}>{approvedMonths.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
      <label className="filter-field range-field"><span>الفترة</span><div className={'range-box '+(manualPeriod?'active':'')}><input aria-label="من" type="date" value={manualFrom||period.from} onChange={e=>{setManualFrom(e.target.value);setManualPeriod(true)}}/><b>—</b><input aria-label="إلى" type="date" value={manualTo||period.to} onChange={e=>{setManualTo(e.target.value);setManualPeriod(true)}}/></div></label>
      <label className="filter-field compact-field"><span>الفرع</span><select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">كل الفروع</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <div className="user-badge"><span>{profile.full_name||session.user.email}</span></div>
      <button className="icon-btn logout-btn" title="خروج" onClick={()=>supabase.auth.signOut()}><LogOut size={17}/></button>
     </div>
    </div>
    <div className="quick-filters-row no-print">
     <button className={'quick-pill '+(!manualPeriod?'active':'')} onClick={()=>applyPreset('month')}>هذا الشهر</button>
     <button className="quick-pill" onClick={()=>applyPreset('prev')}>الشهر السابق</button>
     <button className="quick-pill" onClick={()=>applyPreset('last7')}>آخر 7 أيام</button>
     <button className="quick-pill" onClick={()=>applyPreset('ytd')}>YTD</button>
     {manualPeriod&&<button className="quick-pill soft" onClick={()=>setManualPeriod(false)}>العودة للشهر</button>}
    </div>
   </header>

   <section className="page-content">
    {route==='dashboard' && <Dashboard from={period.from} to={period.to} branchId={branchId||undefined}/>}
    {route==='management' && <ManagementCenter from={period.from} to={period.to} branchId={branchId||undefined}/>}
    {route==='comparison' && <ExecutiveComparison from={period.from} to={period.to} branchId={branchId||undefined}/>}
    {route==='drilldown' && <MetricDrilldown from={period.from} to={period.to} branchId={branchId||undefined}/>}
    {route==='reports' && <Reports from={period.from} to={period.to} branchId={branchId||undefined}/>}
    {route==='reps' && <Reps from={period.from} to={period.to} branchId={branchId||undefined} isAdmin={profile.role==='admin'} month={month}/>} 
    {route==='rep-daily' && <RepDaily from={period.from} to={period.to} branchId={branchId||undefined}/>}
    {route==='receivables' && <Receivables from={period.from} to={period.to} branchId={branchId||undefined}/>}
    {route==='monthly' && <Monthly year={period.from.slice(0,4)} branchId={branchId||undefined}/>}
    {route==='products' && <Products from={period.from} to={period.to} branchId={branchId||undefined}/>}
    {route==='banks' && <Banks from={period.from.slice(0,4)+'-01-01'} to={period.to} branchId={branchId||undefined}/>}
    {route==='expenses' && <Expenses from={period.from} to={period.to} month={month} branchId={branchId||undefined} branches={branches} isAdmin={profile.role==='admin'}/>}
    {route==='treasury' && <Treasury from={period.from} to={period.to} branchId={branchId||undefined} branches={branches} isAdmin={profile.role==='admin'}/>} 
    {route==='inventory' && <Inventory from={period.from} to={period.to} branchId={branchId||undefined}/>}
    {route==='vehicles' && <Vehicles from={period.from} to={period.to} month={month} branchId={branchId||undefined} branches={branches} isAdmin={profile.role==='admin'}/>}
    {route==='imports' && <Imports month={month} branchId={branchId||undefined} branches={branches} isAdmin={profile.role==='admin'}/>}
    {route==='branch-sheets' && profile.role==='admin' && <BranchSheets branches={branches} initialBranchId={branchId}/>}
    {route==='branches' && profile.role==='admin' && <BranchesPage/>}
    {route==='users' && profile.role==='admin' && <UsersPage/>}
    {route==='settings' && <Settings/>}
   </section>
  </main>
 </div>
}
