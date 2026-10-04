import {useEffect,useMemo,useState} from 'react'
import type {Session} from '@supabase/supabase-js'
import {supabase} from '../lib/supabase'
import {getAllowedBranchIds,getBranches,getLatestApprovedPeriod,getProfile} from '../data/core'
import type {Branch,Profile} from '../domain/types'
import {Dashboard} from '../pages/Dashboard'
import {Reports} from '../pages/Reports'
import {Reps} from '../pages/Reps'
import {Receivables} from '../pages/Receivables'
import {Expenses} from '../pages/Expenses'
import {Treasury} from '../pages/Treasury'
import {Imports} from '../pages/Imports'
import {Inventory} from '../pages/Inventory'
import {Vehicles} from '../pages/Vehicles'
import {UsersPage} from '../pages/Users'
import {Login} from '../pages/Login'
import {LayoutDashboard,FileBarChart2,Users,Receipt,WalletCards,Upload,UserCog,LogOut,Boxes,Truck} from 'lucide-react'

type Route='dashboard'|'reports'|'reps'|'receivables'|'expenses'|'treasury'|'inventory'|'vehicles'|'imports'|'users'
const nav=[
 ['dashboard','لوحة التحكم',LayoutDashboard],
 ['reports','التقارير',FileBarChart2],
 ['reps','المناديب',Users],
 ['receivables','المديونية والتحصيل',WalletCards],
 ['expenses','المصروفات',Receipt],
 ['treasury','الخزينة',WalletCards],
 ['inventory','المخزون',Boxes],
 ['vehicles','السيارات وبترو اب',Truck],
 ['imports','الاستيراد',Upload],
 ['users','إدارة المستخدمين',UserCog],
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

 const period=useMemo(()=>month?monthBounds(month):{from:'',to:''},[month])
 if(!ready)return <div className="boot">AMMCO</div>
 if(!session)return <Login/>
 if(error)return <main className="login-page"><div className="login-card"><div className="error-box">{error}</div><button className="primary" onClick={()=>supabase.auth.signOut()}>خروج</button></div></main>
 if(!profile||!month)return <div className="boot">AMMCO</div>

 const visibleNav=nav.filter(([id])=>id!=='users'||profile.role==='admin')
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
     <label>الشهر<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
     <label>الفرع<select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">كل الفروع</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
     <span className="user-chip">{profile.full_name||session.user.email}</span>
     <button className="icon-btn" title="خروج" onClick={()=>supabase.auth.signOut()}><LogOut size={17}/></button>
    </div>
   </header>

   {route==='dashboard' && <Dashboard from={period.from} to={period.to} branchId={branchId||undefined}/>}
   {route==='reports' && <Reports from={period.from} to={period.to} branchId={branchId||undefined}/>}
   {route==='reps' && <Reps from={period.from} to={period.to} branchId={branchId||undefined}/>}
   {route==='receivables' && <Receivables from={period.from} to={period.to} branchId={branchId||undefined}/>}
   {route==='expenses' && <Expenses from={period.from} to={period.to} month={month} branchId={branchId||undefined} branches={branches} isAdmin={profile.role==='admin'}/>}
   {route==='treasury' && <Treasury from={period.from} to={period.to} branchId={branchId||undefined} branches={branches}/>}
   {route==='inventory' && <Inventory from={period.from} to={period.to} branchId={branchId||undefined}/>}
   {route==='vehicles' && <Vehicles from={period.from} to={period.to} month={month} branchId={branchId||undefined} branches={branches} isAdmin={profile.role==='admin'}/>}
   {route==='imports' && <Imports month={month} branchId={branchId||undefined} branches={branches} isAdmin={profile.role==='admin'}/>}
   {route==='users' && profile.role==='admin' && <UsersPage/>}
  </main>
 </div>
}
