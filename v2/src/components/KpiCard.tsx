type Props={title:string;value:string;hint?:string}
export function KpiCard({title,value,hint}:Props){
 return <article className="kpi-card"><span>{title}</span><strong>{value}</strong>{hint&&<small>{hint}</small>}</article>
}
