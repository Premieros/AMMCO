import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react'
import {Columns3,Download,MoreHorizontal,Search,SlidersHorizontal} from 'lucide-react'
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
 const [showColumns,setShowColumns]=useState(false)
 const [showMore,setShowMore]=useState(false)
 const widthStorageKey='ammco:column-widths:'+title
 const [columnWidths,setColumnWidths]=useState<Record<string,number>>(()=>{try{const saved=localStorage.getItem(widthStorageKey);const parsed=saved?JSON.parse(saved):{};return parsed&&typeof parsed==='object'?parsed:{}}catch{return {}}})
 const storageKey='ammco:columns:'+title
 const [visibleKeys,setVisibleKeys]=useState<string[]>(()=>{try{const saved=localStorage.getItem(storageKey);const parsed=saved?JSON.parse(saved):null;return Array.isArray(parsed)?parsed:columns.map(c=>String(c.key))}catch{return columns.map(c=>String(c.key))}})
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

 useEffect(()=>{const valid=new Set(columns.map(c=>String(c.key)));setVisibleKeys(prev=>{const next=prev.filter(k=>valid.has(k));return next.length?next:columns.map(c=>String(c.key))})},[columns])
 useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(visibleKeys))}catch{}},[storageKey,visibleKeys])
 useEffect(()=>{try{localStorage.setItem(widthStorageKey,JSON.stringify(columnWidths))}catch{}},[widthStorageKey,columnWidths])
 const visibleColumns=useMemo(()=>columns.filter(c=>visibleKeys.includes(String(c.key))),[columns,visibleKeys])
 const filtered=useMemo(()=>{
  const q=search.trim().toLowerCase()
  const out=rows.filter(row=>{
   if(q&&!visibleColumns.some(c=>display(raw(row,String(c.key))).toLowerCase().includes(q)))return false
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
 },[rows,visibleColumns,search,filters,sort])

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

 const startResize=(e:React.MouseEvent<HTMLSpanElement>,key:string)=>{
  e.preventDefault();e.stopPropagation()
  const th=e.currentTarget.closest('th') as HTMLTableCellElement|null
  if(!th)return
  const startX=e.clientX,startWidth=th.getBoundingClientRect().width
  const onMove=(ev:MouseEvent)=>{
   const delta=startX-ev.clientX
   setColumnWidths(w=>({...w,[key]:Math.max(70,Math.round(startWidth+delta))}))
  }
  const onUp=()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp)}
  window.addEventListener('mousemove',onMove);window.addEventListener('mouseup',onUp)
 }
 const toggleSort=(key:string)=>{
  setSort(s=>!s||s.key!==key?{key,dir:'asc'}:s.dir==='asc'?{key,dir:'desc'}:null)
 }

 const exportExcel=()=>{
  const data=filtered.map(r=>Object.fromEntries(visibleColumns.map(c=>[c.label,raw(r,String(c.key))??''])))
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
  w.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>'+title+'</title><style>@page{size:A4 landscape;margin:5mm}html,body{margin:0;padding:0}body{font-family:"Noto Sans Arabic",Tahoma,Arial,sans-serif;color:#172033}h1{font-size:16px;margin:0 0 8px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5px;page-break-inside:auto}thead{display:table-header-group}tfoot{display:table-footer-group}tr{page-break-inside:avoid;page-break-after:auto}th,td{border:1px solid #cbd5e1;padding:4px 5px;text-align:right;white-space:normal;word-break:break-word;overflow-wrap:anywhere}th{background:#eef3f8;color:#172033;font-weight:700}.num{direction:ltr;text-align:right;font-variant-numeric:tabular-nums}tfoot{font-weight:700;background:#e8eef5}</style></head><body><h1>'+title+'</h1>'+clone.outerHTML+'</body></html>')
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
   const margin=4,printW=pageW-margin*2,printH=pageH-margin*2
   const ratio=printW/canvas.width
   const renderedH=canvas.height*ratio
   const slicePx=Math.floor(printH/ratio)
   let sourceY=0,page=0
   while(sourceY<canvas.height){
    const sourceH=Math.min(slicePx,canvas.height-sourceY)
    const pageCanvas=document.createElement('canvas')
    pageCanvas.width=canvas.width
    pageCanvas.height=sourceH
    const ctx=pageCanvas.getContext('2d')
    if(!ctx)throw new Error('تعذر تجهيز صفحة PDF')
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,pageCanvas.width,pageCanvas.height)
    ctx.drawImage(canvas,0,sourceY,canvas.width,sourceH,0,0,canvas.width,sourceH)
    const pageImg=pageCanvas.toDataURL('image/jpeg',0.92)
    const pageImgH=sourceH*ratio
    if(page>0)pdf.addPage()
    pdf.addImage(pageImg,'JPEG',margin,margin,printW,pageImgH,undefined,'FAST')
    sourceY+=sourceH
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
   <div className="table-tools compact-tools">
    <div className="search-shell"><Search size={15}/><input className="table-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث…"/></div>
    <button className="icon-btn table-icon-btn" title="مسح البحث والفلاتر" onClick={()=>{setSearch('');setFilters({});setSort(null)}}><SlidersHorizontal size={16}/></button>
    <div className="column-picker-wrap"><button className={'icon-btn table-icon-btn '+(showColumns?'active':'')} title={'الأعمدة '+visibleColumns.length+'/'+columns.length} onClick={()=>{setShowColumns(v=>!v);setShowMore(false)}}><Columns3 size={16}/></button>{showColumns&&<div className="column-picker"><div className="column-picker-head"><b>الأعمدة المعروضة</b><span>{visibleColumns.length} محدد</span></div><div className="column-picker-actions"><button type="button" className="small-btn" onClick={()=>setVisibleKeys(columns.map(c=>String(c.key)))}>تحديد الكل</button><button type="button" className="small-btn" onClick={()=>setVisibleKeys([String(columns[0]?.key||'')].filter(Boolean))}>إخفاء الكل</button></div><div className="column-picker-list">{columns.map(c=>{const key=String(c.key),checked=visibleKeys.includes(key),locked=columns[0]===c;return <label key={key}><input type="checkbox" checked={checked} disabled={locked} onChange={e=>setVisibleKeys(prev=>e.target.checked?[...new Set([...prev,key])]:prev.filter(x=>x!==key))}/><span>{c.label}</span></label>})}</div></div>}</div>
    <div className="more-wrap"><button className={'icon-btn table-icon-btn '+(showMore?'active':'')} title="المزيد" onClick={()=>{setShowMore(v=>!v);setShowColumns(false)}}><MoreHorizontal size={17}/></button>{showMore&&<div className="more-menu"><button onClick={exportExcel}><Download size={15}/><span>Excel</span></button><button onClick={()=>void downloadPdf()}><Download size={15}/><span>PDF</span></button><button onClick={()=>void shareWhatsApp()}><span>↗</span><span>واتساب</span></button><button onClick={printTable}><span>⎙</span><span>طباعة</span></button></div>}</div>
   </div>
  </div>
  <div className="table-wrap" ref={wrapRef}>
   <table>
    <thead>
     <tr>{visibleColumns.map(c=>{
      const key=String(c.key),active=sort?.key===key
      return <th key={key} className={c.numeric?'num':''} style={columnWidths[key]?{width:columnWidths[key],minWidth:columnWidths[key],maxWidth:columnWidths[key]}:undefined}>
       <button className={'sort-head '+(active?'active':'')} onClick={()=>toggleSort(key)} title="ترتيب">
        <span>{c.label}</span><b>{active?(sort?.dir==='asc'?'↑':'↓'):'↕'}</b>
       </button>
       <span className="col-resizer" onMouseDown={e=>startResize(e,key)} title="اسحب لتغيير عرض العمود"/>
       {c.filter!==false&&<select className="column-filter" value={filters[key]||''} onChange={e=>setFilters(s=>({...s,[key]:e.target.value}))}>
        <option value="">الكل</option>
        {uniqueValues(key).map(v=><option key={v} value={v}>{v}</option>)}
       </select>}
      </th>
     })}</tr>
    </thead>
    <tbody>
     {filtered.length?filtered.map((row,i)=><tr key={i}>{visibleColumns.map(c=>{const key=String(c.key);return <td key={key} className={c.numeric?'num':''} style={columnWidths[key]?{width:columnWidths[key],minWidth:columnWidths[key],maxWidth:columnWidths[key]}:undefined}>{c.render?c.render(row):display(raw(row,key))}</td>})}</tr>):<tr><td colSpan={visibleColumns.length} className="empty">لا توجد بيانات في الفترة المحددة</td></tr>}
    </tbody>
    {!!filtered.length&&<tfoot><tr>{visibleColumns.map((c,i)=>{
     if(i===0)return <th key={String(c.key)}>الإجمالي</th>
     const t=totalFor(c)
     return <td key={String(c.key)} className={c.numeric?'num':''}>{t===null?'':new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(t)}</td>
    })}</tr></tfoot>}
   </table>
  </div>
 </section>
}
