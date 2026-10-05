import {useMemo,useState} from 'react'
import type {DashboardPoint} from '../data/dashboard'

const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
type Mode='day'|'week'|'month'
const weekKey=(date:string)=>{const d=new Date(date+'T00:00:00Z'),start=new Date(Date.UTC(d.getUTCFullYear(),0,1)),n=Math.floor((d.getTime()-start.getTime())/86400000),w=Math.floor((n+start.getUTCDay())/7)+1;return d.getUTCFullYear()+'-W'+String(w).padStart(2,'0')}

export function TimelineChart({points}:{points:DashboardPoint[]}){
 const [series,setSeries]=useState<'sales'|'expenses'|'collections'>('sales')
 const [mode,setMode]=useState<Mode>('day')
 const grouped=useMemo(()=>{
  if(mode==='day')return points
  const m=new Map<string,DashboardPoint>()
  for(const p of points){const key=mode==='month'?p.date.slice(0,7):weekKey(p.date),x=m.get(key)||{date:key,sales:0,expenses:0,collections:0};x.sales+=p.sales;x.expenses+=p.expenses;x.collections+=p.collections;m.set(key,x)}
  return [...m.values()].sort((a,b)=>a.date.localeCompare(b.date))
 },[points,mode])
 const vals=useMemo(()=>grouped.map(p=>Number(p[series]||0)),[grouped,series])
 const max=Math.max(1,...vals),w=900,h=260,pad=28
 const path=vals.map((v,i)=>{const x=grouped.length<=1?pad:pad+i*((w-pad*2)/(grouped.length-1)),y=h-pad-(v/max)*(h-pad*2);return (i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)}).join(' ')
 return <section className="panel chart-card"><div className="chart-head"><div><h2>حركة الفترة</h2><span>{grouped.length} نقطة</span></div><div className="chart-controls"><div className="inline-actions"><button className={'small-btn '+(mode==='day'?'active':'')} onClick={()=>setMode('day')}>يومي</button><button className={'small-btn '+(mode==='week'?'active':'')} onClick={()=>setMode('week')}>أسبوعي</button><button className={'small-btn '+(mode==='month'?'active':'')} onClick={()=>setMode('month')}>شهري</button></div><div className="inline-actions"><button className={'small-btn '+(series==='sales'?'active':'')} onClick={()=>setSeries('sales')}>المبيعات</button><button className={'small-btn '+(series==='expenses'?'active':'')} onClick={()=>setSeries('expenses')}>المصروفات</button><button className={'small-btn '+(series==='collections'?'active':'')} onClick={()=>setSeries('collections')}>التحصيل</button></div></div></div><div className="svg-chart-wrap"><svg viewBox={'0 0 '+w+' '+h} role="img"><path d={path} fill="none" stroke="currentColor" strokeWidth="3"/>{vals.map((v,i)=>{const x=grouped.length<=1?pad:pad+i*((w-pad*2)/(grouped.length-1)),y=h-pad-(v/max)*(h-pad*2);return <circle key={i} cx={x} cy={y} r="3.5" fill="currentColor"><title>{grouped[i].date+' — '+money(v)}</title></circle>})}</svg></div></section>
}
