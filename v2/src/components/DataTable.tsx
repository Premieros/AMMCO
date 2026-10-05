import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import {jsPDF} from 'jspdf'

export type Column<T>={
 key:keyof T|string
 label:string
 render?:(row:T)=>ReactNode
 numeric?:boolean
 filter?:boolean
 total?:boolean
}

const raw=(row:Record<string,any>,key:string)=>row[key]
const display=(v:any)=>{
 if(v===null||v===undefined||v==='')return '—'
 if(typeof v==='boolean')return v?'نعم':'لا'
 if(typeof v==='number')return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v)
 return String(v)
}

export function DataTable<T extends Record<string,any>>({title,columns,rows}:{title:string;columns:Column<T>[];rows:T[]}){
 const [search,setSearch]=useState('')
 const [sort,setSort]=useState<{key:string;dir:'asc'|'desc'}|null>(null)
 const [filters,setFilters]=useState<Record<string,string>>({})
 const wrapRef=useRef<HTMLDivElement>(null)

 useEffect(()=>{
  const el=wrapRef.current
  if(!el)return
  let down=false,startX=0,startLeft=0,moved=false
  const onDown=(e:MouseEvent)=>{
   if(e.button!==0||(e.target as HTMLElement).closest('button,input,select,textarea,a,label'))return
   down=true;moved=false;startX=e.clientX;startLeft=el.scrollLeft;el.classList.add('dragging');e.preventDefault()
  }
  const onMove=(e:MouseEvent)=>{if(!down)return;const dx=e.clientX-startX;if(Math.abs(dx)>3)moved=true;el.scrollLeft=startLeft-dx}
  const onUp=()=>{down=false;el.classList.remove('dragging')}
  const onClick=(e:MouseEvent)=>{if(moved&&!(e.target as HTMLElement).closest('button,input,select,textarea,a,label')){e.preventDefault();e.stopPropagation();moved=false}}
  el.addEventListener('mousedown',onDown);window.addEventListener('mousemove',onMove);window.addEventListener('mouseup',onUp);el.addEventListener('click',onClick,true)
  return()=>{el.removeEventListener('mousedown',onDown);window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp);el.removeEventListener('click',onClick,true)}
 },[])

 const filtered=useMemo(()=>{
  const q=search.trim().toLowerCase()
  const out=rows.filter(row=>{
   if(q&&!columns.some(c=>display(raw(row,String(c.key))).toLowerCase().includes(q)))return false
   for(const [key,val] of Object.entries(filters)){
    if(val&&display(raw(row,key))!==val)return false
   }
   return true
  })
  if(!sort)return out
  return [...out].sort((a,b)=>{
   const av=raw(a,sort.key),bv=raw(b,sort.key)
   const an=Number(av),bn=Number(bv)
   const cmp=Number.isFinite(an)&&Number.isFinite(bn)?an-bn:String(av??'').localeCompare(String(bv??''),'ar',{numeric:true})
   return sort.dir==='asc'?cmp:-cmp
  })
 },[rows,columns,search,filters,sort])

 const uniqueValues=(key:string)=>[...new Set(rows.map(r=>display(raw(r,key))).filter(v=>v!=='—'))].sort((a,b)=>a.localeCompare(b,'ar',{numeric:true})).slice(0,250)

 const totalFor=(c:Column<T>)=>{
  if(!(c.total??c.numeric))return null
  let found=false,sum=0
  for(const r of filtered){
   const n=Number(raw(r,String(c.key)))
   if(Number.isFinite(n)){sum+=n;found=true}
  }
  return found?sum:null
 }

 const toggleSort=(key:string)=>{
  setSort(s=>!s||s.key!==key?{key,dir:'asc'}:s.dir==='asc'?{key,dir:'desc'}:null)
 }

 const exportExcel=()=>{
  const data=filtered.map(r=>Object.fromEntries(columns.map(c=>[c.label,raw(r,String(c.key))??''])))
  const ws=XLSX.utils.json_to_sheet(data)
  const wb=XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb,ws,title.slice(0,31)||'Report')
  XLSX.writeFile(wb,(title||'report')+'.xlsx')
 }

 const printableTable=()=>{
  const host=wrapRef.current?.querySelector('table')
  if(!host)return null
  const clone=host.cloneNode(true) as HTMLTableElement
  clone.querySelectorAll('.column-filter').forEach(x=>x.remove())
  clone.querySelectorAll('.sort-head b').forEach(x=>x.remove())
  clone.querySelectorAll('button').forEach(x=>{const span=x.querySelector('span');if(span)x.replaceWith(span.cloneNode(true))})
  return clone
 }

 const printTable=()=>{
  const clone=printableTable()
  if(!clone)return
  const w=window.open('','_blank','width=1200,height=800')
  if(!w)return
  w.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>'+title+'</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:"Noto Sans Arabic",Tahoma,Arial,sans-serif;padding:8px;color:#172033}h1{font-size:18px;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #cbd5e1;padding:6px 7px;text-align:right}th{background:#eef3f8;color:#172033;font-weight:700}tbody tr:nth-child(even){background:#f8fafc}.num{direction:ltr;text-align:right;font-variant-numeric:tabular-nums}tfoot{font-weight:700;background:#e8eef5}</style></head><body><h1>'+title+'</h1>'+clone.outerHTML+'</body></html>')
  w.document.close();w.focus();setTimeout(()=>w.print(),180)
 }

 const makePdfBlob=async()=>{
  const clone=printableTable()
  if(!clone)throw new Error('لا يوجد جدول للتصدير')
  const host=document.createElement('div')
  host.dir='rtl'
  host.className='pdf-capture'
  host.innerHTML='<h1>'+title+'</h1>'
  host.appendChild(clone)
  Object.assign(host.style,{position:'fixed',left:'-12000px',top:'0',width:'1400px',background:'#fff',padding:'24px',zIndex:'-1'})
  document.body.appendChild(host)
  try{
   const canvas=await html2canvas(host,{backgroundColor:'#ffffff',scale:1.4,useCORS:true,windowWidth:1500})
   const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true})
   const pageW=pdf.internal.pageSize.getWidth(),pageH=pdf.internal.pageSize.getHeight()
   const imgW=pageW-12,ratio=imgW/canvas.width,imgH=canvas.height*ratio
   const data=canvas.toDataURL('image/jpeg',0.92)
   let offset=0,page=0
   while(offset<imgH){
    if(page>0)pdf.addPage()
    pdf.addImage(data,'JPEG',6,6-offset,imgW,imgH,undefined,'FAST')
    offset+=pageH-12
    page++
   }
   return pdf.output('blob')
  }finally{host.remove()}
 }

 const downloadPdf=async()=>{
  const blob=await makePdfBlob()
  const url=URL.createObjectURL(blob),a=document.createElement('a')
  a.href=url;a.download=(title||'report')+'.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
 }

 const shareWhatsApp=async()=>{
  const blob=await makePdfBlob()
  const file=new File([blob],(title||'report')+'.pdf',{type:'application/pdf'})
  const shareData={title,text:'تقرير '+title,files:[file]}
  if(navigator.share&&navigator.canShare?.(shareData)){
   await navigator.share(shareData)
   return
  }
  const text='تقرير '+title+'\n'+location.href
  window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener,noreferrer')
 }

 return <section className="panel table-panel">
  <div className="table-head">
   <div><h2>{title}</h2><span>{filtered.length} من {rows.length} سجل</span></div>
   <div className="table-tools">
    <input className="table-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث…"/>
    <button className="small-btn" onClick={()=>{setSearch('');setFilters({});setSort(null)}}>مسح الفلاتر</button>
    <button className="small-btn" onClick={exportExcel}>Excel</button>
    <button className="small-btn" onClick={()=>void downloadPdf()}>PDF</button>
    <button className="small-btn" onClick={()=>void shareWhatsApp()}>واتساب</button>
    <button className="small-btn" onClick={printTable}>طباعة</button>
   </div>
  </div>
  <div className="table-wrap" ref={wrapRef}>
   <table>
    <thead>
     <tr>{columns.map(c=>{
      const key=String(c.key),active=sort?.key===key
      return <th key={key} className={c.numeric?'num':''}>
       <button className={'sort-head '+(active?'active':'')} onClick={()=>toggleSort(key)} title="ترتيب">
        <span>{c.label}</span><b>{active?(sort?.dir==='asc'?'↑':'↓'):'↕'}</b>
       </button>
       {c.filter!==false&&<select className="column-filter" value={filters[key]||''} onChange={e=>setFilters(s=>({...s,[key]:e.target.value}))}>
        <option value="">الكل</option>
        {uniqueValues(key).map(v=><option key={v} value={v}>{v}</option>)}
       </select>}
      </th>
     })}</tr>
    </thead>
    <tbody>
     {filtered.length?filtered.map((row,i)=><tr key={i}>{columns.map(c=><td key={String(c.key)} className={c.numeric?'num':''}>{c.render?c.render(row):display(raw(row,String(c.key)))}</td>)}</tr>):<tr><td colSpan={columns.length} className="empty">لا توجد بيانات في الفترة المحددة</td></tr>}
    </tbody>
    {!!filtered.length&&<tfoot><tr>{columns.map((c,i)=>{
     if(i===0)return <th key={String(c.key)}>الإجمالي</th>
     const t=totalFor(c)
     return <td key={String(c.key)} className={c.numeric?'num':''}>{t===null?'':new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(t)}</td>
    })}</tr></tfoot>}
   </table>
  </div>
 </section>
}
