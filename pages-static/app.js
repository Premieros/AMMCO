import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm'
import { parseWorkbookBrowser } from './workbook-parser.js'
import * as XLSX from 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm'

const SUPABASE_URL='https://yumeijsyiphzdsulsubf.supabase.co'
const SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1bWVpanN5aXBoemRzdWxzdWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2ODk1ODAsImV4cCI6MjEwNjI2NTU4MH0.Hpy2VZpttnQGdrx6_6Y1c9w4iHG2HhopvFdrohk3BBE'
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
const app=document.getElementById('app')
const fmt=new Intl.NumberFormat('en-US',{maximumFractionDigits:0})
const money=v=>fmt.format(Math.round(Number(v||0)))
const qtyFmt=new Intl.NumberFormat('en-US',{maximumFractionDigits:2})
const qty=v=>qtyFmt.format(Number(v||0))
const pct=v=>`${new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(Number(v||0)*100)}%`
const route=()=>location.hash.replace(/^#\/?/,'')||'dashboard'
const qs=()=>new URLSearchParams(location.hash.includes('?')?location.hash.split('?')[1]:'')
const today=new Date()
const defaultTo=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-30`
const defaultFrom=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`

let branches=[]
let session=null
let profile=null

async function boot(){
 const {data}=await supabase.auth.getSession(); session=data.session
 if(session){
   const {data:p}=await supabase.from('profiles').select('full_name,role,is_active').eq('user_id',session.user.id).maybeSingle(); profile=p
   const {data:b}=await supabase.from('branches').select('id,name,code,is_active').eq('is_active',true).order('name'); branches=b||[]
 }
 await render()
}
window.addEventListener('hashchange',render)
supabase.auth.onAuthStateChange((_e,s)=>{session=s;setTimeout(boot,0)})

const sheetSectionForRoute=r=>{
 if(r==='reports'){
  const report=selectedReport()
  if(['executive','monthly'].includes(report))return 'الإدارة المالية'
  if(['sales','receivables','reps'].includes(report))return 'المبيعات والعملاء'
  if(['expense-matrix','expenses'].includes(report))return 'المصروفات والتكاليف'
  if(['inventory','products'].includes(report))return 'المخزون والأصناف'
  if(['treasury','banks'].includes(report))return 'النقدية والبنوك'
 }
 if(['dashboard','executive','monthly'].includes(r))return 'الإدارة المالية'
 if(['sales','receivables','reps'].includes(r))return 'المبيعات والعملاء'
 if(['expense-matrix','expenses'].includes(r))return 'المصروفات والتكاليف'
 if(['inventory','products'].includes(r))return 'المخزون والأصناف'
 if(['treasury','banks','accounting-inputs'].includes(r))return 'النقدية والبنوك'
 if(['branches','users','imports','uploads'].includes(r))return 'إدارة النظام'
 return 'الإدارة المالية'
}

const REPORT_GROUPS=[
 {label:'الإدارة المالية',items:[['executive','التقرير التنفيذي'],['monthly','التحليل الشهري وYTD']]},
 {label:'المبيعات والعملاء',items:[['sales','المبيعات'],['receivables','المديونيات والتحصيل'],['reps','أداء المناديب']]},
 {label:'المصروفات والتكاليف',items:[['expense-matrix','تحليلي المصروفات'],['expenses','تقرير المصروفات']]},
 {label:'المخزون والأصناف',items:[['inventory','حركة المخزون'],['products','أرصدة ومصفوفة الأصناف']]},
 {label:'النقدية والبنوك',items:[['treasury','الخزينة والبنوك'],['banks','البنوك وYTD']]}
]
const selectedReport=()=>qs().get('report')||'executive'
function reportsHubNav(){
 const selected=selectedReport(),p=qs(),branch=p.get('branch')||'',from=p.get('from')||defaultFrom,to=p.get('to')||defaultTo
 const options=REPORT_GROUPS.map(g=>'<optgroup label="'+g.label+'">'+g.items.map(item=>'<option value="'+item[0]+'" '+(selected===item[0]?'selected':'')+'>'+item[1]+'</option>').join('')+'</optgroup>').join('')
 return '<section class="reports-list-bar"><div class="field reports-select-field"><label>التقرير</label><select id="report-picker">'+options+'</select></div></section>'
}
window.changeUnifiedReport=select=>{
 const p=qs(),branch=p.get('branch')||'',from=p.get('from')||defaultFrom,to=p.get('to')||defaultTo
 location.hash='#/reports?report='+encodeURIComponent(select.value)+'&branch='+encodeURIComponent(branch)+'&from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to)
}

function shell(title,subtitle,body){
 const r=route().split('?')[0],sheetSection=sheetSectionForRoute(r)
 const sidebarCollapsed=localStorage.getItem('ammco.sidebar.collapsed')==='1'
 app.innerHTML=`<div class="shell ${sidebarCollapsed?'sidebar-collapsed':''}">
 <aside class="sidebar">
  <div class="brand"><div class="logo">A</div><div><b>AMMCO</b><small>Management Intelligence</small></div></div>

  <div class="nav-title">العمل المالي</div><nav class="nav">
   <a class="${r==='dashboard'?'active':''}" href="#/dashboard">لوحة الإدارة</a>
   <a class="${r==='reports'?'active':''}" href="#/reports?report=executive">التقارير</a>
  </nav>

  <div class="nav-title system-nav-title">إدارة النظام</div><nav class="nav">
   <a class="${r==='branches'?'active':''}" href="#/branches">إدارة الفروع</a>
   ${profile?.role==='admin'?`<a class="${r==='users'?'active':''}" href="#/users">المستخدمون والصلاحيات</a>`:''}
   <a class="${r==='imports'?'active':''}" href="#/imports">سجل الرفع</a>
   <a class="${r==='uploads'?'active':''}" href="#/uploads">رفع شيتات الفروع</a>
  </nav>
 </aside>

 <main class="main">
  <header class="topbar">
   <div class="topbar-context"><span>تقرير الإدارة</span><b>${sheetSection}</b></div>
   <div class="actions">
    <button class="btn secondary sidebar-toggle" type="button" onclick="toggleSidebar()" title="إخفاء أو إظهار القائمة">☰ القائمة</button>
    <button class="btn secondary" onclick="location.hash='#/branches'">+ فرع</button>
    <button class="btn" onclick="location.hash='#/uploads'">رفع شيت</button>
    <button class="btn secondary" id="logout">خروج</button>
   </div>
  </header>
  <section class="content">
   <div class="pagehead">
    <div>
     <div class="sheet-context">ورقة الإدارة / ${sheetSection}</div>
     <h1>${title}</h1>
     <div class="muted">${subtitle||''}</div>
    </div>
   </div>
   ${r==='reports'?reportsHubNav():''}
   ${body}
  </section>
 </main>
 </div>`
 document.getElementById('logout')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.hash='';})
 document.getElementById('report-picker')?.addEventListener('change',e=>changeUnifiedReport(e.currentTarget))
}
window.toggleSidebar=()=>{
 const shell=document.querySelector('.shell');if(!shell)return
 const collapsed=shell.classList.toggle('sidebar-collapsed')
 localStorage.setItem('ammco.sidebar.collapsed',collapsed?'1':'0')
}
function branchOptions(selected=''){return `<option value="">كل الفروع</option>${branches.map(b=>`<option value="${b.id}" ${selected===b.id?'selected':''}>${b.name}</option>`).join('')}`}
function filters(from,to,branch){return `<form id="filters" class="filters compact-filters">
 <div class="field filter-branch"><label>الفرع</label><select name="branch">${branchOptions(branch)}</select></div>
 <div class="field"><label>من</label><input type="date" name="from" value="${from}"></div>
 <div class="field"><label>إلى</label><input type="date" name="to" value="${to}"></div>
 <div class="filter-buttons"><button class="btn" type="submit">تطبيق</button><button class="btn secondary" type="button" onclick="resetReportFilters()">مسح</button></div>
</form>`}
function bindFilters(path){document.getElementById('filters')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);const current=route().split('?')[0];if(current==='reports'){location.hash=`#/reports?report=${selectedReport()}&branch=${f.get('branch')||''}&from=${f.get('from')}&to=${f.get('to')}`;return}location.hash=`#/${path}?branch=${f.get('branch')||''}&from=${f.get('from')}&to=${f.get('to')}`})}
function scope(from,to,branch){return `<div class="scope report-meta"><span><b>${branches.find(b=>b.id===branch)?.name||'كل الفروع'}</b></span><span>${from} → ${to}</span><span>Approved</span></div>`}
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))
const escapeAttr=v=>escapeHtml(v)
function table(title,cols,rows,totalRow=''){
 const headers=cols.map((col,index)=>{
  if(col.filter===false)return '<th>'+col.label+'</th>'
  const values=[...new Set(rows.map(r=>String(r[col.key]??'').replace(/<[^>]*>/g,'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar',{numeric:true}))
  const encoded=encodeURIComponent(JSON.stringify(values))
  return '<th><div class="th-filter-wrap"><span>'+col.label+'</span><button class="excel-filter-btn" type="button" data-col="'+index+'" data-values="'+encoded+'" onclick="openExcelFilter(this)" title="فلتر العمود">⌄</button></div></th>'
 }).join('')
 return '<section class="table-card" data-report-title="'+escapeAttr(title)+'">'+
  '<div class="table-head"><div><h2>'+title+'</h2><small>'+rows.length+' صف</small></div>'+
  '<div class="table-tools"><input class="search" placeholder="بحث…" oninput="applyTableFilters(this)">'+
  '<button class="tool-btn" type="button" onclick="clearTableFilters(this)">مسح الفلاتر</button>'+
  '<button class="tool-btn" type="button" onclick="exportVisibleTableXlsx(this)">Excel</button>'+
  '<button class="tool-btn" type="button" onclick="printReportOnly(this)">طباعة</button></div></div>'+
  '<div class="table-wrap"><table><thead><tr>'+headers+'</tr></thead><tbody>'+
  rows.map(r=>'<tr>'+cols.map(col=>'<td class="'+(col.num?'num ':'')+(col.key==='branch_name'?'row-label':'')+'">'+(r[col.key]??'-')+'</td>').join('')+'</tr>').join('')+
  totalRow+'</tbody></table></div></section>'
}
window.__tableFilters=new WeakMap()
window.openExcelFilter=button=>{
 document.getElementById('excel-filter-popover')?.remove()
 const card=button.closest('.table-card'),col=Number(button.dataset.col||0)
 const allValues=JSON.parse(decodeURIComponent(button.dataset.values||'%5B%5D'))
 const state=window.__tableFilters.get(card)||{}
 const selected=new Set(state[col]||allValues)
 const rect=button.getBoundingClientRect()
 const options=allValues.map(v=>'<label class="excel-filter-option"><input type="checkbox" value="'+escapeAttr(v)+'" '+(selected.has(v)?'checked':'')+'><span>'+escapeHtml(v)+'</span></label>').join('')
 const html='<div class="excel-filter-popover" id="excel-filter-popover" style="top:'+(rect.bottom+6+window.scrollY)+'px;left:'+Math.max(8,rect.left-225+window.scrollX)+'px">'+
  '<div class="excel-filter-search"><input placeholder="بحث في القيم…" oninput="filterExcelChoices(this)"></div>'+
  '<div class="excel-filter-actions"><button type="button" onclick="toggleExcelChoices(true)">تحديد الكل</button><button type="button" onclick="toggleExcelChoices(false)">إلغاء الكل</button></div>'+
  '<div class="excel-filter-list">'+options+'</div>'+
  '<div class="excel-filter-footer"><button class="btn secondary" type="button" onclick="document.getElementById(\'excel-filter-popover\').remove()">إلغاء</button><button class="btn" type="button" onclick="applyExcelChoiceFilter()">تطبيق</button></div></div>'
 document.body.insertAdjacentHTML('beforeend',html)
 const pop=document.getElementById('excel-filter-popover');pop.dataset.col=String(col);pop.__card=card
}
window.filterExcelChoices=input=>{
 const q=input.value.trim().toLowerCase()
 input.closest('.excel-filter-popover').querySelectorAll('.excel-filter-option').forEach(label=>label.style.display=label.innerText.toLowerCase().includes(q)?'flex':'none')
}
window.toggleExcelChoices=checked=>{
 document.querySelectorAll('#excel-filter-popover .excel-filter-option').forEach(label=>{if(label.style.display!=='none')label.querySelector('input').checked=checked})
}
window.applyExcelChoiceFilter=()=>{
 const pop=document.getElementById('excel-filter-popover');if(!pop)return
 const card=pop.__card,col=Number(pop.dataset.col)
 const picked=[...pop.querySelectorAll('.excel-filter-option input:checked')].map(x=>x.value)
 const state=window.__tableFilters.get(card)||{};state[col]=picked;window.__tableFilters.set(card,state)
 const btn=card.querySelector('.excel-filter-btn[data-col="'+col+'"]')
 if(btn){const all=JSON.parse(decodeURIComponent(btn.dataset.values||'%5B%5D'));btn.classList.toggle('active',picked.length!==all.length)}
 pop.remove();applyTableFilters(card.querySelector('.search'))
}
window.applyTableFilters=source=>{
 const card=source.closest('.table-card'),q=(card.querySelector('.search')?.value||'').trim().toLowerCase(),state=window.__tableFilters.get(card)||{}
 const rows=[...card.querySelectorAll('tbody tr:not(.total)')]
 rows.forEach(row=>{
  const cells=[...row.children]
  const globalOk=!q||row.innerText.toLowerCase().includes(q)
  const colsOk=Object.entries(state).every(([key,selected])=>Array.isArray(selected)&&selected.length>0&&selected.includes((cells[Number(key)]?.innerText||'').trim()))
  row.style.display=globalOk&&colsOk?'':'none'
 })
}
window.filterTable=input=>window.applyTableFilters(input)
window.clearTableFilters=button=>{
 const card=button.closest('.table-card');card.querySelector('.search').value='';window.__tableFilters.delete(card)
 card.querySelectorAll('.excel-filter-btn').forEach(b=>b.classList.remove('active'));applyTableFilters(card.querySelector('.search'))
}
window.resetReportFilters=()=>{const r=route().split('?')[0];location.hash=r==='reports'?'#/reports?report='+selectedReport():'#/'+r}

window.enableTableDragScroll=()=>{
 document.querySelectorAll('.table-wrap').forEach(wrap=>{
  if(wrap.dataset.dragScroll==='1')return
  wrap.dataset.dragScroll='1'
  let down=false,startX=0,startLeft=0,moved=false
  const interactive='button,input,select,textarea,a,label'
  wrap.addEventListener('mousedown',e=>{
   if(e.button!==0||e.target.closest(interactive))return
   down=true;moved=false;startX=e.clientX;startLeft=wrap.scrollLeft
   wrap.classList.add('dragging')
   e.preventDefault()
  })
  window.addEventListener('mousemove',e=>{
   if(!down)return
   const dx=e.clientX-startX
   if(Math.abs(dx)>3)moved=true
   wrap.scrollLeft=startLeft-dx
  })
  window.addEventListener('mouseup',()=>{
   if(!down)return
   down=false
   wrap.classList.remove('dragging')
  })
  wrap.addEventListener('mouseleave',()=>{
   if(!down)return
   wrap.classList.remove('dragging')
  })
  wrap.addEventListener('click',e=>{
   if(moved&&!e.target.closest(interactive)){e.preventDefault();e.stopPropagation();moved=false}
  },true)
 })
}

window.exportVisibleTableXlsx=button=>{
 const card=button.closest('.table-card'),tableEl=card.querySelector('table')
 const visibleRows=[...tableEl.querySelectorAll('tr')].filter(r=>r.style.display!=='none')
 const matrix=visibleRows.map(r=>[...r.children].map(cell=>cell.innerText.trim()))
 const ws=XLSX.utils.aoa_to_sheet(matrix)
 ws['!cols']=(matrix[0]||[]).map((_,i)=>({wch:Math.min(40,Math.max(10,...matrix.map(r=>String(r[i]||'').length+2)))}))
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Report')
 const title=(card.dataset.reportTitle||'AMMCO-report').replace(/[\\/:*?"<>|]/g,'-')
 XLSX.writeFile(wb,title+'.xlsx',{compression:true})
}
window.printReportOnly=button=>{
 const card=button.closest('.table-card'),title=card.dataset.reportTitle||'تقرير AMMCO',meta=document.querySelector('.report-meta')?.innerText||''
 const table=card.querySelector('table').cloneNode(true)
 ;[...table.querySelectorAll('tbody tr')].forEach(r=>{if(r.style.display==='none')r.remove()})
 table.querySelectorAll('.excel-filter-btn').forEach(x=>x.remove())
 const win=window.open('','_blank','width=1100,height=760');if(!win)return
 win.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>'+escapeHtml(title)+'</title><style>'+
 'body{font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,Arial,sans-serif;margin:18px;color:#172033}h1{font-size:18px;margin:0 0 4px}.meta{font-size:11px;color:#64748b;margin-bottom:12px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#dce9f4;font-weight:700}th,td{border:1px solid #d9e1ea;padding:6px 8px;text-align:right}td.num{direction:ltr;text-align:right;font-weight:600}tr:nth-child(even) td{background:#fafbfd}.total th,.total td{background:#e4eef6;font-weight:700}@page{size:landscape;margin:10mm}</style></head><body><h1>'+escapeHtml(title)+'</h1><div class="meta">'+escapeHtml(meta)+'</div>'+table.outerHTML+'<script>window.onload=function(){window.focus();window.print()}<\/script></body></html>')
 win.document.close()
}
const tableDragObserver=new MutationObserver(()=>enableTableDragScroll())
tableDragObserver.observe(app,{childList:true,subtree:true})
async function render(){
 if(!session) return renderLogin()
 if(!profile?.is_active) return shell('AMMCO','الحساب غير مهيأ أو غير نشط','<div class="notice">راجع مدير النظام لربط الحساب بالمؤسسة.</div>')
 const r=route().split('?')[0]
 try{
  if(r==='reports'){
   const report=selectedReport()
   if(report==='sales')return renderSales()
   if(report==='expenses')return renderExpenses()
   if(report==='expense-matrix')return renderExpenseMatrix()
   if(report==='receivables')return renderReceivables()
   if(report==='reps')return renderReps()
   if(report==='inventory')return renderInventory()
   if(report==='products')return renderProducts()
   if(report==='monthly')return renderMonthly()
   if(report==='banks')return renderBanks()
   if(report==='treasury')return renderTreasury()
   return renderExecutive()
  }
  if(r==='branches')return renderBranches()
  if(r==='users')return renderUsers()
  if(r==='treasury')return renderTreasury()
  if(r==='accounting-inputs'){location.hash='#/treasury';return}
  if(r==='sales')return renderSales()
  if(r==='expenses')return renderExpenses()
  if(r==='expense-matrix')return renderExpenseMatrix()
  if(r==='receivables')return renderReceivables()
  if(r==='reps')return renderReps()
  if(r==='inventory')return renderInventory()
  if(r==='products')return renderProducts()
  if(r==='monthly')return renderMonthly()
  if(r==='banks')return renderBanks()
  if(r==='imports')return renderImports()
  if(r==='uploads')return renderUploads()
  if(r==='executive')return renderExecutive()
  return renderDashboard()
 }catch(e){shell('حدث خطأ','',`<div class="error">${e.message||e}</div>`)}
}

function renderLogin(){
 app.innerHTML=`<main class="login"><section class="login-card"><h1>AMMCO</h1><div class="muted">Management Intelligence</div><div id="login-msg"></div><form id="login-form"><div class="field"><label>البريد الإلكتروني</label><input name="email" type="email" value="sayed3la2@gmail.com" required></div><div class="field"><label>كلمة المرور</label><input name="password" type="password" required></div><button class="btn">دخول</button></form></section></main>`
 document.getElementById('login-form').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const {error}=await supabase.auth.signInWithPassword({email:String(fd.get('email')),password:String(fd.get('password'))});document.getElementById('login-msg').innerHTML=error?`<div class="error">${error.message}</div>`:''})
}

async function approvedIds(){
 const {data,error}=await supabase.from('import_batches').select('id').eq('status','approved');if(error)throw error;return (data||[]).map(x=>x.id)
}
function currentFilters(){const p=qs();return {branch:p.get('branch')||'',from:p.get('from')||defaultFrom,to:p.get('to')||defaultTo}}

async function loadDaily(branch,from,to){
 let q=supabase.from('v_branch_daily_kpis').select('*').gte('business_date',from).lte('business_date',to).order('business_date');if(branch)q=q.eq('branch_id',branch);const {data,error}=await q;if(error)throw error;return data||[]
}
function latestInventoryByProduct(rows){
 const latest=new Map()
 ;(rows||[]).forEach(r=>{
  const key=r.branch_id+'|'+(r.product_id||r.product_name||'')
  const prev=latest.get(key)
  if(!prev||String(r.business_date)>String(prev.business_date)||(String(r.business_date)===String(prev.business_date)&&Number(r.id||0)>Number(prev.id||0)))latest.set(key,r)
 })
 return [...latest.values()]
}

function managementDashboardTable(rows,totalRow){
 const cols=[
  {key:'branch_name',label:'الفرع'},
  {key:'opening',label:'افتتاحي مديونية'},
  {key:'sales',label:'المبيعات',num:1},
  {key:'collections',label:'التحصيل',num:1},
  {key:'cumulative',label:'مديونية تراكمية',num:1},
  {key:'discount',label:'خصم',num:1},
  {key:'discount_rate',label:'نسبة الخصم'},
  {key:'sales_qty',label:'كمية المبيعات المكافئة',num:1},
  {key:'avg_price',label:'متوسط السعر',num:1},
  {key:'fuel',label:'سولار',num:1},
  {key:'petro',label:'بترو أب',num:1},
  {key:'maintenance',label:'صيانة',num:1},
  {key:'inventory_qty',label:'كمية المخزون',num:1},
  {key:'inventory_value',label:'قيمة المخزون',num:1}
 ]
 const header=cols.map((col,index)=>{
  const values=[...new Set(rows.map(r=>String(r[col.key]??'').replace(/<[^>]*>/g,'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar',{numeric:true}))
  const encoded=encodeURIComponent(JSON.stringify(values))
  return '<th><div class="th-filter-wrap"><span>'+col.label+'</span><button class="excel-filter-btn" type="button" data-col="'+index+'" data-values="'+encoded+'" onclick="openExcelFilter(this)" title="فلتر العمود">⌄</button></div></th>'
 }).join('')
 return '<section class="table-card management-dashboard-table" data-report-title="التقرير المجمع">'+
  '<div class="table-head"><div><h2>التقرير المجمع</h2><small>'+rows.length+' فرع</small></div>'+
  '<div class="table-tools"><input class="search" placeholder="بحث…" oninput="applyTableFilters(this)">'+
  '<button class="tool-btn" type="button" onclick="clearTableFilters(this)">مسح الفلاتر</button>'+
  '<button class="tool-btn" type="button" onclick="exportVisibleTableXlsx(this)">Excel</button>'+
  '<button class="tool-btn" type="button" onclick="printReportOnly(this)">طباعة</button></div></div>'+
  '<div class="table-wrap"><table><thead>'+
   '<tr class="group-header-row"><th rowspan="2">الفرع</th><th colspan="4">30 سبتمبر</th><th colspan="4">نسبة الخصم</th><th colspan="3">مصاريف السيارات</th><th colspan="2">المخزون</th></tr>'+
   '<tr class="column-header-row">'+header.replace(/^<th>[\s\S]*?<\/th>/,'')+'</tr>'+
  '</thead><tbody>'+
  rows.map(r=>'<tr>'+cols.map(col=>'<td class="'+(col.num?'num ':'')+(col.key==='branch_name'?'row-label':'')+'">'+(r[col.key]??'-')+'</td>').join('')+'</tr>').join('')+
  totalRow+'</tbody></table></div></section>'
}

async function renderDashboard(){
 const {branch,from,to}=currentFilters()
 const daily=await loadDaily(branch,from,to),ids=await approvedIds()
 let whQ=supabase.from('warehouse_daily_summary')
  .select('branch_id,business_date,closing_qty,closing_value,raw_payload')
  .in('batch_id',ids.length?ids:['00000000-0000-0000-0000-000000000000'])
  .gte('business_date',from).lte('business_date',to).order('business_date')
 let invQ=supabase.from('inventory_daily')
  .select('id,branch_id,business_date,product_id,product_name,sales_qty,closing_qty,closing_value')
  .in('batch_id',ids.length?ids:['00000000-0000-0000-0000-000000000000'])
  .gte('business_date',from).lte('business_date',to)
 let prodQ=supabase.from('products').select('id,box_count').eq('is_active',true)
 let expQ=supabase.from('v_expense_analysis')
  .select('branch_id,canonical_category,expense_group,amount')
  .gte('entry_date',from).lte('entry_date',to)
 if(branch){whQ=whQ.eq('branch_id',branch);invQ=invQ.eq('branch_id',branch);expQ=expQ.eq('branch_id',branch)}
 const extra=await Promise.all([whQ,invQ,prodQ,expQ]),warehouse=extra[0].data||[],inventoryRows=extra[1].data||[],productRows=extra[2].data||[],expenses=extra[3].data||[]
 if(extra[0].error||extra[1].error||extra[2].error||extra[3].error)throw extra[0].error||extra[1].error||extra[2].error||extra[3].error

 const by=new Map()
 daily.forEach(r=>{
  const k=r.branch_id
  const x=by.get(k)||{branch_name:r.branch_name,firstDate:r.business_date,opening:Number(r.opening_receivables||0),gross:0,net:0,coll:0,disc:0,debt:0}
  if(String(r.business_date)<String(x.firstDate)){x.firstDate=r.business_date;x.opening=Number(r.opening_receivables||0)}
  x.gross+=Number(r.gross_sales||0);x.net+=Number(r.net_sales||0);x.coll+=Number(r.collections||0);x.disc+=Number(r.discounts||0);x.debt=Number(r.closing_receivables||x.debt)
  by.set(k,x)
 })

 const whLatest=new Map()
 warehouse.forEach(r=>{
  const prev=whLatest.get(r.branch_id)
  if(!prev||String(r.business_date)>=String(prev.business_date))whLatest.set(r.branch_id,r)
 })
 const boxCountByProduct=new Map(productRows.map(p=>[p.id,Number(p.box_count||0)])),equivCartonsBy=new Map()
 inventoryRows.forEach(r=>{
  const boxCount=boxCountByProduct.get(r.product_id)||0
  const factor=boxCount===12?2:1
  equivCartonsBy.set(r.branch_id,(equivCartonsBy.get(r.branch_id)||0)+(Number(r.sales_qty||0)*factor))
 })

 const carBy=new Map()
 expenses.forEach(r=>{
  const txt=((r.canonical_category||'')+' '+(r.expense_group||'')).toLowerCase(),x=carBy.get(r.branch_id)||{fuel:0,petro:0,maintenance:0}
  if(/سولار|وقود|fuel/.test(txt))x.fuel+=Number(r.amount||0)
  if(/بترو|petro/.test(txt))x.petro+=Number(r.amount||0)
  if(/صيان|maintenance/.test(txt))x.maintenance+=Number(r.amount||0)
  carBy.set(r.branch_id,x)
 })

 const latestInventory=latestInventoryByProduct(inventoryRows),inventoryByBranch=new Map()
 latestInventory.forEach(r=>{
  const x=inventoryByBranch.get(r.branch_id)||{qty:0,value:0}
  x.qty+=Number(r.closing_qty||0);x.value+=Number(r.closing_value||0);inventoryByBranch.set(r.branch_id,x)
 })
 const raw=[...by.entries()].map(([id,x])=>{
  const wh=whLatest.get(id)||{},verifiedLegacy=wh.raw_payload?.closing_qty_source==='daily_product_closing_verified'
  const inv=verifiedLegacy?{qty:Number(wh.closing_qty||0),value:Number(wh.closing_value||0)}:(inventoryByBranch.get(id)||{qty:0,value:0})
  const verifiedEquiv=Number(wh.raw_payload?.equivalent_cartons_month||0)
  const detailedEquiv=Number(equivCartonsBy.get(id)||0)
  const equivCartons=verifiedEquiv||detailedEquiv
  const car=carBy.get(id)||{fuel:0,petro:0,maintenance:0}
  return {...x,id,equivCartons,avgPrice:equivCartons?x.net/equivCartons:0,fuel:car.fuel,petro:car.petro,maintenance:car.maintenance,inventoryQty:inv.qty,inventoryValue:inv.value}
 }).sort((a,b)=>b.net-a.net)

 const rows=raw.map(x=>({
  branch_name:x.branch_name,
  opening:money(x.opening),
  sales:money(x.net),
  collections:money(x.coll),
  cumulative:money(x.debt),
  discount:money(x.disc),
  discount_rate:pct(x.gross?x.disc/x.gross:0),
  sales_qty:qty(x.equivCartons),
  avg_price:money(x.avgPrice),
  fuel:money(x.fuel),
  petro:money(x.petro),
  maintenance:money(x.maintenance),
  inventory_qty:qty(x.inventoryQty),
  inventory_value:money(x.inventoryValue)
 }))
 const t=raw.reduce((a,x)=>{a.opening+=x.opening;a.sales+=x.net;a.collections+=x.coll;a.cumulative+=x.debt;a.discount+=x.disc;a.gross+=x.gross;a.equivCartons+=x.equivCartons;a.fuel+=x.fuel;a.petro+=x.petro;a.maintenance+=x.maintenance;a.inventoryQty+=x.inventoryQty;a.inventoryValue+=x.inventoryValue;return a},{opening:0,sales:0,collections:0,cumulative:0,discount:0,gross:0,equivCartons:0,fuel:0,petro:0,maintenance:0,inventoryQty:0,inventoryValue:0})
 const totalRow='<tr class="total"><th>الإجمالي</th>'+
  '<th class="num">'+money(t.opening)+'</th><th class="num">'+money(t.sales)+'</th><th class="num">'+money(t.collections)+'</th><th class="num">'+money(t.cumulative)+'</th>'+
  '<th class="num">'+money(t.discount)+'</th><th>'+pct(t.gross?t.discount/t.gross:0)+'</th><th class="num">'+qty(t.equivCartons)+'</th><th class="num">'+money(t.equivCartons?t.sales/t.equivCartons:0)+'</th>'+
  '<th class="num">'+money(t.fuel)+'</th><th class="num">'+money(t.petro)+'</th><th class="num">'+money(t.maintenance)+'</th>'+
  '<th class="num">'+qty(t.inventoryQty)+'</th><th class="num">'+money(t.inventoryValue)+'</th></tr>'

 shell('لوحة الإدارة','التقرير المجمع بنفس منطق ورقة الإدارة',filters(from,to,branch)+scope(from,to,branch)+managementDashboardTable(rows,totalRow))
 bindFilters('dashboard')
}
async function renderExecutive(){
 const cfg=currentFilters(),branch=cfg.branch,from=cfg.from,to=cfg.to
 const daily=await loadDaily(branch,from,to)
 const ids=await approvedIds()
 let whQ=supabase.from('warehouse_daily_summary').select('branch_id,business_date,opening_qty,opening_value,incoming_factory_qty,incoming_factory_value,incoming_branches_qty,incoming_branches_value,sales_qty,sales_value,bonus_qty,bonus_value,gifts_qty,gifts_value,damages_qty,damages_value,return_factory_qty,return_factory_value,outgoing_branches_qty,outgoing_branches_value,adjustment_qty,adjustment_value,closing_qty,closing_value,raw_payload').in('batch_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']).gte('business_date',from).lte('business_date',to).order('business_date')
 let invQ=supabase.from('inventory_daily').select('id,branch_id,business_date,product_id,product_name,sales_qty,closing_qty,closing_value').in('batch_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']).gte('business_date',from).lte('business_date',to)
 let prodQ=supabase.from('products').select('id,box_count').eq('is_active',true)
 let expQ=supabase.from('v_expense_analysis').select('branch_id,canonical_category,expense_group,amount').gte('entry_date',from).lte('entry_date',to)
 if(branch){whQ=whQ.eq('branch_id',branch);invQ=invQ.eq('branch_id',branch);expQ=expQ.eq('branch_id',branch)}
 const pair=await Promise.all([whQ,invQ,prodQ,expQ]),warehouse=pair[0].data||[],inventoryRows=pair[1].data||[],productRows=pair[2].data||[],expenseRows=pair[3].data||[]
 if(pair[0].error||pair[1].error||pair[2].error||pair[3].error)throw pair[0].error||pair[1].error||pair[2].error||pair[3].error

 const by=new Map()
 daily.forEach(function(r){
  const k=r.branch_id
  const x=by.get(k)||{
   branch_name:r.branch_name,dates:[],opening:0,gross:0,net:0,coll:0,disc:0,returns:0,expenses:0,closingDebt:0,closingCash:0,
   last7Sales:0,last7Collections:0,last7Returns:0,last7Discount:0,inventoryValue:0
  }
  x.dates.push(r.business_date)
  if(x.dates.length===1)x.opening=Number(r.opening_receivables||0)
  x.gross+=Number(r.gross_sales||0);x.net+=Number(r.net_sales||0);x.coll+=Number(r.collections||0);x.disc+=Number(r.discounts||0)
  x.returns+=Number(r.returns_value||0);x.expenses+=Number(r.expenses||0)
  x.closingDebt=Number(r.closing_receivables||x.closingDebt);x.closingCash=Number(r.closing_cash||x.closingCash);x.inventoryValue=Number(r.inventory_value||x.inventoryValue)
  by.set(k,x)
 })
 const allDates=[...new Set(daily.map(r=>r.business_date))].sort()
 const last7Set=new Set(allDates.slice(-7))
 daily.forEach(function(r){
  if(!last7Set.has(r.business_date))return
  const x=by.get(r.branch_id);if(!x)return
  x.last7Sales+=Number(r.net_sales||0);x.last7Collections+=Number(r.collections||0);x.last7Returns+=Number(r.returns_value||0);x.last7Discount+=Number(r.discounts||0)
 })
 const whLatest=new Map()
 warehouse.forEach(function(r){
  const prev=whLatest.get(r.branch_id)
  if(!prev||String(r.business_date)>=String(prev.business_date))whLatest.set(r.branch_id,r)
 })
 const boxCountByProduct=new Map(productRows.map(p=>[p.id,Number(p.box_count||0)])),equivCartonsBy=new Map()
 inventoryRows.forEach(r=>{
  const factor=(boxCountByProduct.get(r.product_id)||0)===12?2:1
  equivCartonsBy.set(r.branch_id,(equivCartonsBy.get(r.branch_id)||0)+(Number(r.sales_qty||0)*factor))
 })
 const carExp=new Map()
 expenseRows.forEach(function(r){
  const txt=((r.canonical_category||'')+' '+(r.expense_group||'')).toLowerCase()
  const x=carExp.get(r.branch_id)||{fuel:0,petro:0,maintenance:0}
  if(/سولار|وقود|fuel/.test(txt))x.fuel+=Number(r.amount||0)
  if(/بترو|petro/.test(txt))x.petro+=Number(r.amount||0)
  if(/صيان|maintenance/.test(txt))x.maintenance+=Number(r.amount||0)
  carExp.set(r.branch_id,x)
 })
 const latestInventory=latestInventoryByProduct(inventoryRows),inventoryByBranch=new Map()
 latestInventory.forEach(r=>{
  const x=inventoryByBranch.get(r.branch_id)||{qty:0,value:0}
  x.qty+=Number(r.closing_qty||0);x.value+=Number(r.closing_value||0);inventoryByBranch.set(r.branch_id,x)
 })
 const raw=[...by.entries()].map(([id,x])=>{
  const wh=whLatest.get(id)||{},verifiedLegacy=wh.raw_payload?.closing_qty_source==='daily_product_closing_verified'
  const inv=verifiedLegacy?{qty:Number(wh.closing_qty||0),value:Number(wh.closing_value||0)}:(inventoryByBranch.get(id)||{qty:0,value:0})
  const verifiedEquiv=Number(wh.raw_payload?.equivalent_cartons_month||0)
  const detailedEquiv=Number(equivCartonsBy.get(id)||0)
  const equivCartons=verifiedEquiv||detailedEquiv
  const car=carExp.get(id)||{fuel:0,petro:0,maintenance:0}
  return {id,...x,inventoryQty:inv.qty,inventoryValue:inv.value,equivCartons,fuel:car.fuel,petro:car.petro,maintenance:car.maintenance}
 }).sort((a,b)=>b.net-a.net)

 const rows=raw.map(x=>({
  branch_name:x.branch_name,
  opening:money(x.opening),
  last7_sales:money(x.last7Sales),
  last7_collections:money(x.last7Collections),
  last7_returns:money(x.last7Returns),
  legal:'—',
  previous_debt:money(x.opening),
  sales:money(x.net),
  collections:money(x.coll),
  month_debt:money(x.net-x.coll),
  cumulative_debt:money(x.closingDebt),
  discount7:money(x.last7Discount),
  discount:money(x.disc),
  discount_rate:pct(x.gross?x.disc/x.gross:0),
  sales_qty:qty(x.equivCartons),
  avg_price:money(x.equivCartons?x.net/x.equivCartons:0),
  fuel:money(x.fuel),
  petro:money(x.petro),
  maintenance:money(x.maintenance),
  inventory_qty:qty(x.inventoryQty),
  inventory_value:money(x.inventoryValue),
  treasury:money(x.closingCash),
  expense_rate:pct(x.net?x.expenses/x.net:0),
  treasury_variance:'—'
 }))
 const totals=raw.reduce((a,x)=>{
  a.opening+=x.opening;a.last7Sales+=x.last7Sales;a.last7Collections+=x.last7Collections;a.last7Returns+=x.last7Returns;a.net+=x.net;a.coll+=x.coll
  a.closingDebt+=x.closingDebt;a.last7Discount+=x.last7Discount;a.disc+=x.disc;a.gross+=x.gross;a.equivCartons+=x.equivCartons;a.fuel+=x.fuel;a.petro+=x.petro;a.maintenance+=x.maintenance
  a.inventoryQty+=x.inventoryQty;a.inventoryValue+=x.inventoryValue;a.closingCash+=x.closingCash;a.expenses+=x.expenses;return a
 },{opening:0,last7Sales:0,last7Collections:0,last7Returns:0,net:0,coll:0,closingDebt:0,last7Discount:0,disc:0,gross:0,equivCartons:0,fuel:0,petro:0,maintenance:0,inventoryQty:0,inventoryValue:0,closingCash:0,expenses:0})
 const totalRow='<tr class="total">'+
  '<th>الإجمالي</th><th class="num">'+money(totals.opening)+'</th><th class="num">'+money(totals.last7Sales)+'</th><th class="num">'+money(totals.last7Collections)+'</th><th class="num">'+money(totals.last7Returns)+'</th>'+
  '<th>—</th><th class="num">'+money(totals.opening)+'</th><th class="num">'+money(totals.net)+'</th><th class="num">'+money(totals.coll)+'</th><th class="num">'+money(totals.net-totals.coll)+'</th><th class="num">'+money(totals.closingDebt)+'</th>'+
  '<th class="num">'+money(totals.last7Discount)+'</th><th class="num">'+money(totals.disc)+'</th><th>'+pct(totals.gross?totals.disc/totals.gross:0)+'</th><th class="num">'+qty(totals.equivCartons)+'</th><th class="num">'+money(totals.equivCartons?totals.net/totals.equivCartons:0)+'</th>'+
  '<th class="num">'+money(totals.fuel)+'</th><th class="num">'+money(totals.petro)+'</th><th class="num">'+money(totals.maintenance)+'</th>'+
  '<th class="num">'+qty(totals.inventoryQty)+'</th><th class="num">'+money(totals.inventoryValue)+'</th><th class="num">'+money(totals.closingCash)+'</th><th>'+pct(totals.net?totals.expenses/totals.net:0)+'</th><th>—</th></tr>'

 shell('التقرير المجمع','مطابقة ورقة الإدارة بالأعمدة المتاحة من البيانات المعتمدة',filters(from,to,branch)+scope(from,to,branch)+table('التقرير المجمع',[
  {key:'branch_name',label:'الفرع'},
  {key:'opening',label:'افتتاحي مديونية'},
  {key:'last7_sales',label:'مبيعات آخر 7'},
  {key:'last7_collections',label:'تحصيل آخر 7'},
  {key:'last7_returns',label:'مرتجع'},
  {key:'legal',label:'شؤون قانونية'},
  {key:'previous_debt',label:'مديونية سابقة'},
  {key:'sales',label:'المبيعات',num:1},
  {key:'collections',label:'التحصيل',num:1},
  {key:'month_debt',label:'مديونية الشهر',num:1},
  {key:'cumulative_debt',label:'مديونية تراكمية',num:1},
  {key:'discount7',label:'خصم 7',num:1},
  {key:'discount',label:'الخصم',num:1},
  {key:'discount_rate',label:'% الخصم'},
  {key:'sales_qty',label:'كمية المبيعات المكافئة',num:1},
  {key:'avg_price',label:'متوسط السعر',num:1},
  {key:'fuel',label:'سولار',num:1},
  {key:'petro',label:'بترو أب',num:1},
  {key:'maintenance',label:'صيانة',num:1},
  {key:'inventory_qty',label:'كمية المخزون',num:1},
  {key:'inventory_value',label:'قيمة المخزون',num:1},
  {key:'treasury',label:'رصيد الخزينة',num:1},
  {key:'expense_rate',label:'% المصروف'},
  {key:'treasury_variance',label:'انحراف الخزينة'}
 ],rows,totalRow))
 bindFilters('executive')
}
async function renderTreasury(){
 const cfg=currentFilters(),branch=cfg.branch,from=cfg.from,to=cfg.to
 let accountQ=supabase.from('treasury_accounts').select('id,branch_id,name,code,account_type,is_default,is_active').eq('is_active',true)
 let entryQ=supabase.from('cash_entries').select('id,branch_id,entry_date,direction,description,amount,running_balance,category,canonical_category,expense_group,entry_kind,is_expense,treasury_account_id').gte('entry_date',from).lte('entry_date',to).order('entry_date',{ascending:false})
 if(branch){accountQ=accountQ.eq('branch_id',branch);entryQ=entryQ.eq('branch_id',branch)}
 const rs=await Promise.all([accountQ,entryQ]),accounts=rs[0].data||[],entries=rs[1].data||[]
 if(rs[0].error||rs[1].error)throw rs[0].error||rs[1].error
 window.__treasuryEditData={accounts,entries}
 const branchMap=new Map(branches.map(function(b){return [b.id,b.name]}))
 const accountMap=new Map(accounts.map(function(a){return [a.id,a]}))
 const totals=new Map()
 accounts.forEach(function(a){totals.set(a.id,{incoming:0,outgoing:0})})
 entries.forEach(function(e){
  if(!e.treasury_account_id)return
  const x=totals.get(e.treasury_account_id)||{incoming:0,outgoing:0}
  if(e.direction==='in')x.incoming+=Number(e.amount||0);else x.outgoing+=Number(e.amount||0)
  totals.set(e.treasury_account_id,x)
 })
 const accountRows=accounts.map(function(a){
  const x=totals.get(a.id)||{incoming:0,outgoing:0}
  return {branch_name:branchMap.get(a.branch_id)||'—',name:escapeHtml(a.name),type:a.account_type==='bank'?'بنك':'خزينة',incoming:money(x.incoming),outgoing:money(x.outgoing),net:money(x.incoming-x.outgoing)}
 })
 const entryRows=entries.map(function(e){
  return {entry_date:e.entry_date||'—',branch_name:branchMap.get(e.branch_id)||'—',account:escapeHtml((accountMap.get(e.treasury_account_id)||{}).name||'غير موجه'),direction:e.direction==='in'?'داخل':'خارج',description:escapeHtml(e.description||'—'),source_category:escapeHtml(e.category||'—'),category:escapeHtml(e.canonical_category||e.entry_kind||'—'),expense:e.is_expense?'مصروف':'غير مصروف',amount:money(e.amount),balance:money(e.running_balance),action:profile?.role==='admin'?'<button class="inline-action" onclick="editTreasuryClassification('+e.id+')">تعديل التصنيف</button>':'—'}
 })
 const body=filters(from,to,branch)+scope(from,to,branch)+
  table('أرصدة وحركة الحسابات',[
   {key:'branch_name',label:'الفرع'},{key:'name',label:'الحساب'},{key:'type',label:'النوع'},{key:'incoming',label:'داخل',num:1},{key:'outgoing',label:'خارج',num:1},{key:'net',label:'صافي الحركة',num:1}
  ],accountRows)+'<div class="section-gap"></div>'+
  table('تفاصيل حركة الخزينة',[
   {key:'entry_date',label:'التاريخ'},{key:'branch_name',label:'الفرع'},{key:'account',label:'الخزينة / البنك'},{key:'direction',label:'الحركة'},{key:'description',label:'البيان'},{key:'source_category',label:'تصنيف المصدر'},{key:'category',label:'التوجيه'},{key:'expense',label:'نوع التقرير'},{key:'amount',label:'القيمة',num:1},{key:'balance',label:'الرصيد',num:1},{key:'action',label:'إجراء',filter:false}
  ],entryRows)
 shell('الخزينة والبنوك','الحركة الفعلية مع تعديل التصنيف الذي يغذي تقرير المصروفات',body)
 bindFilters('treasury')
}


window.editTreasuryClassification=function(id){
 const data=window.__treasuryEditData||{},e=(data.entries||[]).find(x=>Number(x.id)===Number(id))
 if(!e)return
 const accounts=(data.accounts||[]).filter(a=>a.branch_id===e.branch_id&&a.is_active)
 const accountOptions='<option value="">غير موجه</option>'+accounts.map(a=>'<option value="'+a.id+'" '+(a.id===e.treasury_account_id?'selected':'')+'>'+escapeHtml(a.name)+'</option>').join('')
 document.getElementById('treasury-classification-dialog')?.remove()
 const html='<div class="dialog-backdrop" id="treasury-classification-dialog"><div class="dialog-card">'+
 '<div class="dialog-head"><h3>تعديل تصنيف حركة الخزينة #'+id+'</h3><button class="tool-btn" onclick="document.getElementById(\'treasury-classification-dialog\').remove()">إغلاق</button></div>'+
 '<form id="treasury-classification-form" class="dialog-form">'+
 '<div class="locked-source"><span>تصنيف المصدر</span><strong>'+escapeHtml(e.category||'—')+'</strong><span>القيمة</span><strong>'+money(e.amount)+'</strong></div>'+
 '<div class="field"><label>البيان</label><input name="description" value="'+escapeAttr(e.description||'')+'"></div>'+
 '<div class="field"><label>التوجيه النهائي</label><input name="canonical" value="'+escapeAttr(e.canonical_category||'')+'" placeholder="مثال: إيجار، كهرباء، سولار"></div>'+
 '<div class="field"><label>هل تظهر في تقرير المصروفات؟</label><select name="is_expense"><option value="true" '+(e.is_expense?'selected':'')+'>نعم — مصروف</option><option value="false" '+(!e.is_expense?'selected':'')+'>لا — ليست مصروفًا</option></select></div>'+
 '<div class="field"><label>مجموعة المصروف</label><input name="group" value="'+escapeAttr(e.expense_group||'')+'" placeholder="مثال: تشغيل ومرافق"></div>'+
 '<div class="field"><label>الخزينة / البنك</label><select name="account">'+accountOptions+'</select></div>'+
 '<div class="field"><label>نوع الحركة عند عدم اعتبارها مصروفًا</label><select name="entry_kind"><option value="other" '+(e.entry_kind==='other'?'selected':'')+'>أخرى</option><option value="collection" '+(e.entry_kind==='collection'?'selected':'')+'>تحصيل</option><option value="bank_deposit" '+(e.entry_kind==='bank_deposit'?'selected':'')+'>إيداع بنكي</option><option value="hq_transfer" '+(e.entry_kind==='hq_transfer'?'selected':'')+'>تحويل مصنع</option><option value="interbranch" '+(e.entry_kind==='interbranch'?'selected':'')+'>تحويل فروع</option><option value="advance" '+(e.entry_kind==='advance'?'selected':'')+'>سلفة</option><option value="custody" '+(e.entry_kind==='custody'?'selected':'')+'>عهدة</option><option value="cash_balance" '+(e.entry_kind==='cash_balance'?'selected':'')+'>رصيد خزينة</option></select></div>'+
 '<div class="field"><label>سبب التعديل — إلزامي</label><textarea name="reason" rows="3" required placeholder="لماذا تم تصحيح التوجيه؟"></textarea></div>'+
 '<button class="btn">حفظ التصنيف وتحديث التقارير</button><div id="treasury-classification-msg"></div>'+
 '</form></div></div>'
 document.body.insertAdjacentHTML('beforeend',html)
 const form=document.getElementById('treasury-classification-form')
 const toggleGroup=()=>{form.group.disabled=form.is_expense.value!=='true'}
 form.is_expense.addEventListener('change',toggleGroup);toggleGroup()
 form.addEventListener('submit',async ev=>{
  ev.preventDefault()
  const msg=document.getElementById('treasury-classification-msg')
  try{
   msg.innerHTML='<div class="notice">جاري حفظ التصنيف وتحديث تقرير المصروفات…</div>'
   const result=await supabase.rpc('edit_cash_entry_classification',{
    p_cash_entry_id:id,
    p_description:form.description.value,
    p_canonical_category:form.canonical.value,
    p_expense_group:form.group.value,
    p_treasury_account_id:form.account.value||null,
    p_is_expense:form.is_expense.value==='true',
    p_entry_kind:form.entry_kind.value,
    p_reason:form.reason.value
   })
   if(result.error)throw result.error
   document.getElementById('treasury-classification-dialog')?.remove()
   await renderTreasury()
  }catch(err){
   msg.innerHTML='<div class="error">'+escapeHtml(err.message||err)+'</div>'
  }
 })
}


async function renderAccountingInputs(){
 if(profile?.role!=='admin'){shell('إدخالات المحاسب والتوجيه','', '<div class="error">هذه الصفحة للمدير فقط.</div>');return}
 const cfg=currentFilters(),branch=cfg.branch,from=cfg.from,to=cfg.to
 const auth=await supabase.auth.getSession(),active=auth.data.session
 if(!active)throw new Error('انتهت جلسة الدخول')
 const url=new URL(SUPABASE_URL+'/functions/v1/ammco-admin-cash')
 if(branch)url.searchParams.set('branch',branch)
 if(from)url.searchParams.set('from',from)
 if(to)url.searchParams.set('to',to)
 const res=await fetch(url,{headers:{Authorization:'Bearer '+active.access_token,apikey:SUPABASE_KEY}})
 const data=await res.json()
 if(!res.ok)throw new Error(data.error||'تعذر تحميل إدخالات المحاسب')
 window.__adminCashData=data
 const branchMap=new Map((data.branches||[]).map(function(b){return [b.id,b.name]}))
 const accountMap=new Map((data.accounts||[]).map(function(a){return [a.id,a]}))
 const batchMap=new Map((data.batches||[]).map(function(b){return [b.id,b]}))
 const profileMap=new Map((data.profiles||[]).map(function(p){return [p.user_id,p.full_name]}))
 const rows=(data.entries||[]).map(function(e){
  const batch=batchMap.get(e.batch_id),uploader=batch?profileMap.get(batch.uploaded_by):''
  return {
   entry_date:e.entry_date||'—',
   branch_name:branchMap.get(e.branch_id)||'—',
   accountant:escapeHtml(uploader||'—'),
   batch:escapeHtml(batch?(batch.original_file_name+' / v'+batch.version):'—'),
   status:batch?.status||'—',
   source:e.source_row??'—',
   description:escapeHtml(e.description||'—'),
   source_category:escapeHtml(e.category||'—'),
   canonical:escapeHtml(e.canonical_category||'—'),
   group:escapeHtml(e.expense_group||'—'),
   account:escapeHtml((accountMap.get(e.treasury_account_id)||{}).name||'غير موجه'),
   direction:e.direction==='in'?'داخل':'خارج',
   amount:money(e.amount),
   action:'<button class="inline-action" onclick="editCashEntry('+e.id+')">تعديل التوجيه</button>'
  }
 })
 const corrections=(data.corrections||[]).map(function(log){
  return {changed_at:new Date(log.changed_at).toLocaleString('en-GB'),branch_name:branchMap.get(log.branch_id)||'—',entry:log.cash_entry_id,old:escapeHtml(log.old_canonical_category||log.old_description||'—'),new:escapeHtml(log.new_canonical_category||log.new_description||'—'),reason:escapeHtml(log.reason||'—'),by:escapeHtml(profileMap.get(log.changed_by)||'—')}
 })
 const body=filters(from,to,branch)+scope(from,to,branch)+
  table('إدخالات المحاسب',[
   {key:'entry_date',label:'التاريخ'},{key:'branch_name',label:'الفرع'},{key:'accountant',label:'المحاسب / الرافع'},{key:'batch',label:'ملف المصدر'},
   {key:'status',label:'حالة النسخة'},{key:'source',label:'صف المصدر'},{key:'description',label:'البيان'},{key:'source_category',label:'تصنيف المصدر'},
   {key:'canonical',label:'التوجيه الحالي'},{key:'group',label:'مجموعة المصروف'},{key:'account',label:'الخزينة / البنك'},
   {key:'direction',label:'اتجاه'},{key:'amount',label:'القيمة',num:1},{key:'action',label:'إجراء',filter:false}
  ],rows)+'<div class="section-gap"></div>'+
  table('سجل تعديلات التوجيه',[
   {key:'changed_at',label:'وقت التعديل'},{key:'branch_name',label:'الفرع'},{key:'entry',label:'رقم الحركة'},
   {key:'old',label:'قبل'},{key:'new',label:'بعد'},{key:'reason',label:'سبب التعديل'},{key:'by',label:'عدّل بواسطة'}
  ],corrections)
 shell('إدخالات المحاسب والتوجيه','المصدر كما أدخله المحاسب + التصحيح + سجل المراجعة',body)
 bindFilters('accounting-inputs')
}

window.editCashEntry=function(id){
 const data=window.__adminCashData,e=(data?.entries||[]).find(function(x){return Number(x.id)===Number(id)})
 if(!e)return
 const accounts=(data.accounts||[]).filter(function(a){return a.branch_id===e.branch_id&&a.is_active})
 const options='<option value="">غير موجه</option>'+accounts.map(function(a){return '<option value="'+a.id+'" '+(a.id===e.treasury_account_id?'selected':'')+'>'+escapeHtml(a.name)+'</option>'}).join('')
 document.getElementById('cash-edit-dialog')?.remove()
 const html='<div class="dialog-backdrop" id="cash-edit-dialog"><div class="dialog-card"><div class="dialog-head"><h3>تعديل الحركة #'+id+'</h3><button class="tool-btn" onclick="document.getElementById(\'cash-edit-dialog\').remove()">إغلاق</button></div><form id="edit-cash-form" class="dialog-form">'+
  '<div class="field"><label>البيان</label><input name="description" value="'+escapeAttr(e.description||'')+'"></div>'+
  '<div class="field"><label>التوجيه / البند</label><input name="canonical" value="'+escapeAttr(e.canonical_category||'')+'"></div>'+
  '<div class="field"><label>مجموعة المصروف</label><input name="group" value="'+escapeAttr(e.expense_group||'')+'"></div>'+
  '<div class="field"><label>الخزينة / البنك</label><select name="account">'+options+'</select></div>'+
  '<div class="locked-source"><span>قيمة المصدر</span><strong>'+money(e.amount)+'</strong><span>الاتجاه</span><strong>'+(e.direction==='in'?'داخل':'خارج')+'</strong></div>'+
  '<div class="field"><label>سبب التعديل — إلزامي</label><textarea name="reason" required rows="3" placeholder="اكتب سبب التصحيح"></textarea></div>'+
  '<button class="btn">حفظ التصحيح</button><div id="cash-edit-msg"></div></form></div></div>'
 document.body.insertAdjacentHTML('beforeend',html)
 document.getElementById('edit-cash-form')?.addEventListener('submit',async function(ev){
  ev.preventDefault()
  const form=ev.currentTarget,msg=document.getElementById('cash-edit-msg')
  try{
   const result=await supabase.rpc('edit_cash_entry',{p_cash_entry_id:id,p_description:form.description.value,p_canonical_category:form.canonical.value,p_expense_group:form.group.value,p_treasury_account_id:form.account.value||null,p_reason:form.reason.value})
   if(result.error)throw result.error
   document.getElementById('cash-edit-dialog')?.remove()
   renderAccountingInputs()
  }catch(err){msg.innerHTML='<div class="error">'+escapeHtml(err.message||err)+'</div>'}
 })
}


async function renderUsers(){
 if(profile?.role!=='admin'){shell('المستخدمون والصلاحيات','', '<div class="error">هذه الصفحة للمدير فقط.</div>');return}
 const auth=await supabase.auth.getSession(),active=auth.data.session
 if(!active)throw new Error('انتهت جلسة الدخول')
 const res=await fetch(SUPABASE_URL+'/functions/v1/ammco-admin-users',{headers:{Authorization:'Bearer '+active.access_token,apikey:SUPABASE_KEY}})
 const data=await res.json()
 if(!res.ok)throw new Error(data.error||'تعذر تحميل المستخدمين')
 window.__userAdminData=data
 const branchMap=new Map((data.branches||[]).map(function(b){return [b.id,b.name]}))
 const roleLabel={admin:'مدير',analyst:'محلل',branch_user:'مستخدم فرع'}
 const rows=(data.users||[]).map(function(u){
  return {
   full_name:escapeHtml(u.full_name||'—'),
   email:escapeHtml(u.email||'—'),
   role:roleLabel[u.role]||u.role,
   status:u.is_active?'نشط':'متوقف',
   branches:u.role==='admin'?'كل الفروع':(u.branch_ids||[]).map(function(id){return branchMap.get(id)}).filter(Boolean).join('، ')||'—',
   last:u.last_sign_in_at?new Date(u.last_sign_in_at).toLocaleString('en-GB'):'—',
   action:'<button class="inline-action" onclick="editUser(\''+u.user_id+'\')">تعديل</button>'
  }
 })
 const branchOptions=(data.branches||[]).map(function(b){return '<option value="'+b.id+'">'+escapeHtml(b.name)+'</option>'}).join('')
 const create='<section class="card admin-create-card"><div class="section-title"><h2>إضافة مستخدم</h2><span>إنشاء حساب وتحديد الدور والفروع</span></div>'+
 '<form id="create-user-form" class="admin-form-grid">'+
 '<div class="field"><label>الاسم</label><input name="full_name" required></div>'+
 '<div class="field"><label>البريد</label><input name="email" type="email" dir="ltr" required></div>'+
 '<div class="field"><label>كلمة مرور مؤقتة</label><input name="password" type="password" minlength="8" required></div>'+
 '<div class="field"><label>الدور</label><select name="role"><option value="branch_user">مستخدم فرع</option><option value="analyst">محلل</option><option value="admin">مدير</option></select></div>'+
 '<div class="field branch-multi"><label>الفروع</label><select name="branches" multiple>'+branchOptions+'</select></div>'+
 '<div class="field form-action"><label>&nbsp;</label><button class="btn">إنشاء المستخدم</button></div></form><div id="user-admin-msg"></div></section>'
 shell('المستخدمون والصلاحيات','إدارة الحسابات والأدوار والفروع المسموح بها',create+table('المستخدمون',[
  {key:'full_name',label:'الاسم'},{key:'email',label:'البريد'},{key:'role',label:'الدور'},{key:'status',label:'الحالة'},
  {key:'branches',label:'الفروع'},{key:'last',label:'آخر دخول'},{key:'action',label:'إجراء',filter:false}
 ],rows))
 document.getElementById('create-user-form')?.addEventListener('submit',async function(ev){
  ev.preventDefault()
  const form=ev.currentTarget,fd=new FormData(form),msg=document.getElementById('user-admin-msg')
  try{
   msg.innerHTML='<div class="notice">جاري إنشاء المستخدم…</div>'
   const branch_ids=[...form.querySelector('[name=branches]').selectedOptions].map(function(o){return o.value})
   const r=await fetch(SUPABASE_URL+'/functions/v1/ammco-admin-users',{method:'POST',headers:{Authorization:'Bearer '+active.access_token,apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({action:'create',full_name:fd.get('full_name'),email:fd.get('email'),password:fd.get('password'),role:fd.get('role'),branch_ids:branch_ids})})
   const out=await r.json()
   if(!r.ok)throw new Error(out.error||'تعذر إنشاء المستخدم')
   msg.innerHTML='<div class="success">تم إنشاء المستخدم.</div>'
   setTimeout(renderUsers,400)
  }catch(err){msg.innerHTML='<div class="error">'+escapeHtml(err.message||err)+'</div>'}
 })
}

window.editUser=function(id){
 const data=window.__userAdminData,u=(data?.users||[]).find(function(x){return x.user_id===id})
 if(!u)return
 const checks=(data.branches||[]).map(function(b){return '<label class="check-row"><input type="checkbox" value="'+b.id+'" '+((u.branch_ids||[]).includes(b.id)?'checked':'')+'> '+escapeHtml(b.name)+'</label>'}).join('')
 document.getElementById('user-edit-dialog')?.remove()
 const html='<div class="dialog-backdrop" id="user-edit-dialog"><div class="dialog-card"><div class="dialog-head"><h3>تعديل المستخدم</h3><button class="tool-btn" onclick="document.getElementById(\'user-edit-dialog\').remove()">إغلاق</button></div><form id="edit-user-form" class="dialog-form">'+
 '<div class="field"><label>الاسم</label><input name="full_name" value="'+escapeAttr(u.full_name||'')+'"></div>'+
 '<div class="field"><label>الدور</label><select name="role"><option value="branch_user" '+(u.role==='branch_user'?'selected':'')+'>مستخدم فرع</option><option value="analyst" '+(u.role==='analyst'?'selected':'')+'>محلل</option><option value="admin" '+(u.role==='admin'?'selected':'')+'>مدير</option></select></div>'+
 '<label class="switch-row"><input type="checkbox" name="active" '+(u.is_active?'checked':'')+'> مستخدم نشط</label>'+
 '<div class="field"><label>الفروع المسموح بها</label><div class="branch-checks">'+checks+'</div></div>'+
 '<button class="btn">حفظ الصلاحيات</button><div id="user-edit-msg"></div></form></div></div>'
 document.body.insertAdjacentHTML('beforeend',html)
 document.getElementById('edit-user-form')?.addEventListener('submit',async function(ev){
  ev.preventDefault()
  const form=ev.currentTarget,msg=document.getElementById('user-edit-msg')
  try{
   const branch_ids=[...form.querySelectorAll('.branch-checks input:checked')].map(function(x){return x.value})
   const auth=await supabase.auth.getSession(),active=auth.data.session
   const r=await fetch(SUPABASE_URL+'/functions/v1/ammco-admin-users',{method:'POST',headers:{Authorization:'Bearer '+active.access_token,apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({action:'update',user_id:id,full_name:form.full_name.value,role:form.role.value,is_active:form.active.checked,branch_ids:branch_ids})})
   const out=await r.json()
   if(!r.ok)throw new Error(out.error||'تعذر تحديث المستخدم')
   document.getElementById('user-edit-dialog')?.remove()
   renderUsers()
  }catch(err){msg.innerHTML='<div class="error">'+escapeHtml(err.message||err)+'</div>'}
 })
}

async function renderSales(){const {branch,from,to}=currentFilters();const daily=await loadDaily(branch,from,to);const rows=daily.map(r=>({business_date:r.business_date,branch_name:r.branch_name,gross:money(r.gross_sales),discounts:money(r.discounts),net:money(r.net_sales),collections:money(r.collections),expenses:money(r.expenses)}));shell('تقرير المبيعات','تفاصيل المبيعات اليومية حسب الفرع',filters(from,to,branch)+scope(from,to,branch)+table('المبيعات اليومية',[{key:'business_date',label:'التاريخ'},{key:'branch_name',label:'الفرع'},{key:'gross',label:'قبل الخصم',num:1},{key:'discounts',label:'الخصم',num:1},{key:'net',label:'صافي البيع',num:1},{key:'collections',label:'التحصيل',num:1},{key:'expenses',label:'المصروفات',num:1}],rows));bindFilters('sales')}
async function renderExpenses(){
 const cfg=currentFilters(),branch=cfg.branch,from=cfg.from,to=cfg.to,ids=await approvedIds()
 let cashQ=supabase.from('cash_entries').select('branch_id,entry_date,category,canonical_category,expense_group,description,amount,is_expense,entry_kind,direction').in('batch_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']).gte('entry_date',from).lte('entry_date',to)
 let salesQ=supabase.from('v_branch_daily_kpis').select('branch_id,net_sales').gte('business_date',from).lte('business_date',to)
 if(branch){cashQ=cashQ.eq('branch_id',branch);salesQ=salesQ.eq('branch_id',branch)}
 const pair=await Promise.all([cashQ,salesQ]),cash=pair[0].data||[],sales=pair[1].data||[]
 if(pair[0].error||pair[1].error)throw pair[0].error||pair[1].error
 const bset=branch?branches.filter(b=>b.id===branch):branches
 const salesBy=new Map();sales.forEach(r=>salesBy.set(r.branch_id,(salesBy.get(r.branch_id)||0)+Number(r.net_sales||0)))
 const norm=s=>String(s||'').trim().replace(/\s+/g,' ').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').toLowerCase()
 const requested=[
  'عمولات','إيجارات','صيانة السيارات','م. سولار','زيوت','غسيل وتشحيم','كارتات طريق','اطارات السيارات','قطع غيار السيارات','جراج سيارات',
  'غرامات سيارات','تراخيص سيارات','حوافز بيع','انتقالات','بدل سفر','تأمينات إجتماعية','أكراميات','م. تعتيق','نت وتليفون','نظافة','ادوات كتابية',
  'مصاريف مياه','م.كهرباء','مستحقه فروع','منح ومكافأت','بترو اب','حوافز إداريين','مصاريف تحويل','أجور ومرتبات','توريد','عهدة','سلفة',
  'ايداع البنك الأهلى 14','ايداع البنك الأهلى 28','ايداع البنك الأهلى 91','ايداع البنك الأهلى 16 المدين','QNB','القاهرة','ايداع بنك مصر','ايداع CIB',
  'تحويل نقدى للمصنع','تحويلات وسيطة للمصنع','دائنون','بخزنة الفرع'
 ]
 const aliases=[
  ['عمولات',['عمول']],['إيجارات',['ايجار']],['صيانة السيارات',['صيانه','صيانة']],['م. سولار',['سولار','وقود']],['زيوت',['زيوت']],['غسيل وتشحيم',['غسيل','تشحيم']],
  ['كارتات طريق',['كارتات طريق','طريق']],['اطارات السيارات',['اطار']],['قطع غيار السيارات',['قطع غيار']],['جراج سيارات',['جراج']],['غرامات سيارات',['غرام']],
  ['تراخيص سيارات',['ترخيص']],['حوافز بيع',['حوافز بيع']],['انتقالات',['انتقالات']],['بدل سفر',['بدل سفر']],['تأمينات إجتماعية',['تامينات','تأمينات']],
  ['أكراميات',['اكراميات']],['م. تعتيق',['تعتيق']],['نت وتليفون',['نت','تليفون']],['نظافة',['نظاف']],['ادوات كتابية',['ادوات كتابيه','ادوات كتابية']],
  ['مصاريف مياه',['مياه']],['م.كهرباء',['كهرب']],['مستحقه فروع',['مستحقه فروع','مستحقة فروع']],['منح ومكافأت',['منح','مكافات','مكافأت']],
  ['بترو اب',['بترو']],['حوافز إداريين',['حوافز ادار']],['مصاريف تحويل',['مصاريف تحويل']],['أجور ومرتبات',['اجور','مرتبات']],['توريد',['توريد']],
  ['عهدة',['عهده','عهدة']],['سلفة',['سلفه','سلفة']],['ايداع البنك الأهلى 14',['14']],['ايداع البنك الأهلى 28',['28']],['ايداع البنك الأهلى 91',['91']],
  ['ايداع البنك الأهلى 16 المدين',['16 المدين']],['QNB',['qnb']],['القاهرة',['القاهره','القاهرة']],['ايداع بنك مصر',['بنك مصر']],['ايداع CIB',['cib']],
  ['تحويل نقدى للمصنع',['تحويل نقدي للمصنع','تحويل نقدى للمصنع']],['تحويلات وسيطة للمصنع',['وسيطه للمصنع','وسيطة للمصنع']],['دائنون',['دائن']],['بخزنة الفرع',['خزنه الفرع','خزنة الفرع']]
 ]
 const matchLabel=r=>{
  const txt=norm((r.canonical_category||'')+' '+(r.category||'')+' '+(r.expense_group||'')+' '+(r.description||'')+' '+(r.entry_kind||''))
  for(const [label,keys] of aliases)if(keys.some(k=>txt.includes(norm(k))))return label
  return r.canonical_category||r.category||r.entry_kind||'غير مصنف'
 }
 const matrix=new Map()
 cash.forEach(r=>{
  const label=matchLabel(r),row=matrix.get(label)||new Map()
  row.set(r.branch_id,(row.get(r.branch_id)||0)+Number(r.amount||0));matrix.set(label,row)
 })
 const extras=[...matrix.keys()].filter(k=>!requested.includes(k)).sort((a,b)=>String(a).localeCompare(String(b),'ar'))
 const labels=[...requested,...extras]
 const rows=labels.map(label=>{
  const row=matrix.get(label)||new Map(),obj={label}
  let total=0;bset.forEach(b=>{const v=row.get(b.id)||0;obj[b.id]=money(v);total+=v});obj.total=money(total);return obj
 })
 const salesObj={label:'المبيعات'},pctObj={label:'%'}
 let totalSales=0,totalCash=0
 bset.forEach(b=>{const s=salesBy.get(b.id)||0;totalSales+=s;salesObj[b.id]=money(s)
  const exp=cash.filter(r=>r.branch_id===b.id&&r.is_expense).reduce((a,r)=>a+Number(r.amount||0),0);totalCash+=exp;pctObj[b.id]=pct(s?exp/s:0)})
 salesObj.total=money(totalSales);pctObj.total=pct(totalSales?totalCash/totalSales:0)
 const cols=[{key:'label',label:'البيان'},...bset.map(b=>({key:b.id,label:b.name,num:1})),{key:'total',label:'الإجمالي',num:1}]
 shell('تقرير المصروفات','مطابقة بنود ورقة الإدارة × الفروع × الإجمالي',
  filters(from,to,branch)+scope(from,to,branch)+table('تحليل مصروفات الفروع',cols,[salesObj,pctObj,...rows]))
 bindFilters('expenses')
}

async function renderExpenseMatrix(){
 const cfg=currentFilters(),branch=cfg.branch,from=cfg.from,to=cfg.to
 let salesQ=supabase.from('v_branch_daily_kpis').select('branch_id,business_date,net_sales').gte('business_date',from).lte('business_date',to)
 let expQ=supabase.from('v_expense_analysis').select('branch_id,canonical_category,expense_group,amount').gte('entry_date',from).lte('entry_date',to)
 let setQ=supabase.from('branch_expense_accrual_settings').select('branch_id,month_start,wages,branch_manager,sector_manager,rent,carried_expenses,commission_rate,working_days_basis').lte('month_start',to).order('month_start',{ascending:false})
 if(branch){salesQ=salesQ.eq('branch_id',branch);expQ=expQ.eq('branch_id',branch);setQ=setQ.eq('branch_id',branch)}
 const all=await Promise.all([salesQ,expQ,setQ]),sales=all[0].data||[],expenses=all[1].data||[],settings=all[2].data||[]
 if(all[0].error||all[1].error||all[2].error)throw all[0].error||all[1].error||all[2].error
 const bset=branch?branches.filter(b=>b.id===branch):branches
 const salesBy=new Map(),daysBy=new Map()
 sales.forEach(r=>{salesBy.set(r.branch_id,(salesBy.get(r.branch_id)||0)+Number(r.net_sales||0));const set=daysBy.get(r.branch_id)||new Set();set.add(r.business_date);daysBy.set(r.branch_id,set)})
 const latestSetting=new Map();settings.forEach(r=>{if(!latestSetting.has(r.branch_id))latestSetting.set(r.branch_id,r)})
 const expBy=new Map()
 expenses.forEach(r=>{const txt=((r.canonical_category||'')+' '+(r.expense_group||'')).toLowerCase(),x=expBy.get(r.branch_id)||{treasury:0,fuel:0,petro:0}
  x.treasury+=Number(r.amount||0);if(/سولار|وقود|fuel/.test(txt))x.fuel+=Number(r.amount||0);if(/بترو|petro/.test(txt))x.petro+=Number(r.amount||0);expBy.set(r.branch_id,x)})
 const raw=bset.map(b=>{
  const s=salesBy.get(b.id)||0,st=latestSetting.get(b.id)||{},ex=expBy.get(b.id)||{treasury:0,fuel:0,petro:0},days=(daysBy.get(b.id)||new Set()).size
  const basis=Number(st.working_days_basis||30),wages=Number(st.wages||0)+Number(st.branch_manager||0)+Number(st.sector_manager||0),rent=Number(st.rent||0)
  const accrued=wages+rent,carried=Number(st.carried_expenses||0),toDate=(accrued*(days/Math.max(1,basis)))+carried,commission=s*Number(st.commission_rate||0)
  const vehicle=ex.fuel+ex.petro,total=toDate+ex.treasury+commission
  return {branch_name:b.name,sales:s,days,wages,rent,accrued,carried,toDate,fuel:ex.fuel,petro:ex.petro,vehicle,vehicleRate:s?vehicle/s:0,treasury:ex.treasury,commission,total,totalRate:s?total/s:0}
 })
 const rows=raw.map(x=>({branch_name:x.branch_name,sales:money(x.sales),days:x.days,wages:money(x.wages),rent:money(x.rent),accrued:money(x.accrued),carried:money(x.carried),to_date:money(x.toDate),fuel:money(x.fuel),petro:money(x.petro),vehicle:money(x.vehicle),vehicle_rate:pct(x.vehicleRate),treasury:money(x.treasury),commission:money(x.commission),expenses:money(x.total),expense_rate:pct(x.totalRate)}))
 const total=raw.reduce((a,x)=>{for(const k of ['sales','wages','rent','accrued','carried','toDate','fuel','petro','vehicle','treasury','commission','total'])a[k]+=x[k];return a},{sales:0,wages:0,rent:0,accrued:0,carried:0,toDate:0,fuel:0,petro:0,vehicle:0,treasury:0,commission:0,total:0})
 const totalRow='<tr class="total"><th>الإجمالي</th><th class="num">'+money(total.sales)+'</th><th>—</th><th class="num">'+money(total.wages)+'</th><th class="num">'+money(total.rent)+'</th><th class="num">'+money(total.accrued)+'</th><th class="num">'+money(total.carried)+'</th><th class="num">'+money(total.toDate)+'</th><th class="num">'+money(total.fuel)+'</th><th class="num">'+money(total.petro)+'</th><th class="num">'+money(total.vehicle)+'</th><th>'+pct(total.sales?total.vehicle/total.sales:0)+'</th><th class="num">'+money(total.treasury)+'</th><th class="num">'+money(total.commission)+'</th><th class="num">'+money(total.total)+'</th><th>'+pct(total.sales?total.total/total.sales:0)+'</th></tr>'
 shell('تحليلي مصروفات','مطابقة ورقة الإدارة: المستحقات + السيارات + الخزينة + العمولات',
  filters(from,to,branch)+scope(from,to,branch)+table('تحليلي مصروفات',[
   {key:'branch_name',label:'الفروع'},{key:'sales',label:'المبيعات',num:1},{key:'days',label:'أيام العمل'},
   {key:'wages',label:'أجور',num:1},{key:'rent',label:'إيجارات',num:1},{key:'accrued',label:'إجمالي المستحق',num:1},
   {key:'carried',label:'مصروفات مرحلة',num:1},{key:'to_date',label:'المستحق حتى تاريخه',num:1},
   {key:'fuel',label:'م. سولار',num:1},{key:'petro',label:'بترو أب',num:1},{key:'vehicle',label:'إجمالي سيارات',num:1},{key:'vehicle_rate',label:'% السيارات'},
   {key:'treasury',label:'مصروفات من الخزينة',num:1},{key:'commission',label:'عمولات',num:1},{key:'expenses',label:'المصروفات',num:1},{key:'expense_rate',label:'% المصروفات'}
  ],rows,totalRow))
 bindFilters('expense-matrix')
}

async function renderReceivables(){
 const {branch,from,to}=currentFilters();const daily=await loadDaily(branch,from,to)
 const by=new Map()
 daily.forEach(r=>{const k=r.branch_id;const x=by.get(k)||{branch_name:r.branch_name,opening:+r.opening_receivables||0,sales:0,collections:0,closing:0,first:r.business_date,last:r.business_date};if(r.business_date<x.first){x.first=r.business_date;x.opening=+r.opening_receivables||0}if(r.business_date>=x.last){x.last=r.business_date;x.closing=+r.closing_receivables||0}x.sales+=+r.net_sales||0;x.collections+=+r.collections||0;by.set(k,x)})
 const rows=[...by.values()].map(x=>({branch_name:x.branch_name,opening:money(x.opening),sales:money(x.sales),collections:money(x.collections),rate:pct(x.sales?x.collections/x.sales:0),closing:money(x.closing),check:Math.abs((x.opening+x.sales-x.collections)-x.closing)<.02?'مطابق':'راجع'}))
 shell('المديونيات والتحصيل','افتتاحي + صافي البيع - التحصيل = رصيد آخر',filters(from,to,branch)+scope(from,to,branch)+table('المديونية حسب الفرع',[{key:'branch_name',label:'الفرع'},{key:'opening',label:'مديونية أول',num:1},{key:'sales',label:'صافي البيع',num:1},{key:'collections',label:'التحصيل',num:1},{key:'rate',label:'% التحصيل'},{key:'closing',label:'مديونية آخر',num:1},{key:'check',label:'فحص المعادلة'}],rows))
 bindFilters('receivables')
}

async function renderMonthly(){
 const p=qs(),year=p.get('year')||String(new Date().getFullYear()),branch=p.get('branch')||'',from=year+'-01-01',to=year+'-12-31',ids=await approvedIds()
 let dailyQ=supabase.from('v_branch_daily_kpis').select('branch_id,branch_name,business_date,gross_sales,net_sales,discounts,collections,closing_receivables').gte('business_date',from).lte('business_date',to).order('business_date')
 let whQ=supabase.from('warehouse_daily_summary').select('branch_id,business_date,closing_value').in('batch_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']).gte('business_date',from).lte('business_date',to).order('business_date')
 let expQ=supabase.from('v_expense_analysis').select('branch_id,entry_date,amount').gte('entry_date',from).lte('entry_date',to)
 if(branch){dailyQ=dailyQ.eq('branch_id',branch);whQ=whQ.eq('branch_id',branch);expQ=expQ.eq('branch_id',branch)}
 const all=await Promise.all([dailyQ,whQ,expQ]),daily=all[0].data||[],warehouse=all[1].data||[],expenses=all[2].data||[]
 if(all[0].error||all[1].error||all[2].error)throw all[0].error||all[1].error||all[2].error
 const byMonth=new Map(),lastDebt=new Map(),lastInv=new Map()
 daily.forEach(r=>{
  const m=r.business_date.slice(0,7),x=byMonth.get(m)||{month:m,gross:0,net:0,disc:0,coll:0,exp:0,debt:0,inv:0}
  x.gross+=Number(r.gross_sales||0);x.net+=Number(r.net_sales||0);x.disc+=Number(r.discounts||0);x.coll+=Number(r.collections||0);byMonth.set(m,x)
  const key=m+'|'+r.branch_id,prev=lastDebt.get(key)
  if(!prev||r.business_date>=prev.date)lastDebt.set(key,{date:r.business_date,value:Number(r.closing_receivables||0)})
 })
 warehouse.forEach(r=>{
  const m=r.business_date.slice(0,7),key=m+'|'+r.branch_id,prev=lastInv.get(key)
  if(!prev||r.business_date>=prev.date)lastInv.set(key,{date:r.business_date,value:Number(r.closing_value||0)})
 })
 expenses.forEach(r=>{const m=r.entry_date.slice(0,7),x=byMonth.get(m)||{month:m,gross:0,net:0,disc:0,coll:0,exp:0,debt:0,inv:0};x.exp+=Number(r.amount||0);byMonth.set(m,x)})
 lastDebt.forEach((v,key)=>{const m=key.slice(0,7),x=byMonth.get(m);if(x)x.debt+=v.value})
 lastInv.forEach((v,key)=>{const m=key.slice(0,7),x=byMonth.get(m);if(x)x.inv+=v.value})
 let ytd=0
 const rows=[...byMonth.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(x=>{ytd+=x.net;return{month:x.month,gross:money(x.gross),disc:money(x.disc),net:money(x.net),coll:money(x.coll),exp:money(x.exp),debt:money(x.debt),inv:money(x.inv),ytd:money(ytd)}})
 const form='<form id="year-filter" class="filters"><div class="field"><label>الفرع</label><select name="branch">'+branchOptions(branch)+'</select></div><div class="field"><label>السنة</label><input name="year" value="'+year+'"></div><div></div><div class="field"><label>&nbsp;</label><button class="btn">تطبيق</button></div></form>'
 shell('التحليل الشهري وYTD','مقارنة الشهور والتراكم السنوي من المصادر المعتمدة',form+table('Monthly / YTD',[{key:'month',label:'الشهر'},{key:'gross',label:'قبل الخصم',num:1},{key:'disc',label:'الخصم',num:1},{key:'net',label:'صافي المبيعات',num:1},{key:'coll',label:'التحصيل',num:1},{key:'exp',label:'المصروفات الفعلية',num:1},{key:'debt',label:'مديونية آخر الشهر',num:1},{key:'inv',label:'قيمة مخزون آخر الشهر',num:1},{key:'ytd',label:'YTD صافي المبيعات',num:1}],rows))
 document.getElementById('year-filter')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget);location.hash='#/monthly?branch='+(fd.get('branch')||'')+'&year='+fd.get('year')})
}

async function renderBanks(){
 const p=qs();const to=p.get('to')||defaultTo,from=`${to.slice(0,4)}-01-01`,branch=p.get('branch')||''
 let accountQ=supabase.from('treasury_accounts').select('id,branch_id,name,code,account_type').eq('is_active',true)
 let entryQ=supabase.from('cash_entries').select('branch_id,treasury_account_id,entry_date,direction,amount').gte('entry_date',from).lte('entry_date',to)
 if(branch){accountQ=accountQ.eq('branch_id',branch);entryQ=entryQ.eq('branch_id',branch)}
 const [{data:accounts},{data:entries,error}]=await Promise.all([accountQ,entryQ]);if(error)throw error
 const names=new Map(branches.map(b=>[b.id,b.name])),byId=new Map((accounts||[]).map(a=>[a.id,a]))
 const rowsMap=new Map()
 ;(entries||[]).forEach(e=>{const a=byId.get(e.treasury_account_id);if(!a||a.account_type!=='bank')return;const key=`${a.branch_id}:${a.id}`;const x=rowsMap.get(key)||{branch_name:names.get(a.branch_id)||'-',account:a.name,in:0,out:0};if(e.direction==='in')x.in+=+e.amount||0;else x.out+=+e.amount||0;rowsMap.set(key,x)})
 const rows=[...rowsMap.values()].map(x=>({...x,in:money(x.in),out:money(x.out),net:money((+x.in.toString().replace(/,/g,''))-(+x.out.toString().replace(/,/g,'')))}))
 const form=`<form id="bank-filter" class="filters"><div class="field"><label>الفرع</label><select name="branch">${branchOptions(branch)}</select></div><div class="field"><label>حتى تاريخ</label><input type="date" name="to" value="${to}"></div><div></div><div class="field"><label>&nbsp;</label><button class="btn">تطبيق</button></div></form>`
 shell('البنوك وYTD','حركة الحسابات البنكية منذ بداية السنة',form+scope(from,to,branch)+table('الحسابات البنكية',[{key:'branch_name',label:'الفرع'},{key:'account',label:'الحساب'},{key:'in',label:'داخل',num:1},{key:'out',label:'خارج',num:1},{key:'net',label:'الصافي',num:1}],rows))
 document.getElementById('bank-filter')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget);location.hash=`#/banks?branch=${fd.get('branch')||''}&to=${fd.get('to')}`})
}

async function renderReps(){const {branch,from,to}=currentFilters();const ids=await approvedIds();let q=supabase.from('sales_rep_daily').select('branch_id,business_date,rep_name,sales_before_discount,net_after_discount,discounts,deposit_amount,closing_balance').in('batch_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']).gte('business_date',from).lte('business_date',to).order('business_date',{ascending:true});if(branch)q=q.eq('branch_id',branch);const {data,error}=await q;if(error)throw error;const names=new Map(branches.map(b=>[b.id,b.name]));const by=new Map();(data||[]).forEach(r=>{const k=`${r.branch_id}:${r.rep_name}`;const x=by.get(k)||{branch_name:names.get(r.branch_id),rep_name:r.rep_name,gross:0,net:0,disc:0,deposit:0,closing:0};x.gross+=+r.sales_before_discount||0;x.net+=+r.net_after_discount||0;x.disc+=+r.discounts||0;x.deposit+=+r.deposit_amount||0;x.closing=+r.closing_balance||x.closing;by.set(k,x)});const rows=[...by.values()].map(x=>({...x,gross:money(x.gross),net:money(x.net),disc:money(x.disc),deposit:money(x.deposit),closing:money(x.closing)}));shell('أداء المناديب','المندوب × الفرع',filters(from,to,branch)+scope(from,to,branch)+table('أداء المناديب',[{key:'branch_name',label:'الفرع'},{key:'rep_name',label:'المندوب'},{key:'gross',label:'قبل الخصم',num:1},{key:'disc',label:'الخصم',num:1},{key:'net',label:'صافي البيع',num:1},{key:'deposit',label:'التوريد',num:1},{key:'closing',label:'الرصيد',num:1}],rows));bindFilters('reps')}
async function renderInventory(){
 const cfg=currentFilters(),branch=cfg.branch,from=cfg.from,to=cfg.to,ids=await approvedIds()
 let q=supabase.from('warehouse_daily_summary').select('*').in('batch_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']).gte('business_date',from).lte('business_date',to).order('business_date')
 if(branch)q=q.eq('branch_id',branch)
 const {data,error}=await q;if(error)throw error
 const names=new Map(branches.map(b=>[b.id,b.name])),by=new Map()
 ;(data||[]).forEach(r=>{
  const x=by.get(r.branch_id)||{branch_name:names.get(r.branch_id)||'—',firstDate:r.business_date,lastDate:r.business_date,qty:{},val:{}}
  if(String(r.business_date)<String(x.firstDate)){x.firstDate=r.business_date;x.qty.opening=Number(r.opening_qty||0);x.val.opening=Number(r.opening_value||0)}
  if(x.qty.opening===undefined){x.qty.opening=Number(r.opening_qty||0);x.val.opening=Number(r.opening_value||0)}
  const add=(obj,key,v)=>obj[key]=(obj[key]||0)+Number(v||0)
  add(x.qty,'factory',r.incoming_factory_qty);add(x.val,'factory',r.incoming_factory_value)
  add(x.qty,'branches',r.incoming_branches_qty);add(x.val,'branches',r.incoming_branches_value)
  add(x.qty,'sales',r.sales_qty);add(x.val,'sales',r.sales_value)
  add(x.qty,'bonus',r.bonus_qty);add(x.val,'bonus',r.bonus_value)
  add(x.qty,'gifts',r.gifts_qty);add(x.val,'gifts',r.gifts_value)
  add(x.qty,'damages',r.damages_qty);add(x.val,'damages',r.damages_value)
  add(x.qty,'return_factory',r.return_factory_qty);add(x.val,'return_factory',r.return_factory_value)
  add(x.qty,'out_branches',r.outgoing_branches_qty);add(x.val,'out_branches',r.outgoing_branches_value)
  add(x.qty,'adjustment',r.adjustment_qty);add(x.val,'adjustment',r.adjustment_value)
  if(String(r.business_date)>=String(x.lastDate)){x.lastDate=r.business_date;x.qty.closing=Number(r.closing_qty||0);x.val.closing=Number(r.closing_value||0)}
  by.set(r.branch_id,x)
 })
 const rows=[]
 ;[...by.values()].forEach(x=>{
  rows.push({branch_name:x.branch_name,date:from+' → '+to,type:'الكمية',opening:qty(x.qty.opening),factory:qty(x.qty.factory),branches:qty(x.qty.branches),sales:qty(x.qty.sales),bonus:qty(x.qty.bonus),gifts:qty(x.qty.gifts),damages:qty(x.qty.damages),return_factory:qty(x.qty.return_factory),out_branches:qty(x.qty.out_branches),adjustment:qty(x.qty.adjustment),closing:qty(x.qty.closing),chains_in:'—',chains_out:'—',army:'—'})
  rows.push({branch_name:x.branch_name,date:from+' → '+to,type:'القيمة',opening:money(x.val.opening),factory:money(x.val.factory),branches:money(x.val.branches),sales:money(x.val.sales),bonus:money(x.val.bonus),gifts:money(x.val.gifts),damages:money(x.val.damages),return_factory:money(x.val.return_factory),out_branches:money(x.val.out_branches),adjustment:money(x.val.adjustment),closing:money(x.val.closing),chains_in:'—',chains_out:'—',army:'—'})
 })
 shell('حركة مخزون','مطابقة ورقة الإدارة: كمية وقيمة لكل فرع',filters(from,to,branch)+scope(from,to,branch)+table('حركة مخزون',[
  {key:'branch_name',label:'الفرع'},{key:'date',label:'الفترة'},{key:'type',label:'م'},
  {key:'opening',label:'رصيد أول',num:1},{key:'factory',label:'وارد مصنع',num:1},{key:'branches',label:'وارد فروع',num:1},
  {key:'sales',label:'إجمالي مبيعات اليوم',num:1},{key:'bonus',label:'البوانص',num:1},{key:'gifts',label:'هدايا',num:1},
  {key:'damages',label:'توالف',num:1},{key:'return_factory',label:'مرتجع للمصنع',num:1},{key:'out_branches',label:'منصرف للفروع',num:1},
  {key:'adjustment',label:'تسوية',num:1},{key:'closing',label:'رصيد آخر',num:1},
  {key:'chains_in',label:'وارد سلاسل'},{key:'chains_out',label:'منصرف سلاسل'},{key:'army',label:'جيش'}
 ],rows))
 bindFilters('inventory')
}
async function renderProducts(){
 const {branch,from,to}=currentFilters(),ids=await approvedIds()
 let q=supabase.from('inventory_daily')
  .select('id,branch_id,business_date,product_id,product_name,sales_qty,closing_qty,closing_value')
  .in('batch_id',ids.length?ids:['00000000-0000-0000-0000-000000000000'])
  .gte('business_date',from).lte('business_date',to)
  .order('business_date',{ascending:true})
 if(branch)q=q.eq('branch_id',branch)
 const {data,error}=await q;if(error)throw error
 const bset=branch?branches.filter(b=>b.id===branch):branches
 const sales=new Map()
 ;(data||[]).forEach(r=>{
  const key=r.branch_id+'|'+(r.product_id||r.product_name)
  sales.set(key,(sales.get(key)||0)+Number(r.sales_qty||0))
 })
 const latest=latestInventoryByProduct(data||[]),matrix=new Map()
 latest.forEach(r=>{
  const x=matrix.get(r.product_name)||{}
  const key=r.branch_id+'|'+(r.product_id||r.product_name)
  x[r.branch_id]={sales:sales.get(key)||0,closing:Number(r.closing_qty||0),value:Number(r.closing_value||0),date:r.business_date}
  matrix.set(r.product_name,x)
 })
 const rows=[...matrix.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ar')).map(([product,cells])=>{
  let html='<td class="row-label">'+escapeHtml(product)+'</td>'
  for(const b of bset){
   const x=cells[b.id]
   html+='<td class="num">'+(x?qty(x.sales):'—')+'</td><td class="num">'+(x?qty(x.closing):'—')+'</td><td class="num">'+(x?money(x.value):'—')+'</td>'
  }
  return '<tr>'+html+'</tr>'
 }).join('')
 const head=bset.map((b,i)=>'<th colspan="3" class="'+(i%2?'group-green':'group-blue')+'">'+escapeHtml(b.name)+'</th>').join('')
 const sub=bset.map(()=>'<th>بيع</th><th>رصيد آخر</th><th>قيمة رصيد آخر</th>').join('')
 shell('أرصدة ومصفوفة الأصناف','الرصيد = عمود رصيد آخر لنفس الصنف في آخر يوم متاح',
  filters(from,to,branch)+scope(from,to,branch)+
  '<section class="table-card matrix"><div class="table-head"><div><h2>أرصدة الفروع حسب آخر رصيد للصنف</h2><small>'+matrix.size+' صنف</small></div></div><div class="table-wrap"><table><thead><tr><th rowspan="2">الصنف</th>'+head+'</tr><tr>'+sub+'</tr></thead><tbody>'+rows+'</tbody></table></div></section>')
 bindFilters('products')
}
async function renderBranches(){const {data,error}=await supabase.from('branches').select('id,name,code,is_active,created_at,treasury_accounts(id,is_active)').order('created_at');if(error)throw error;const rows=(data||[]).map(b=>({name:b.name,code:b.code,status:b.is_active?'نشط':'متوقف',treasuries:(b.treasury_accounts||[]).filter(x=>x.is_active).length,created_at:new Date(b.created_at).toLocaleString('en-GB')}));const add=profile?.role==='admin'?`<section class="card" style="margin-bottom:14px"><h2>+ إضافة فرع جديد</h2><form id="add-branch" class="filters" style="margin:0"><div class="field"><label>اسم الفرع</label><input name="name" required></div><div class="field"><label>كود الفرع</label><input name="code" dir="ltr" required></div><div></div><div class="field"><label>&nbsp;</label><button class="btn">إنشاء الفرع</button></div></form><div id="branch-msg"></div></section>`:'';shell('إدارة الفروع','إضافة الفروع وإدارة الحالة',add+table('الفروع الحالية',[{key:'name',label:'الفرع'},{key:'code',label:'الكود'},{key:'status',label:'الحالة'},{key:'treasuries',label:'عدد الخزائن',num:1},{key:'created_at',label:'تاريخ الإنشاء'}],rows));document.getElementById('add-branch')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const {error}=await supabase.rpc('create_branch_with_default_treasury',{p_code:String(fd.get('code')).trim(),p_name:String(fd.get('name')).trim()});document.getElementById('branch-msg').innerHTML=error?`<div class="error">${error.message}</div>`:'<div class="success">تم إنشاء الفرع والخزنة الرئيسية.</div>';if(!error)boot()})}
async function renderImports(){
 const {data,error}=await supabase.from('import_batches').select('id,branch_id,original_file_name,period_start,period_end,version,status,uploaded_at,approved_at,validated_at,failure_message,branches(name)').order('uploaded_at',{ascending:false}).limit(300)
 if(error)throw error
 const labels={uploaded:'مرفوع',processing:'قيد التحليل',validated:'جاهز للاعتماد',approved:'معتمد',rejected:'يحتاج مراجعة',failed:'فشل',superseded:'نسخة سابقة'}
 const rows=(data||[]).map(r=>({
  branch_name:Array.isArray(r.branches)?r.branches[0]?.name:r.branches?.name,
  period:`${r.period_start} — ${r.period_end}`,
  file:r.original_file_name,
  version:r.version,
  status:labels[r.status]||r.status,
  uploaded_at:new Date(r.uploaded_at).toLocaleString('en-GB'),
  approved_at:r.approved_at?new Date(r.approved_at).toLocaleString('en-GB'):'',
  action:r.status==='validated'&&profile?.role==='admin'
    ? `<button class="btn" onclick="approveBatch('${r.id}')">اعتماد</button>`
    : ['uploaded','failed','rejected','processing'].includes(r.status)
      ? `<button class="btn secondary" onclick="processBatch('${r.id}')">إعادة التحليل</button>`
      : (r.failure_message||'—')
 }))
 shell('سجل الرفع','كل نسخ الشيتات وحالة الاعتماد',`<div id="imports-msg"></div>`+table('نسخ الشيتات',[{key:'branch_name',label:'الفرع'},{key:'period',label:'الفترة'},{key:'file',label:'الملف'},{key:'version',label:'الإصدار',num:1},{key:'status',label:'الحالة'},{key:'uploaded_at',label:'وقت الرفع'},{key:'approved_at',label:'وقت الاعتماد'},{key:'action',label:'إجراء'}],rows))
}
window.processBatch=async id=>{
 const msg=document.getElementById('imports-msg'); if(msg)msg.innerHTML='<div class="notice">جاري تحليل الملف…</div>'
 try{
  const {data:{session:active}}=await supabase.auth.getSession()
  const res=await fetch(`${SUPABASE_URL}/functions/v1/ammco-import-process`,{
   method:'POST',
   headers:{Authorization:`Bearer ${active.access_token}`,apikey:SUPABASE_KEY,'Content-Type':'application/json'},
   body:JSON.stringify({batchId:id})
  })
  const out=await res.json()
  if(!res.ok) throw new Error(out.error||'تعذر تحليل الملف')
  if(msg)msg.innerHTML=out.status==='rejected'
    ? `<div class="error">تم التحليل ويحتاج مراجعة: ${out.issues} ملاحظة.</div>`
    : `<div class="success">تم التحليل بنجاح: ${out.sheets} صفحة، ${out.rows} صف، ${out.products} صنف.</div>`
  setTimeout(renderImports,500)
 }catch(err){if(msg)msg.innerHTML=`<div class="error">${err.message||err}</div>`}
}

window.approveBatch=async id=>{
 const msg=document.getElementById('imports-msg'); if(msg)msg.innerHTML='<div class="notice">جاري اعتماد النسخة…</div>'
 const {error}=await supabase.rpc('approve_import_batch',{p_batch_id:id})
 if(error){if(msg)msg.innerHTML=`<div class="error">${error.message}</div>`;return}
 if(msg)msg.innerHTML='<div class="success">تم اعتماد النسخة وتحديث التقارير.</div>'
 setTimeout(renderImports,500)
}
function renderUploads(){
 const branchOpts=selected=>`<option value="">اختر الفرع</option>${branches.map(b=>`<option value="${b.id}" ${selected===b.id?'selected':''}>${b.name}</option>`).join('')}`
 const todayMonth=new Date().toISOString().slice(0,7)
 const periodStart=`${todayMonth}-01`
 const periodEnd=new Date(new Date().getFullYear(),new Date().getMonth()+1,0).toISOString().slice(0,10)
 const lanes=Array.from({length:12},(_,i)=>({
  index:i+1,
  branchId:branches[i]?.id||'',
  branchName:branches[i]?.name||'مسار إضافي'
 }))
 shell('رفع شيتات الفروع','12 مسار رفع في نفس الشاشة مع متابعة مستقلة لكل فرع',`
  <div id="upload-msg"></div>
  <section class="card bulk-upload-head">
   <div class="notice">يمكنك تجهيز حتى 12 فرعًا ثم الضغط مرة واحدة. التحليل يتم على جهازك، والحفظ يتم في Supabase. للحفاظ على استقرار المتصفح تتم المعالجة في 3 مسارات متوازية آمنة.</div>
   <div class="bulk-period">
    <div class="field"><label>من</label><input id="bulk-period-start" type="date" value="${periodStart}"></div>
    <div class="field"><label>إلى</label><input id="bulk-period-end" type="date" value="${periodEnd}"></div>
    <div class="bulk-summary"><strong id="bulk-ready-count">0</strong><span>ملف جاهز</span></div>
    <button class="btn" id="bulk-upload-btn">رفع وتحليل الملفات المحددة</button>
   </div>
  </section>
  <section class="upload-lanes">
   ${lanes.map(l=>`
    <article class="upload-lane" data-lane="${l.index}">
     <div class="upload-lane-head">
      <span class="lane-number">${String(l.index).padStart(2,'0')}</span>
      <strong class="lane-title">${l.branchName}</strong>
      <span class="lane-status idle" id="lane-status-${l.index}">بانتظار ملف</span>
     </div>
     <div class="upload-lane-body">
      <div class="field"><label>الفرع</label><select class="lane-branch" data-lane="${l.index}">${branchOpts(l.branchId)}</select></div>
      <div class="field lane-file-field"><label>ملف Excel</label><input class="lane-file" data-lane="${l.index}" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div>
      <div class="lane-file-name" id="lane-file-name-${l.index}">لم يتم اختيار ملف</div>
     </div>
     <div class="lane-progress"><span id="lane-progress-${l.index}"></span></div>
     <div class="lane-result" id="lane-result-${l.index}"></div>
    </article>`).join('')}
  </section>
  <div class="bulk-upload-footer">
   <span>الفروع الموجودة حاليًا: <b>${branches.length}</b></span>
   <span>المسارات المتاحة: <b>12</b></span>
   <span>المسارات الإضافية: <b>${Math.max(0,12-branches.length)}</b></span>
  </div>
 `)

 const readyCount=()=>{
  const files=[...document.querySelectorAll('.lane-file')].filter(input=>input.files?.[0]).length
  const el=document.getElementById('bulk-ready-count');if(el)el.textContent=String(files)
 }
 document.querySelectorAll('.lane-file').forEach(input=>input.addEventListener('change',()=>{
  const lane=input.dataset.lane
  const file=input.files?.[0]
  const name=document.getElementById(`lane-file-name-${lane}`)
  const status=document.getElementById(`lane-status-${lane}`)
  if(name)name.textContent=file?file.name:'لم يتم اختيار ملف'
  if(status){status.textContent=file?'جاهز للرفع':'بانتظار ملف';status.className=`lane-status ${file?'ready':'idle'}`}
  readyCount()
 }))
 document.querySelectorAll('.lane-branch').forEach(select=>select.addEventListener('change',()=>{
  const lane=select.dataset.lane
  const title=select.closest('.upload-lane')?.querySelector('.lane-title')
  const option=select.options[select.selectedIndex]
  if(title)title.textContent=option?.text||'مسار إضافي'
 }))

 const setLane=(lane,state,label,detail='',progress=0)=>{
  const status=document.getElementById(`lane-status-${lane}`)
  const result=document.getElementById(`lane-result-${lane}`)
  const bar=document.getElementById(`lane-progress-${lane}`)
  if(status){status.textContent=label;status.className=`lane-status ${state}`}
  if(result)result.innerHTML=detail
  if(bar)bar.style.width=`${Math.max(0,Math.min(100,progress))}%`
 }

 const processLane=async task=>{
  const {lane,branchId,file,periodStart,periodEnd,active}=task
  try{
   setLane(lane,'working','قراءة الملف','جاري تحليل Excel على جهازك…',10)
   const parsed=await parseWorkbookBrowser(file,{periodStart,periodEnd})
   setLane(lane,'working','رفع الملف',`${parsed.stats.sheetCount} صفحة • ${parsed.stats.productCount} صنف`,35)

   const fd=new FormData()
   fd.set('branch_id',branchId)
   fd.set('period_start',periodStart)
   fd.set('period_end',periodEnd)
   fd.set('file',file)

   const uploadRes=await fetch(`${SUPABASE_URL}/functions/v1/ammco-import-upload`,{
    method:'POST',
    headers:{Authorization:`Bearer ${active.access_token}`,apikey:SUPABASE_KEY},
    body:fd
   })
   const uploaded=await uploadRes.json()
   if(!uploadRes.ok)throw new Error(uploaded.error||'تعذر رفع الملف')

   setLane(lane,'working','حفظ البيانات','جاري تسجيل البيانات والتحقق…',65)
   const processRes=await fetch(`${SUPABASE_URL}/functions/v1/ammco-import-process`,{
    method:'POST',
    headers:{Authorization:`Bearer ${active.access_token}`,apikey:SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({batchId:uploaded.batchId,parsed})
   })
   const processed=await processRes.json()
   if(!processRes.ok)throw new Error(processed.error||'تعذر تسجيل البيانات')

   if(processed.status==='rejected'){
    setLane(lane,'warning','يحتاج مراجعة',`${processed.issues||0} ملاحظة تحقق • الإصدار ${uploaded.version}`,100)
    return {lane,ok:true,review:true}
   }
   setLane(lane,'success','تم بنجاح',`الإصدار ${uploaded.version} • ${parsed.stats.representativeRowCount} سجل مندوب • ${parsed.stats.inventoryDailyRowCount} حركة صنف`,100)
   return {lane,ok:true,review:false}
  }catch(err){
   setLane(lane,'error','فشل',String(err?.message||err),100)
   return {lane,ok:false,error:String(err?.message||err)}
  }
 }

 const runPool=async(tasks,limit=3)=>{
  const results=[]
  let next=0
  const worker=async()=>{
   while(true){
    const i=next++
    if(i>=tasks.length)return
    results[i]=await processLane(tasks[i])
   }
  }
  await Promise.all(Array.from({length:Math.min(limit,tasks.length)},()=>worker()))
  return results
 }

 document.getElementById('bulk-upload-btn')?.addEventListener('click',async()=>{
  const button=document.getElementById('bulk-upload-btn')
  const msg=document.getElementById('upload-msg')
  const start=document.getElementById('bulk-period-start')?.value
  const end=document.getElementById('bulk-period-end')?.value
  if(!start||!end){msg.innerHTML='<div class="error">حدد الفترة أولًا.</div>';return}
  if(end<start){msg.innerHTML='<div class="error">تاريخ النهاية يجب ألا يسبق البداية.</div>';return}

  const {data:{session:active}}=await supabase.auth.getSession()
  if(!active){msg.innerHTML='<div class="error">انتهت جلسة الدخول. سجل الدخول مرة أخرى.</div>';return}

  const tasks=[]
  const usedBranches=new Set()
  for(let lane=1;lane<=12;lane++){
   const fileInput=document.querySelector(`.lane-file[data-lane="${lane}"]`)
   const branchSelect=document.querySelector(`.lane-branch[data-lane="${lane}"]`)
   const file=fileInput?.files?.[0]
   if(!file)continue
   const branchId=branchSelect?.value||''
   if(!branchId){setLane(lane,'error','حدد الفرع','اختر الفرع قبل الرفع',0);continue}
   if(usedBranches.has(branchId)){setLane(lane,'error','فرع مكرر','كل فرع يجب أن يظهر مرة واحدة في الدفعة',0);continue}
   usedBranches.add(branchId)
   tasks.push({lane,branchId,file,periodStart:start,periodEnd:end,active})
  }
  if(!tasks.length){msg.innerHTML='<div class="error">اختر ملفًا واحدًا على الأقل.</div>';return}

  button.disabled=true
  button.textContent=`جاري معالجة ${tasks.length} فرع…`
  msg.innerHTML=`<div class="notice">بدأت دفعة رفع ${tasks.length} فرع. يمكنك متابعة حالة كل مسار بشكل مستقل.</div>`

  const results=await runPool(tasks,3)
  const ok=results.filter(r=>r?.ok).length
  const failed=results.filter(r=>r&&!r.ok).length
  const review=results.filter(r=>r?.review).length
  msg.innerHTML=`<div class="${failed?'notice':'success'}">انتهت الدفعة: ${ok} نجح • ${review} يحتاج مراجعة • ${failed} فشل.</div>`
  button.disabled=false
  button.textContent='رفع وتحليل الملفات المحددة'
 })
}

boot()
