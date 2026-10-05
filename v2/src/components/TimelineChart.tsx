import {useMemo,useState} from 'react'
import type {DashboardPoint} from '../data/dashboard'

const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
export function TimelineChart({points}:{points:DashboardPoint[]}){
 const [series,setSeries]=useState<'sales'|'expenses'|'collections'>('sales')
 const vals=useMemo(()=>points.map(p=>Number(p[series]||0)),[points,series])
 const max=Math.max(1,...vals),w=900,h=260,pad=28
 const path=vals.map((v,i)=>{const x=points.length<=1?pad:pad+i*((w-pad*2)/(points.length-1)),y=h-pad-(v/max)*(h-pad*2);return (i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)}).join(' ')
 return <section className="panel chart-card"><div className="chart-head"><div><h2>حركة الفترة</h2><span>{points.length} يوم</span></div><div className="inline-actions"><button className={'small-btn '+(series==='sales'?'active':'')} onClick={()=>setSeries('sales')}>المبيعات</button><button className={'small-btn '+(series==='expenses'?'active':'')} onClick={()=>setSeries('expenses')}>المصروفات</button><button className={'small-btn '+(series==='collections'?'active':'')} onClick={()=>setSeries('collections')}>التحصيل</button></div></div><div className="svg-chart-wrap"><svg viewBox={'0 0 '+w+' '+h} role="img"><path d={path} fill="none" stroke="currentColor" strokeWidth="3"/>{vals.map((v,i)=>{const x=points.length<=1?pad:pad+i*((w-pad*2)/(points.length-1)),y=h-pad-(v/max)*(h-pad*2);return <g key={i}><circle cx={x} cy={y} r="3.5" fill="currentColor"><title>{points[i].date+' — '+money(v)}</title></circle></g>})}</svg></div></section>
}
