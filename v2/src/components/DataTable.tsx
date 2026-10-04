import type {ReactNode} from 'react'

export type Column<T>={key:keyof T|string;label:string;render?:(row:T)=>ReactNode;numeric?:boolean}

export function DataTable<T extends Record<string,any>>({title,columns,rows}:{title:string;columns:Column<T>[];rows:T[]}){
 return <section className="panel table-panel">
  <div className="table-head"><div><h2>{title}</h2><span>{rows.length} سجل</span></div></div>
  <div className="table-wrap"><table><thead><tr>{columns.map(c=><th key={String(c.key)}>{c.label}</th>)}</tr></thead>
  <tbody>{rows.length?rows.map((row,i)=><tr key={i}>{columns.map(c=><td key={String(c.key)} className={c.numeric?'num':''}>{c.render?c.render(row):String(row[c.key as keyof T]??'—')}</td>)}</tr>):<tr><td colSpan={columns.length} className="empty">لا توجد بيانات في الفترة المحددة</td></tr>}</tbody></table></div>
 </section>
}
