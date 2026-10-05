import {useEffect,useMemo,useState} from 'react'
import type {Session} from '@supabase/supabase-js'
import {supabase} from '../lib/supabase'
import {getAllowedBranchIds,getBranches,getLatestApprovedPeriod,getProfile} from '../data/core'
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
import {Login} from '../pages/Login'
import {LayoutDashboard,FileBarChart2,Users,Receipt,WalletCards,Upload,UserCog,LogOut,Boxes,Truck,Settings as SettingsIcon} from 'lucide-react'

type Route='dashboard'|'reports'|'reps'|'rep-daily'|'receivables'|'monthly'|'products'|'banks'|'expenses'|'treasury'|'inventory'|'vehicles'|'imports'|'branches'|'users'|'settings'
const nav=[
 ['dashboard','لوحة التحكم',LayoutDashboard],
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
 const [manualFrom,setManualFrom]=useState('')
 const [manualTo,setManualTo]=useState('')
 const [manualPeriod,setManualPeriod]=useState(false)
 const [ready,setReady]=useState(false)
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
  Promise.all([getProfile(session.user.id),getBranches(),getLatestApprovedPeriod()])
   .then(async([p,b,period])=>{
    if(!live)return
    if(!p||!p.is_active)throw new Error('الحساب غير نشط أو غير مربوط بالمؤسسة.')
    const ids=await getAllowedBranchIds(session.user.id,p.role)
    if(!live)return
    setProfile(p);setAllowedIds(ids)
    setBranches((p.role==='admin'||p.role==='analyst')?b:b.filter(x=>ids.includes(x.id)))
    const initial=(period?.period_end||new Date().toISOString().slice(0,10)).slice(0,7)
    setMonth(initial)
    setReady(true)
   })
   .catch(e=>{if(live){setError(e.message||String(e));setReady(true)}})
  return()=>{live=false}
 },[session?.user.id])

 const period=useMemo(()=>manualPeriod&&manualFrom&&manualTo&&manualTo>=manualFrom?{from:manualFrom,to:manualTo}:month?monthBounds(month):{from:'',to:''},[month,manualPeriod,manualFrom,manualTo])
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

 const visibleNav=nav.filter(([id])=>!['users','branches'].includes(id)||profile.role==='admin')
 const activeBranch=branches.find(b=>b.id===branchId)

 return <div className="app-shell">
  <aside>
   <div className="brand"><b>AMMCO</b><span>Management Intelligence v2</span></div>
   <nav>{visibleNav.map(([id,label,Icon])=><a key={id} className={route===id?'active':''} href={'#/'+id}><Icon size={18}/><span>{label}</span></a>)}</nav>
  </aside>
  <main>
   <header className="topbar">
    <div><h1>{visibleNav.find(x=>x[0]===route)?.[1]||'AMMCO'}</h1><span>{activeBranch?.name||'كل الفروع'} • {month}</span></div>
    <div className="top-actions">
     <label>الشهر<input type="month" value={month} onChange={e=>{setMonth(e.target.value);setManualPeriod(false)}}/></label>
     <label>من<input type="date" value={manualFrom||period.from} onChange={e=>setManualFrom(e.target.value)}/></label>
     <label>إلى<input type="date" value={manualTo||period.to} onChange={e=>setManualTo(e.target.value)}/></label>
     <button className={'small-btn '+(manualPeriod?'active':'')} onClick={()=>{if(!manualPeriod){setManualFrom(manualFrom||period.from);setManualTo(manualTo||period.to)}setManualPeriod(!manualPeriod)}}>{manualPeriod?'العودة للشهر':'تطبيق الفترة'}</button>
     <div className="preset-actions"><button className="small-btn" onClick={()=>applyPreset('month')}>هذا الشهر</button><button className="small-btn" onClick={()=>applyPreset('prev')}>الشهر السابق</button><button className="small-btn" onClick={()=>applyPreset('ytd')}>YTD</button><button className="small-btn" onClick={()=>applyPreset('last7')}>آخر 7 أيام</button></div>
     <label>الفرع<select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">كل الفروع</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
     <span className="user-chip">{profile.full_name||session.user.email}</span>
     <button className="icon-btn" title="خروج" onClick={()=>supabase.auth.signOut()}><LogOut size={17}/></button>
    </div>
   </header>

   {route==='dashboard' && <Dashboard from={period.from} to={period.to} branchId={branchId||undefined}/>}
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
   {route==='branches' && profile.role==='admin' && <BranchesPage/>}
   {route==='users' && profile.role==='admin' && <UsersPage/>}
   {route==='settings' && <Settings/>}
  </main>
 </div>
}
