import type {ReactNode} from 'react'

type Tone='blue'|'green'|'amber'|'red'|'violet'|'cyan'|'neutral'
type Props={title:string;value:string;hint?:string;icon?:ReactNode;tone?:Tone;featured?:boolean}

export function KpiCard({title,value,hint,icon,tone='blue',featured=false}:Props){
 return <article className={'kpi-card premium-kpi tone-'+tone+(featured?' featured':'')}>
  <div className="kpi-card-top">
   <div className="kpi-copy"><span>{title}</span><strong>{value}</strong></div>
   {icon&&<div className="kpi-icon" aria-hidden="true">{icon}</div>}
  </div>
  {hint&&<small>{hint}</small>}
 </article>
}
