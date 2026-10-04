import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
import {LayoutDashboard,FileBarChart2,Users,Receipt,WalletCards,Upload,UserCog} from 'lucide-react'
const nav=[['dashboard','لوحة التحكم',LayoutDashboard],['reports','التقارير',FileBarChart2],['reps','المناديب',Users],['expenses','المصروفات',Receipt],['treasury','الخزينة',WalletCards],['imports','الاستيراد',Upload],['users','إدارة المستخدمين',UserCog]] as const
export function App(){
 const [ready,setReady]=useState(false)
 useEffect(()=>{supabase.auth.getSession().finally(()=>setReady(true))},[])
 if(!ready)return <div className="boot">AMMCO</div>
 return <div className="app-shell"><aside><div className="brand"><b>AMMCO</b><span>Management Intelligence v2</span></div><nav>{nav.map(([id,label,Icon])=><button key={id}><Icon size={18}/><span>{label}</span></button>)}</nav></aside><main><header><h1>AMMCO v2</h1><span>مصدر واحد لكل رقم</span></header><section className="welcome"><h2>نظام الإدارة والتحليل</h2><p>هذه هي البنية الجديدة التي ستستبدل النسخة القديمة بعد اكتمال التحقق والمطابقة.</p></section></main></div>
}
