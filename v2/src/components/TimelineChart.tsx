import {useMemo,useState} from 'react'
import type {DashboardPoint} from '../data/dashboard'

const money=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)
const compact=(n:number)=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(n)
type Mode='day'|'week'|'month'
const weekKey=(date:string)=>{const d=new Date(date+'T00:00:00Z'),start=new Date(Date.UTC(d.getUTCFullYear(),0,1)),n=Math.floor((d.getTime()-start.getTime())/86400000),w=Math.floor((n+start.getUTCDay())/7)+1;return d.getUTCFullYear()+'-W'+String(w).padStart(2,'0')}
const labelDate=(value:string,mode:Mode)=>{
 if(mode==='month'){const [y,m]=value.split('-').map(Number);return new Intl.DateTimeFormat('ar-EG',{month:'short',year:'numeric'}).format(new Date(Date.UTC(y,m-1,1)))}
 if(mode==='week')return 'أسبوع '+value.split('-W')[1]
 const d=new Date(value+'T00:00:00Z')
 return new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'short'}).format(d)
}

export function TimelineChart({points}:{points:DashboardPoint[]}){
 const [series,setSeries]=useState<'sales'|'expenses'|'collections'>('sales')
 const [mode,setMode]=useState<Mode>('day')
 const [hovered,setHovered]=useState<number|null>(null)
 const grouped=useMemo(()=>{
  if(mode==='day')return points
  const m=new Map<string,DashboardPoint>()
  for(const p of points){const key=mode==='month'?p.date.slice(0,7):weekKey(p.date),x=m.get(key)||{date:key,sales:0,expenses:0,collections:0};x.sales+=p.sales;x.expenses+=p.expenses;x.collections+=p.collections;m.set(key,x)}
  return [...m.values()].sort((a,b)=>a.date.localeCompare(b.date))
 },[points,mode])

 const vals=useMemo(()=>grouped.map(p=>Number(p[series]||0)),[grouped,series])
 const max=Math.max(1,...vals)
 const w=960,h=300,padL=58,padR=24,padT=24,padB=46
 const innerW=w-padL-padR,innerH=h-padT-padB
 const xy=vals.map((v,i)=>({x:grouped.length<=1?padL+innerW/2:padL+i*(innerW/(grouped.length-1)),y:padT+innerH-(v/max)*innerH,v}))
 const linePath=xy.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ')
 const areaPath=xy.length?linePath+' L '+xy[xy.length-1].x.toFixed(1)+' '+(padT+innerH)+' L '+xy[0].x.toFixed(1)+' '+(padT+innerH)+' Z':''
 const ticks=[0,.25,.5,.75,1]
 const active=hovered==null?null:xy[hovered]
 const seriesLabel=series==='sales'?'المبيعات':series==='expenses'?'المصروفات':'التحصيل'
 const labelStep=Math.max(1,Math.ceil(grouped.length/8))

 return <section className="panel chart-card premium-chart">
  <div className="chart-head premium-chart-head">
   <div><span className="chart-eyebrow">الاتجاه الزمني</span><h2>حركة {seriesLabel}</h2><small>{grouped.length} نقطة في الفترة</small></div>
   <div className="chart-controls">
    <div className="segmented-control">
     <button className={mode==='day'?'active':''} onClick={()=>setMode('day')}>يومي</button>
     <button className={mode==='week'?'active':''} onClick={()=>setMode('week')}>أسبوعي</button>
     <button className={mode==='month'?'active':''} onClick={()=>setMode('month')}>شهري</button>
    </div>
    <div className="segmented-control metric-segment">
     <button className={series==='sales'?'active':''} onClick={()=>setSeries('sales')}>المبيعات</button>
     <button className={series==='expenses'?'active':''} onClick={()=>setSeries('expenses')}>المصروفات</button>
     <button className={series==='collections'?'active':''} onClick={()=>setSeries('collections')}>التحصيل</button>
    </div>
   </div>
  </div>
  <div className="svg-chart-wrap premium-svg-chart" onMouseLeave={()=>setHovered(null)}>
   <svg viewBox={'0 0 '+w+' '+h} role="img" aria-label={'حركة '+seriesLabel}>
    <defs>
     <linearGradient id="ammco-area-gradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="currentColor" stopOpacity=".24"/>
      <stop offset="100%" stopColor="currentColor" stopOpacity=".02"/>
     </linearGradient>
    </defs>
    {ticks.map((t,i)=>{const y=padT+innerH-(t*innerH);return <g key={i}><line x1={padL} x2={w-padR} y1={y} y2={y} className="chart-grid-line"/><text x={padL-10} y={y+4} textAnchor="end" className="chart-axis-label">{compact(max*t)}</text></g>})}
    {areaPath&&<path d={areaPath} fill="url(#ammco-area-gradient)" stroke="none"/>}
    {linePath&&<path d={linePath} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}
    {xy.map((p,i)=><g key={i} onMouseEnter={()=>setHovered(i)} className="chart-point-hit">
     <circle cx={p.x} cy={p.y} r={hovered===i?5:3.2} className="chart-point"/>
     <circle cx={p.x} cy={p.y} r="12" fill="transparent"/>
    </g>)}
    {grouped.map((p,i)=>i%labelStep===0||i===grouped.length-1?<text key={p.date} x={xy[i]?.x||padL} y={h-14} textAnchor="middle" className="chart-axis-date">{labelDate(p.date,mode)}</text>:null)}
    {active&&hovered!==null&&<>
     <line x1={active.x} x2={active.x} y1={padT} y2={padT+innerH} className="chart-hover-line"/>
     <g transform={'translate('+(Math.min(w-190,Math.max(10,active.x-75)))+','+(Math.max(10,active.y-74))+')'}>
      <rect width="170" height="58" rx="10" className="chart-tooltip-bg"/>
      <text x="85" y="21" textAnchor="middle" className="chart-tooltip-date">{labelDate(grouped[hovered].date,mode)}</text>
      <text x="85" y="43" textAnchor="middle" className="chart-tooltip-value">{money(active.v)} ج.م</text>
     </g>
    </>}
   </svg>
  </div>
 </section>
}
