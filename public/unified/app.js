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
let defaultTo=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(new Date(today.getFullYear(),today.getMonth()+1,0).getDate()).padStart(2,'0')}`
let defaultFrom=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`
let canonicalPeriod=null
let canonicalCoverage={approvedBranches:0}

let branches=[]
let availableMonths=[]
let selectedMonth=''
let session=null
let profile=null
let bootstrappedUserId=null
const pageViewCache=new Map()
let currentRenderedKey=null
let bootPromise=null

const pageCacheKey=()=>location.hash||'#/dashboard'
const cacheableRoutes=new Set(['dashboard','reports'])
const isCacheableRoute=()=>cacheableRoutes.has(route().split('?')[0])
function clearPageCache(){
 pageViewCache.clear()
 currentRenderedKey=null
}

async function loadCanonicalPeriod(force=false){
 if(canonicalPeriod&&!force)return canonicalPeriod
 const {data,error}=await supabase
  .from('import_batches')
  .select('id,period_start,period_end,uploaded_at')
  .eq('status','approved')
  .order('period_end',{ascending:false})
  .order('uploaded_at',{ascending:false})
  .limit(1)
  .maybeSingle()
 if(error)throw error
 canonicalPeriod=data||null
 canonicalCoverage={approvedBranches:0}
 if(canonicalPeriod?.period_start&&canonicalPeriod?.period_end){
  defaultFrom=canonicalPeriod.period_start
  defaultTo=canonicalPeriod.period_end
  const {data:coverage,error:coverageError}=await supabase
   .from('import_batches')
   .select('branch_id')
   .eq('status','approved')
   .eq('period_start',canonicalPeriod.period_start)
   .eq('period_end',canonicalPeriod.period_end)
  if(coverageError)throw coverageError
  canonicalCoverage.approvedBranches=new Set((coverage||[]).map(x=>x.branch_id)).size
 }
 return canonicalPeriod
}

async function fetchAllRows(table,columns,applyQuery,context='تحميل البيانات'){
 const rows=[]
 const pageSize=1000
 for(let offset=0;;offset+=pageSize){
  let query=supabase.from(table).select(columns)
  if(applyQuery)query=applyQuery(query)
  const {data,error}=await query.range(offset,offset+pageSize-1)
  if(error)throw new Error(context+': '+error.message)
  const page=data||[]
  rows.push(...page)
  if(page.length<pageSize)break
 }
 return rows
}

async function boot(forceMeta=false){
 if(bootPromise)return bootPromise
 bootPromise=(async()=>{
  if(!session){const {data}=await supabase.auth.getSession();session=data.session}
  if(session)await loadCanonicalPeriod(forceMeta)
  if(session&&(forceMeta||bootstrappedUserId!==session.user.id||!profile)){
   const [{data:p},{data:b},{data:m}]=await Promise.all([
    supabase.from('profiles').select('full_name,role,is_active,organization_id').eq('user_id',session.user.id).maybeSingle(),
    supabase.from('branches').select('id,name,code,is_active').eq('is_active',true).order('name'),
    supabase.from('import_batches').select('period_start,period_end').eq('status','approved').order('period_start',{ascending:false})
   ])
   profile=p;branches=b||[]
   availableMonths=[...new Set((m||[]).map(x=>String(x.period_start||'').slice(0,7)).filter(Boolean))].sort().reverse()
   const savedMonth=localStorage.getItem('ammco.selectedMonth')||''
   selectedMonth=availableMonths.includes(savedMonth)?savedMonth:(availableMonths[0]||today.toISOString().slice(0,7))
   localStorage.setItem('ammco.selectedMonth',selectedMonth)
   bootstrappedUserId=session.user.id
  }
  await render({force:forceMeta})
 })()
 try{await bootPromise}finally{bootPromise=null}
}
window.addEventListener('hashchange',()=>render({force:true}))
supabase.auth.onAuthStateChange((event,s)=>{
 const prevUser=session?.user?.id
 session=s
 if(event==='SIGNED_OUT'){
  clearPageCache();branches=[];profile=null;bootstrappedUserId=null
  renderLogin();return
 }
 if(event==='SIGNED_IN'&&s?.user?.id!==prevUser)setTimeout(()=>boot(true),0)
 // TOKEN_REFRESHED / USER_UPDATED do not reload reports.
})

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
 {label:'النقدية والبنوك',items:[['banks','البنوك وYTD']]}
]
const selectedReport=()=>qs().get('report')||'executive'
function reportsHubNav(){
 const selected=selectedReport(),p=qs(),branch=p.get('branch')||''
 const options=REPORT_GROUPS.map(g=>'<optgroup label="'+g.label+'">'+g.items.map(item=>'<option value="'+item[0]+'" '+(selected===item[0]?'selected':'')+'>'+item[1]+'</option>').join('')+'</optgroup>').join('')
 return '<section class="reports-list-bar"><div class="field reports-select-field"><label>التقرير</label><select id="report-picker">'+options+'</select></div></section>'
}
window.changeUnifiedReport=select=>{
 const p=qs(),branch=p.get('branch')||''
 location.hash='#/reports?report='+encodeURIComponent(select.value)+'&branch='+encodeURIComponent(branch)
}



const EXEC_NAV_SECTIONS=[
 {id:'dashboard',label:'لوحة التحكم',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>'},
 {id:'reports',label:'التقارير',href:'#/reports?report=executive',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line></svg>'},
 {id:'expenses-center',label:'المصروفات',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M7 9h10M7 13h6"></path></svg>'},
 {id:'treasury',label:'الخزينة',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2"></circle></svg>'},
 {id:'uploads',label:'رفع الشيتات والسجل',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>'}
]
function globalMonthRange(month=selectedMonth){
 const m=month||today.toISOString().slice(0,7)
 const [y,mo]=m.split('-').map(Number)
 const last=new Date(y,mo,0).getDate()
 return {from:m+'-01',to:m+'-'+String(last).padStart(2,'0')}
}
function monthLabel(month){
 const [y,m]=String(month||'').split('-').map(Number)
 if(!y||!m)return month||''
 const names=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
 return names[m-1]+' '+y
}
function monthHeaderSelect(){
 const months=availableMonths.length?availableMonths:[selectedMonth]
 return '<div class="global-month-filter"><label>الشهر</label><select id="global-month-select">'+
  months.map(m=>'<option value="'+m+'" '+(m===selectedMonth?'selected':'')+'>'+monthLabel(m)+'</option>').join('')+
 '</select></div>'
}
window.changeGlobalMonth=function(month){
 if(!month||month===selectedMonth)return
 selectedMonth=month
 localStorage.setItem('ammco.selectedMonth',month)
 const r=route().split('?')[0],p=qs()
 p.delete('from');p.delete('to');p.delete('year')
 const query=p.toString()
 location.hash='#/'+r+(query?'?'+query:'')
 clearPageCache()
 render({force:true})
}

function shell(title,subtitle,body){
 const r=route().split('?')[0],collapsed=localStorage.getItem('ammco.sidebar.collapsed')==='1'
 const nav=EXEC_NAV_SECTIONS.filter(x=>x.id!=='users').map(x=>{
  const href=x.href||('#/'+x.id),active=r===x.id
  return '<a href="'+href+'" class="sidebar-nav-item '+(active?'active':'')+'">'+x.icon+'<span>'+x.label+'</span></a>'
 }).join('')
 const userNav=''
 const sourceBanner=canonicalPeriod
  ? '<div class="canonical-source-banner"><strong>مصدر البيانات: معتمد فقط</strong><span>الفترة الأساسية: '+escapeHtml(canonicalPeriod.period_start)+' → '+escapeHtml(canonicalPeriod.period_end)+'</span><span>التغطية: '+canonicalCoverage.approvedBranches+' / '+branches.length+' فروع نشطة</span></div>'
  : '<div class="canonical-source-banner warning"><strong>لا توجد فترة معتمدة</strong><span>لن تُعرض أرقام تشغيلية غير معتمدة.</span></div>'
 app.innerHTML=`<div class="shell ${collapsed?'sidebar-collapsed':''}">
  <aside class="sidebar">
   <div class="brand"><div class="logo">A</div><div><b>AMMCO</b><small>Management Intelligence</small></div></div>
   <div class="nav-title">مركز العمليات والتحليل</div>
   <nav class="nav-list" style="display:flex;flex-direction:column">${nav}${userNav}</nav>
  </aside>
  <main class="main">
   <header class="topbar">
    <div style="display:flex;align-items:center;gap:10px">
     <button class="btn secondary" type="button" onclick="toggleSidebar()" title="إخفاء أو إظهار القائمة"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg><span>القائمة</span></button>
     <div class="topbar-context"><b>${title}</b><span>${subtitle||''}</span></div>
    </div>
    <div class="actions">${monthHeaderSelect()}<span class="chip">${profile?.full_name||session?.user?.email||'مدير النظام'}</span><button class="btn secondary data-refresh-btn" type="button" onclick="refreshAllData(this)" title="جلب أحدث البيانات من قاعدة البيانات">↻ تحديث البيانات</button><button class="btn secondary" id="logout">خروج</button></div>
   </header>
   <section class="content executive-content">
    ${sourceBanner}
    ${r==='reports'?reportsHubNav():''}
    ${body}
   </section>
  </main>
 </div>`
 document.getElementById('logout')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.hash='';location.reload()})
 document.getElementById('report-picker')?.addEventListener('change',e=>changeUnifiedReport(e.currentTarget))
 document.getElementById('global-month-select')?.addEventListener('change',e=>changeGlobalMonth(e.currentTarget.value))
}
window.toggleSidebar=()=>{
 const el=document.querySelector('.shell');if(!el)return
 const collapsed=el.classList.toggle('sidebar-collapsed')
 localStorage.setItem('ammco.sidebar.collapsed',collapsed?'1':'0')
}
window.refreshAllData=async btn=>{
 if(btn){btn.disabled=true;btn.textContent='جاري التحديث…'}
 clearPageCache()
 try{await boot(true)}
 finally{
  const live=document.querySelector('.data-refresh-btn')
  if(live){live.disabled=false;live.textContent='↻ تحديث البيانات'}
 }
}

function formatDateRangeLabel(from,to){
 const fmtDate=v=>{const p=String(v||'').split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:v}
 return fmtDate(from)+' ← '+fmtDate(to)
}
function dateRangeField(formId,from,to){
 return '<div class="field date-range-field"><label>الفترة</label>'+
  '<input type="hidden" name="from" value="'+escapeAttr(from)+'">'+
  '<input type="hidden" name="to" value="'+escapeAttr(to)+'">'+
  '<button class="date-range-button" type="button" onclick="openDateRangePicker(\''+formId+'\')">'+
   '<span class="date-range-icon">▣</span><span class="date-range-text">'+escapeHtml(formatDateRangeLabel(from,to))+'</span>'+
  '</button></div>'
}
window.openDateRangePicker=function(formId){
 const form=document.getElementById(formId)
 if(!form)return
 const from=form.querySelector('[name="from"]')?.value||defaultFrom
 const to=form.querySelector('[name="to"]')?.value||defaultTo
 document.getElementById('date-range-dialog')?.remove()
 const html='<div class="dialog-backdrop" id="date-range-dialog"><div class="dialog-card date-range-dialog-card">'+
  '<div class="dialog-head"><h3>تحديد الفترة</h3><button class="tool-btn" type="button" onclick="document.getElementById(\'date-range-dialog\').remove()">إغلاق</button></div>'+
  '<form id="date-range-picker-form" class="date-range-picker-form">'+
   '<div class="date-range-picker-grid">'+
    '<div class="field"><label>أول الفترة</label><input name="picker_from" type="date" value="'+escapeAttr(from)+'" required></div>'+
    '<div class="date-range-arrow">←</div>'+
    '<div class="field"><label>آخر الفترة</label><input name="picker_to" type="date" value="'+escapeAttr(to)+'" required></div>'+
   '</div>'+
   '<div id="date-range-msg"></div>'+
   '<div class="date-range-actions"><button class="btn secondary" type="button" onclick="document.getElementById(\'date-range-dialog\').remove()">إلغاء</button><button class="btn" type="submit">تطبيق الفترة</button></div>'+
  '</form></div></div>'
 document.body.insertAdjacentHTML('beforeend',html)
 const picker=document.getElementById('date-range-picker-form')
 picker.addEventListener('submit',e=>{
  e.preventDefault()
  const f=picker.picker_from.value,t=picker.picker_to.value
  const msg=document.getElementById('date-range-msg')
  if(!f||!t){msg.innerHTML='<div class="error">حدد أول وآخر الفترة.</div>';return}
  if(t<f){msg.innerHTML='<div class="error">آخر الفترة يجب ألا يسبق أول الفترة.</div>';return}
  form.querySelector('[name="from"]').value=f
  form.querySelector('[name="to"]').value=t
  const label=form.querySelector('.date-range-text')
  if(label)label.textContent=formatDateRangeLabel(f,t)
  document.getElementById('date-range-dialog')?.remove()
 })
}

function branchOptions(selected=''){return `<option value="">كل الفروع</option>${branches.map(b=>`<option value="${b.id}" ${selected===b.id?'selected':''}>${b.name}</option>`).join('')}`}
function filters(from,to,branch){return `<form id="filters" class="filters compact-filters">
 <div class="field filter-branch"><label>الفرع</label><select name="branch">${branchOptions(branch)}</select></div>
 <div class="filter-month-note"><span>الشهر المطبق</span><b>${monthLabel(selectedMonth)}</b></div>
 <div class="filter-buttons"><button class="btn" type="submit">تطبيق الفرع</button><button class="btn secondary" type="button" onclick="resetReportFilters()">كل الفروع</button></div>
</form>`}
function bindFilters(path){document.getElementById('filters')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);const current=route().split('?')[0];if(current==='reports'){location.hash=`#/reports?report=${selectedReport()}&branch=${f.get('branch')||''}`;return}location.hash=`#/${path}?branch=${f.get('branch')||''}`})}
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
 const parseNumericValue=v=>{
  const s=String(v??'').replace(/<[^>]*>/g,'').replace(/,/g,'').replace(/ج\.م/g,'').trim()
  if(!s||s==='—'||s==='-')return null
  if(/%$/.test(s))return null
  const n=Number(s)
  return Number.isFinite(n)?n:null
 }
 const autoTotal=!totalRow&&cols.some(col=>col.num)&&rows.length
  ? '<tr class="total auto-total">'+cols.map((col,index)=>{
      if(index===0)return '<th>الإجمالي</th>'
      if(!col.num)return '<td></td>'
      const sum=rows.reduce((a,r)=>{const n=parseNumericValue(r[col.key]);return a+(n===null?0:n)},0)
      return '<td class="num">'+money(sum)+'</td>'
    }).join('')+'</tr>'
  : ''
 return '<section class="table-card" data-report-title="'+escapeAttr(title)+'">'+
  '<div class="table-head"><div><h2>'+title+'</h2><small>'+rows.length+' صف</small></div>'+
  '<div class="table-tools"><input class="search" placeholder="بحث…" oninput="applyTableFilters(this)">'+
  '<button class="tool-btn" type="button" onclick="clearTableFilters(this)">مسح الفلاتر</button>'+
  '<button class="tool-btn" type="button" onclick="exportVisibleTableXlsx(this)">Excel</button>'+
  '<button class="tool-btn" type="button" onclick="printReportOnly(this)">طباعة</button></div></div>'+
  '<div class="table-wrap"><table><thead><tr>'+headers+'</tr></thead><tbody>'+
  rows.map(r=>'<tr>'+cols.map(col=>'<td class="'+(col.num?'num ':'')+(col.key==='branch_name'?'row-label':'')+'">'+(r[col.key]??'-')+'</td>').join('')+'</tr>').join('')+
  (totalRow||autoTotal)+'</tbody></table></div></section>'
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
async function renderFresh(){
 if(!session) return renderLogin()
 if(!profile?.is_active) return shell('AMMCO','الحساب غير مهيأ أو غير نشط','<div class="notice">راجع مدير النظام لربط الحساب بالمؤسسة.</div>')
 const r=route().split('?')[0]
 try{
  if(r==='reports'){
   const report=selectedReport()
   if(report==='treasury'){location.hash='#/treasury';return}
   if(report==='sales')return renderSales()
   if(report==='expenses')return renderExpenses()
   if(report==='expense-matrix')return renderExpenseMatrix()
   if(report==='receivables')return renderReceivables()
   if(report==='reps')return renderReps()
   if(report==='inventory')return renderInventory()
   if(report==='products')return renderProducts()
   if(report==='monthly')return renderMonthly()
   if(report==='banks')return renderBanks()
   return renderExecutive()
  }
  if(r==='treasury')return renderTreasury()
  if(r==='dashboard'||!r)return renderDashboard()

  const reportMap={
   sales:'sales',
   expenses:'expenses',
   'expense-matrix':'expense-matrix',
   receivables:'receivables',
   reps:'reps',
   inventory:'inventory',
   products:'products',
   monthly:'monthly',
   banks:'banks',
   executive:'executive'
  }
  if(reportMap[r]){
   location.hash='#/reports?report='+encodeURIComponent(reportMap[r])
   return
  }
  if(r==='accounting-inputs'){
   location.hash='#/treasury'
   return
  }

  location.hash='#/dashboard'
 }catch(e){
  shell('حدث خطأ','',`<div class="error">${escapeHtml(e.message||e)}</div>`)
 }
}

async function render(options={}){
 clearPageCache()
 await renderFresh()
 currentRenderedKey=pageCacheKey()
}

function renderLogin(){
 app.innerHTML=`<main class="login"><section class="login-card"><h1>AMMCO</h1><div class="muted">Management Intelligence</div><div id="login-msg"></div><form id="login-form"><div class="field"><label>البريد الإلكتروني</label><input name="email" type="email" required></div><div class="field"><label>كلمة المرور</label><input name="password" type="password" required></div><button class="btn">دخول</button></form></section></main>`
 document.getElementById('login-form').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const {error}=await supabase.auth.signInWithPassword({email:String(fd.get('email')),password:String(fd.get('password'))});document.getElementById('login-msg').innerHTML=error?`<div class="error">${error.message}</div>`:''})
}


function renderUnifiedFilterBar(f){
 return '<div class="unified-bar"><div class="unified-bar-row">'+
 '<div class="global-filter-status"><span>الشهر المطبق على كل الصفحات</span><b>'+monthLabel(selectedMonth)+'</b></div>'+
 '<form id="exec-filter-form" style="display:flex;align-items:end;gap:8px;flex-wrap:wrap;margin-right:auto">'+
 '<div class="field"><label>الفرع</label><select name="branch">'+branchOptions(f.branch)+'</select></div>'+
 '<label class="compare-toggle"><input type="checkbox" name="compare" '+(f.compare?'checked':'')+'><span>مقارنة بالفترة السابقة</span></label>'+
 '<button class="btn" type="submit">تطبيق الفرع</button><button class="btn secondary" type="button" onclick="resetExecFilters()">كل الفروع</button></form>'+
 '<button class="btn secondary" type="button" onclick="exportFirstSmartTable()">تصدير Excel</button></div></div>'
}
window.bindExecFilters=()=>{
 const form=document.getElementById('exec-filter-form');if(!form)return
 form.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(form),p=new URLSearchParams();if(fd.get('branch'))p.set('branch',fd.get('branch'));if(fd.get('compare'))p.set('compare','1');location.hash='#/'+route().split('?')[0]+'?'+p.toString()})
}
window.applyExecPreset=type=>{
 const now=new Date();let f,t
 if(type==='this_month'){const y=now.getFullYear(),m=String(now.getMonth()+1).padStart(2,'0');f=y+'-'+m+'-01';t=new Date(y,now.getMonth()+1,0).toISOString().slice(0,10)}
 else if(type==='prev_month'){const d=new Date(now.getFullYear(),now.getMonth()-1,1),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0');f=y+'-'+m+'-01';t=new Date(y,d.getMonth()+1,0).toISOString().slice(0,10)}
 else if(type==='ytd'){const y=now.getFullYear();f=y+'-01-01';t=now.toISOString().slice(0,10)}
 else {const d=new Date(now.getTime()-6*86400000);f=d.toISOString().slice(0,10);t=now.toISOString().slice(0,10)}
 const p=qs();p.set('from',f);p.set('to',t);location.hash='#/'+route().split('?')[0]+'?'+p.toString()
}
window.resetExecFilters=()=>{location.hash='#/'+route().split('?')[0]}
window.exportFirstSmartTable=()=>{const btn=document.querySelector('.table-card .table-tools button[data-export]')||document.querySelector('.table-card .tool-btn');if(btn&&window.exportCurrentTableXlsx)return window.exportCurrentTableXlsx(btn);const old=document.querySelector('.table-card .tool-btn');if(old&&window.exportVisibleTableXlsx)return window.exportVisibleTableXlsx(old)}


function normalizeExecCategory(raw){
 const s=String(raw||'').toLowerCase()
 if(/مرتب|رواتب|أجور|salary|wage/.test(s))return 'مرتبات'
 if(/سولار|وقود|بترو|نقل|شحن|fuel|transport|سيار/.test(s))return 'نقل'
 if(/صيان|قطع غيار|repair|maintenance/.test(s))return 'صيانة'
 if(/إيجار|ايجار|rent/.test(s))return 'إيجارات'
 if(/كهرباء|مياه|غاز|نظافة|تشغيل/.test(s))return 'تشغيل'
 if(/إدار|انترنت|هاتف|admin/.test(s))return 'إدارية'
 return 'أخرى'
}
function isDoubleProductVerified(product){return Number(product?.wholesale_carton_price||0)===570}
async function loadExecutiveIntelligence(f){
 const ids=await approvedIds()
 const approvedFilter=ids.length?ids:['00000000-0000-0000-0000-000000000000']
 const [kpis,inv,wh,exp,pr,br]=await Promise.all([
  fetchAllRows(
   'v_branch_daily_kpis',
   '*',
   q=>{
    q=q.gte('business_date',f.from).lte('business_date',f.to).order('business_date').order('branch_id')
    if(f.branch)q=q.eq('branch_id',f.branch)
    return q
   },
   'تحميل مؤشرات لوحة الإدارة'
  ),
  fetchAllRows(
   'inventory_daily',
   'id,branch_id,business_date,product_id,product_name,sales_qty,closing_qty,closing_value,batch_id',
   q=>{
    q=q.in('batch_id',approvedFilter).gte('business_date',f.from).lte('business_date',f.to).order('business_date').order('id')
    if(f.branch)q=q.eq('branch_id',f.branch)
    return q
   },
   'تحميل تفاصيل المخزون المعتمدة'
  ),
  fetchAllRows(
   'warehouse_daily_summary',
   'id,branch_id,business_date,sales_qty,closing_qty,closing_value,raw_payload,batch_id',
   q=>{
    q=q.in('batch_id',approvedFilter).gte('business_date',f.from).lte('business_date',f.to).order('business_date').order('id')
    if(f.branch)q=q.eq('branch_id',f.branch)
    return q
   },
   'تحميل ملخص المخزون المعتمد'
  ),
  fetchAllRows(
   'v_expense_analysis',
   'id,branch_id,entry_date,canonical_category,expense_group,amount',
   q=>{
    q=q.gte('entry_date',f.from).lte('entry_date',f.to).order('entry_date').order('id')
    if(f.branch)q=q.eq('branch_id',f.branch)
    return q
   },
   'تحميل المصروفات المعتمدة'
  ),
  supabase.from('products').select('id,name,wholesale_carton_price,box_count').eq('is_active',true),
  supabase.from('import_batches').select('created_at').eq('status','approved').order('created_at',{ascending:false}).limit(1)
 ])
 if(pr.error)throw pr.error
 if(br.error)throw br.error
 const products=pr.data||[],productMap=new Map(products.map(p=>[p.id,p]))
 const invalidKpi=kpis.find(r=>Math.abs((Number(r.gross_sales||0)-Number(r.discounts||0))-Number(r.net_sales||0))>0.05)
 if(invalidKpi)throw new Error('تم إيقاف التقرير: معادلة المبيعات غير متطابقة في '+invalidKpi.business_date)
 const kpiExpenseTotal=kpis.reduce((sum,r)=>sum+Number(r.expenses||0),0)
 const expenseViewTotal=exp.reduce((sum,r)=>sum+Number(r.amount||0),0)
 if(Math.abs(kpiExpenseTotal-expenseViewTotal)>0.05){
  throw new Error('تم إيقاف التقرير: إجمالي المصروفات غير متطابق بين المصدرين المعتمدين')
 }
 const branchAgg=new Map()
 branches.forEach(b=>{if(!f.branch||b.id===f.branch)branchAgg.set(b.id,{id:b.id,name:b.name,code:b.code,sales:0,qty:0,equivQty:0,expenses:0,collections:0,discounts:0,hasData:false})})
 const timeline=new Map(),latestWh=new Map()
 let netSales=0,grossSales=0,discounts=0,collections=0,totalExpenses=0
 kpis.forEach(r=>{
  const s=Number(r.net_sales||0),g=Number(r.gross_sales||0),d=Number(r.discounts||0),col=Number(r.collections||0)
  netSales+=s;grossSales+=g;discounts+=d;collections+=col
  const b=branchAgg.get(r.branch_id);if(b){b.sales+=s;b.collections+=col;b.discounts+=d;b.hasData=true}
  const day=timeline.get(r.business_date)||{date:r.business_date,sales:0,expenses:0,qty:0,equivQty:0};day.sales+=s;timeline.set(r.business_date,day)
 })
 wh.forEach(r=>{
  const b=branchAgg.get(r.branch_id);if(b){b.qty+=Number(r.sales_qty||0);b.hasData=true}
  const prev=latestWh.get(r.branch_id);if(!prev||String(r.business_date)>=String(prev.business_date))latestWh.set(r.branch_id,r)
  const day=timeline.get(r.business_date)||{date:r.business_date,sales:0,expenses:0,qty:0,equivQty:0};day.qty+=Number(r.sales_qty||0);timeline.set(r.business_date,day)
 })
 const detailedEquiv=new Map()
 inv.forEach(r=>{
  const p=productMap.get(r.product_id),factor=isDoubleProductVerified(p)?2:1,q=Number(r.sales_qty||0)
  detailedEquiv.set(r.branch_id,(detailedEquiv.get(r.branch_id)||0)+q*factor)
  const day=timeline.get(r.business_date)||{date:r.business_date,sales:0,expenses:0,qty:0,equivQty:0};day.equivQty+=q*factor;timeline.set(r.business_date,day)
 })
 const repRowsByBatch=new Map()
 repDaily.forEach(r=>{
  if(!repRowsByBatch.has(r.batch_id))repRowsByBatch.set(r.batch_id,[])
  repRowsByBatch.get(r.batch_id).push(r)
 })
 const qtyByBranch=new Map()
 approvedBatches.forEach(batch=>{
  const current=qtyByBranch.get(batch.branch_id)||{raw:0,equiv:0}
  const fullPeriod=f.from<=batch.period_start&&f.to>=batch.period_end
  const summary=batch.metadata?.total_sales_summary
  if(fullPeriod&&summary&&Number.isFinite(Number(summary.equivalentSalesQty))){
   current.raw+=Number(summary.totalSalesQty||0)
   current.equiv+=Number(summary.equivalentSalesQty||0)
  }else{
   const rows=repRowsByBatch.get(batch.id)||[]
   let raw=0,equiv=0,hasRepQty=false
   rows.forEach(r=>{
    const p=r.raw_payload||{}
    if(p.sales_qty!==undefined||p.equivalent_sales_qty!==undefined)hasRepQty=true
    raw+=Number(p.sales_qty||0)
    equiv+=Number(p.equivalent_sales_qty||0)
   })
   if(hasRepQty){current.raw+=raw;current.equiv+=equiv}
  }
  qtyByBranch.set(batch.branch_id,current)
 })
 branchAgg.forEach((b,id)=>{
  const verified=qtyByBranch.get(id)
  if(verified&&verified.equiv){
   b.qty=verified.raw
   b.equivQty=verified.equiv
  }else{
   b.equivQty=Number(detailedEquiv.get(id)||0)
  }
 })
 exp.forEach(r=>{
  const amt=Number(r.amount||0);totalExpenses+=amt
  const b=branchAgg.get(r.branch_id);if(b){b.expenses+=amt;b.hasData=true}
  const day=timeline.get(r.entry_date)||{date:r.entry_date,sales:0,expenses:0,qty:0,equivQty:0};day.expenses+=amt;timeline.set(r.entry_date,day)
 })
 const branchList=[...branchAgg.values()].map(b=>({...b,sharePct:netSales?b.sales/netSales:0,avgPrice:b.equivQty?b.sales/b.equivQty:0,expenseRatio:b.sales?b.expenses/b.sales:0})).sort((a,b)=>b.sales-a.sales)
 const equivSalesQty=branchList.reduce((a,b)=>a+b.equivQty,0),rawSalesQty=branchList.reduce((a,b)=>a+b.qty,0)
 const avgCartonPrice=equivSalesQty?netSales/equivSalesQty:0,expenseRatio=netSales?totalExpenses/netSales:0
 const expensesByCategory={};exp.forEach(r=>{const k=normalizeExecCategory((r.canonical_category||'')+' '+(r.expense_group||''));expensesByCategory[k]=(expensesByCategory[k]||0)+Number(r.amount||0)})
 let prevNetSales=0,prevTotalExpenses=0,prevEquivQty=0,prevAvgPrice=0,prevExpenseRatio=0
 if(f.compare){
  const s=new Date(f.from),e=new Date(f.to),days=Math.round((e-s)/86400000)+1,pe=new Date(s.getTime()-86400000),ps=new Date(pe.getTime()-(days-1)*86400000),pf=ps.toISOString().slice(0,10),pt=pe.toISOString().slice(0,10)
  const [prevKpis,prevExpenses]=await Promise.all([
   fetchAllRows(
    'v_branch_daily_kpis',
    'branch_id,business_date,net_sales',
    q=>{
     q=q.gte('business_date',pf).lte('business_date',pt).order('business_date').order('branch_id')
     if(f.branch)q=q.eq('branch_id',f.branch)
     return q
    },
    'تحميل مؤشرات فترة المقارنة'
   ),
   fetchAllRows(
    'v_expense_analysis',
    'id,branch_id,entry_date,amount',
    q=>{
     q=q.gte('entry_date',pf).lte('entry_date',pt).order('entry_date').order('id')
     if(f.branch)q=q.eq('branch_id',f.branch)
     return q
    },
    'تحميل مصروفات فترة المقارنة'
   )
  ])
  prevNetSales=prevKpis.reduce((a,r)=>a+Number(r.net_sales||0),0)
  prevTotalExpenses=prevExpenses.reduce((a,r)=>a+Number(r.amount||0),0)
  prevExpenseRatio=prevNetSales?prevTotalExpenses/prevNetSales:0
 }
 const points=[...timeline.values()].sort((a,b)=>a.date.localeCompare(b.date));points.forEach(p=>{p.avgPrice=p.equivQty?p.sales/p.equivQty:0})
 return {kpis:{netSales,prevNetSales,equivSalesQty,prevEquivQty,avgCartonPrice,prevAvgPrice,totalExpenses,prevTotalExpenses,netResult:netSales-totalExpenses,prevNetResult:prevNetSales-prevTotalExpenses,expenseRatio,prevExpenseRatio,reportingBranches:branchList.filter(b=>b.hasData).length,totalBranchesCount:branchAgg.size,lastUpdate:br.data?.[0]?.created_at?new Date(br.data[0].created_at).toLocaleString('ar-EG'):'—'},timelinePoints:points,branchList,expensesByCategory,discounts,grossSales,collections,rawExpenses:exp,rawInventory:inv,products,productMap,rawSalesQty}
}

async function approvedIds(){
 const rows=await fetchAllRows(
  'import_batches',
  'id',
  q=>q.eq('status','approved').order('id'),
  'تحميل الدفعات المعتمدة'
 )
 return rows.map(x=>x.id)
}

async function approvedIdsForPeriod(from,to,branch=''){
 const rows=await fetchAllRows(
  'import_batches',
  'id,branch_id,period_start,period_end',
  q=>{
   q=q.eq('status','approved').lte('period_start',to).gte('period_end',from).order('period_start').order('id')
   if(branch)q=q.eq('branch_id',branch)
   return q
  },
  'تحميل دفعات الخزينة المعتمدة'
 )
 return rows.map(x=>x.id)
}
function currentFilters(){const p=qs(),r=globalMonthRange();return {branch:p.get('branch')||'',from:r.from,to:r.to,compare:p.get('compare')==='1'}}

async function loadDaily(branch,from,to){
 return fetchAllRows(
  'v_branch_daily_kpis',
  '*',
  q=>{
   q=q.gte('business_date',from).lte('business_date',to).order('business_date').order('branch_id')
   if(branch)q=q.eq('branch_id',branch)
   return q
  },
  'تحميل مؤشرات الفروع المعتمدة'
 )
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

// -------------------------------------------------------------------
// 8 CORE KPI CARDS COMPONENT
// -------------------------------------------------------------------
function renderKPICard(title, cur, prev, format = 'currency', invert = false, subInfo = '') {
  let valStr = ''
  if (format === 'currency') valStr = `${money(cur)} ج.م`
  else if (format === 'percent') valStr = pct(cur)
  else if (format === 'qty') valStr = `${qty(cur)} كرتونة`
  else valStr = String(cur)

  let deltaHtml = ''
  if (prev !== undefined && prev !== null && prev > 0) {
    const delta = ((cur - prev) / prev) * 100
    const isUp = delta > 0.05
    const isDown = delta < -0.05
    let sentiment = 'neutral'
    if (isUp) sentiment = invert ? 'negative' : 'positive'
    if (isDown) sentiment = invert ? 'positive' : 'negative'

    const sign = delta > 0 ? '+' : ''
    const arrow = delta > 0 ? '▲' : (delta < 0 ? '▼' : '—')
    deltaHtml = `<span class="delta-badge ${sentiment}">${arrow} ${sign}${delta.toFixed(1)}%</span>`
  } else {
    deltaHtml = `<span class="delta-badge neutral">—</span>`
  }

  return `
    <div class="kpi-card-rich">
      <div class="kpi-head">
        <span class="kpi-title">${title}</span>
        ${deltaHtml}
      </div>
      <div class="kpi-val">${valStr}</div>
      <div class="kpi-sub">
        <span>${subInfo || (prev ? `السابق: ${format === 'currency' ? money(prev) : qty(prev)}` : 'فترة حالية')}</span>
      </div>
    </div>
  `
}

function render8KPIGrid(kpis, compare) {
  return `
    <div class="kpis-8-grid">
      ${renderKPICard('إجمالي المبيعات (صافي)', kpis.netSales, compare ? kpis.prevNetSales : null, 'currency', false, 'صافي الإيرادات بعد الخصم')}
      ${renderKPICard('كمية المبيعات (المكافئة)', kpis.equivSalesQty, compare ? kpis.prevEquivQty : null, 'qty', false, 'مع احتساب دبل × 2')}
      ${renderKPICard('متوسط سعر الكرتونة', kpis.avgCartonPrice, compare ? kpis.prevAvgPrice : null, 'currency', false, 'المبيعات ÷ الكمية المكافئة')}
      ${renderKPICard('إجمالي المصروفات', kpis.totalExpenses, compare ? kpis.prevTotalExpenses : null, 'currency', true, 'المنصرف الفعلي من الخزائن')}
      ${renderKPICard('صافي النتيجة (المبيعات - المصروفات)', kpis.netResult, compare ? kpis.prevNetResult : null, 'currency', false, 'الأرباح التشغيلية المحققة')}
      ${renderKPICard('نسبة المصروفات للمبيعات', kpis.expenseRatio, compare ? kpis.prevExpenseRatio : null, 'percent', true, 'الحد المعياري المستهدف < 15%')}
      ${renderKPICard('الفروع الملتزمة بالرفع', `${kpis.reportingBranches} / ${kpis.totalBranchesCount}`, null, 'text', false, `نسبة الالتزام ${pct(kpis.totalBranchesCount ? kpis.reportingBranches / kpis.totalBranchesCount : 0)}`)}
      ${renderKPICard('آخر تحديث للبيانات', kpis.lastUpdate, null, 'text', false, 'حالة البيانات: معتمدة ومطابقة')}
    </div>
  `
}

// -------------------------------------------------------------------
// INTERACTIVE SVG TIMELINE CHART
// -------------------------------------------------------------------
let chartActiveSeries = { sales: true, expenses: true, qty: false, price: false }
let chartViewMode = 'day'

window.toggleChartSeries = series => {
  chartActiveSeries[series] = !chartActiveSeries[series]
  window.drawTimelineSVG()
}

window.setChartMode = mode => {
  chartViewMode = mode
  document.querySelectorAll('.chart-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode))
  window.drawTimelineSVG()
}

function renderTimelineChartSection() {
  return `
    <div class="chart-card">
      <div class="chart-controls">
        <div style="font-size:12px; font-weight:800; color:#17324d;">المبيعات والمصروفات عبر الزمن</div>

        <div class="chart-series-toggles">
          <label class="series-checkbox">
            <input type="checkbox" ${chartActiveSeries.sales ? 'checked' : ''} onchange="window.toggleChartSeries('sales')">
            <span class="series-dot sales"></span>
            <span>المبيعات</span>
          </label>

          <label class="series-checkbox">
            <input type="checkbox" ${chartActiveSeries.expenses ? 'checked' : ''} onchange="window.toggleChartSeries('expenses')">
            <span class="series-dot expenses"></span>
            <span>المصروفات</span>
          </label>

          <label class="series-checkbox">
            <input type="checkbox" ${chartActiveSeries.qty ? 'checked' : ''} onchange="window.toggleChartSeries('qty')">
            <span class="series-dot qty"></span>
            <span>الكمية المكافئة</span>
          </label>

          <label class="series-checkbox">
            <input type="checkbox" ${chartActiveSeries.price ? 'checked' : ''} onchange="window.toggleChartSeries('price')">
            <span class="series-dot price"></span>
            <span>متوسط السعر</span>
          </label>
        </div>

        <div class="chart-modes">
          <button class="chart-mode-btn ${chartViewMode === 'day' ? 'active' : ''}" data-mode="day" onclick="window.setChartMode('day')">يومي</button>
          <button class="chart-mode-btn ${chartViewMode === 'week' ? 'active' : ''}" data-mode="week" onclick="window.setChartMode('week')">أسبوعي</button>
          <button class="chart-mode-btn ${chartViewMode === 'month' ? 'active' : ''}" data-mode="month" onclick="window.setChartMode('month')">شهري</button>
        </div>
      </div>

      <div class="svg-chart-container" id="chart-container">
        <svg class="svg-chart" id="timeline-svg" preserveAspectRatio="none" viewBox="0 0 800 240"></svg>
        <div class="chart-tooltip" id="chart-tooltip"></div>
      </div>
    </div>
  `
}

window.cachedPoints = []
window.drawTimelineSVG = () => {
  const svg = document.getElementById('timeline-svg')
  const tooltip = document.getElementById('chart-tooltip')
  if (!svg || !window.cachedPoints || !window.cachedPoints.length) return

  // Grouping by mode
  let raw = window.cachedPoints
  if (chartViewMode === 'week') {
    const weeks = new Map()
    raw.forEach(p => {
      const d = new Date(p.date)
      const w = `${d.getFullYear()}-W${Math.ceil((d.getDate() + 6) / 7)}`
      if (!weeks.has(w)) weeks.set(w, { date: w, sales: 0, expenses: 0, equivQty: 0 })
      const itm = weeks.get(w)
      itm.sales += p.sales; itm.expenses += p.expenses; itm.equivQty += p.equivQty
    })
    raw = [...weeks.values()]
  } else if (chartViewMode === 'month') {
    const months = new Map()
    raw.forEach(p => {
      const m = p.date.substring(0, 7)
      if (!months.has(m)) months.set(m, { date: m, sales: 0, expenses: 0, equivQty: 0 })
      const itm = months.get(m)
      itm.sales += p.sales; itm.expenses += p.expenses; itm.equivQty += p.equivQty
    })
    raw = [...months.values()]
  }

  const W = 800, H = 240, padX = 40, padY = 30
  const plotW = W - (padX * 2), plotH = H - (padY * 2)

  let maxVal = 1000
  raw.forEach(p => {
    if (chartActiveSeries.sales && p.sales > maxVal) maxVal = p.sales
    if (chartActiveSeries.expenses && p.expenses > maxVal) maxVal = p.expenses
  })

  const getX = i => padX + (i / Math.max(1, raw.length - 1)) * plotW
  const getY = val => H - padY - (val / maxVal) * plotH

  // Build grid lines
  let gridLines = ''
  for (let i = 0; i <= 4; i++) {
    const yVal = (maxVal / 4) * i
    const yPos = getY(yVal)
    gridLines += `
      <line x1="${padX}" y1="${yPos}" x2="${W - padX}" y2="${yPos}" stroke="#f1f5f9" stroke-width="1" />
      <text x="${W - padX + 5}" y="${yPos + 4}" fill="#94a3b8" font-size="9" text-anchor="start">${money(yVal)}</text>
    `
  }

  // Polylines
  const makeLine = (key, color) => {
    const pts = raw.map((p, i) => `${getX(i)},${getY(p[key] || 0)}`).join(' ')
    return `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${pts}" />`
  }

  let linesHtml = ''
  if (chartActiveSeries.sales) linesHtml += makeLine('sales', '#2563eb')
  if (chartActiveSeries.expenses) linesHtml += makeLine('expenses', '#e11d48')

  // Interactive points
  let pointsHtml = ''
  raw.forEach((p, i) => {
    const x = getX(i)
    if (chartActiveSeries.sales) {
      const y = getY(p.sales || 0)
      pointsHtml += `<circle cx="${x}" cy="${y}" r="3.5" fill="#2563eb" stroke="#fff" stroke-width="1.5" class="chart-pt" data-idx="${i}" />`
    }
    if (chartActiveSeries.expenses) {
      const y = getY(p.expenses || 0)
      pointsHtml += `<circle cx="${x}" cy="${y}" r="3.5" fill="#e11d48" stroke="#fff" stroke-width="1.5" class="chart-pt" data-idx="${i}" />`
    }
  })

  svg.innerHTML = gridLines + linesHtml + pointsHtml

  // Attach hover events
  svg.querySelectorAll('.chart-pt').forEach(pt => {
    pt.addEventListener('mouseenter', e => {
      const idx = Number(e.target.dataset.idx)
      const item = raw[idx]
      const rect = svg.getBoundingClientRect()
      const ptRect = e.target.getBoundingClientRect()
      tooltip.style.display = 'block'
      tooltip.style.left = `${ptRect.left - rect.left - 50}px`
      tooltip.style.top = `${ptRect.top - rect.top - 50}px`
      tooltip.innerHTML = `
        <div style="font-weight:bold; color:#cbd5e1; margin-bottom:2px;">${item.date}</div>
        <div>المبيعات: <b style="color:#60a5fa;">${money(item.sales)} ج.م</b></div>
        <div>المصروفات: <b style="color:#f87171;">${money(item.expenses)} ج.م</b></div>
      `
    })
    pt.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none'
    })
  })
}

// -------------------------------------------------------------------
// BRANCH HORIZONTAL BARS COMPARISON
// -------------------------------------------------------------------
function renderBranchBarsSection(branches) {
  const maxSales = Math.max(1, ...branches.map(b => b.sales))

  const rowsHtml = branches.map((b, idx) => {
    const w = (b.sales / maxSales) * 100
    return `
      <div class="branch-bar-row" onclick="window.drillDownBranch('${b.id}')" title="انقر لتصفية باقي الصفحة على ${escapeAttr(b.name)}">
        <div class="branch-info">
          <span class="branch-rank">${idx + 1}</span>
          <b style="font-size:11px; color:#17324d;">${escapeHtml(b.name)}</b>
        </div>

        <div class="branch-bar-track">
          <div class="branch-bar-fill" style="width:${w}%;"></div>
        </div>

        <div style="text-align:right;">
          <b style="font-size:11px;">${money(b.sales)} ج.م</b>
          <div style="font-size:9px; color:#64748b;">حصة: ${pct(b.sharePct)}</div>
        </div>

        <div style="text-align:right;">
          <span style="font-size:10.5px; font-weight:700;">${qty(b.equivQty)}</span>
          <div style="font-size:9px; color:#64748b;">كرتونة مكافئة</div>
        </div>

        <div style="text-align:right;">
          <span style="font-size:10.5px; font-weight:700; color:${b.expenseRatio > 0.18 ? '#b91c1c' : '#15803d'};">${pct(b.expenseRatio)}</span>
          <div style="font-size:9px; color:#64748b;">مصروف/مبيعات</div>
        </div>
      </div>
    `
  }).join('')

  return `
    <div class="branch-bars-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div>
          <b style="font-size:12px; color:#17324d;">مقارنة أداء الفروع (Drill-down تفاعلي)</b>
          <small style="color:#64748b; margin-right:8px;">اضغط على أي فرع لتصفية التحليلات فوراً</small>
        </div>
        <span class="chip" style="font-size:9.5px;">${branches.length} فرع</span>
      </div>

      <div style="display:grid; grid-template-columns:140px 1fr 140px 120px 80px; gap:12px; font-size:9.5px; font-weight:800; color:#64748b; padding:0 8px 6px; border-bottom:1px solid #e2e8f0;">
        <span>الفرع</span>
        <span>المبيعات والحصة السوقية</span>
        <span style="text-align:right;">قيمة المبيعات</span>
        <span style="text-align:right;">الكمية المكافئة</span>
        <span style="text-align:right;">نسبة المصروفات</span>
      </div>

      <div style="display:flex; flex-direction:column; gap:2px; margin-top:4px;">
        ${rowsHtml}
      </div>
    </div>
  `
}

window.drillDownBranch = branchId => {
  const p = new URLSearchParams(location.hash.includes('?') ? location.hash.split('?')[1] : '')
  p.set('branch', branchId)
  location.hash = `#/${route()}?${p.toString()}`
}

// -------------------------------------------------------------------
// SMART INSIGHTS / ANOMALIES COMPONENT
// -------------------------------------------------------------------
function renderSmartAnomalies(data) {
  const anomalies = []

  // Check 1: Expense spike > 20%
  if (data.kpis.expenseRatio > 0.18) {
    anomalies.push({
      type: 'critical',
      title: 'ارتفاع حاد في نسبة المصروفات الإجمالية',
      desc: `سجلت نسبة المصروفات ${pct(data.kpis.expenseRatio)} متجاوزة الحد الآمن (15%) بمقدار ${money(data.kpis.totalExpenses)} ج.م.`
    })
  }

  // Check 2: Branches with 0 sales but active expenses
  data.branchList.forEach(b => {
    if (b.sales === 0 && b.expenses > 0) {
      anomalies.push({
        type: 'warning',
        title: `فرع ${b.name}: تسجيل مصروفات بدون مبيعات`,
        desc: `تم رصد مصروفات بقيمة ${money(b.expenses)} ج.م بدون وجود أي مبيعات مسجلة في هذه الفترة.`
      })
    }
  })

  // Check 3: Branches not reporting
  const nonReporting = data.branchList.filter(b => !b.hasData)
  if (nonReporting.length > 0) {
    anomalies.push({
      type: 'info',
      title: `${nonReporting.length} فروع لم تقم بتسليم بياناتها للفترة المحددة`,
      desc: `الفروع: ${nonReporting.map(b => b.name).join('، ')}.`
    })
  }

  if (!anomalies.length) {
    anomalies.push({
      type: 'info',
      title: 'مؤشرات الأداء مستقرة تماماً',
      desc: 'لم يتم رصد أي انحرافات سعرية أو قفزات غير مبررة في المصروفات ضمن الفترة المحددة.'
    })
  }

  const itemsHtml = anomalies.map(a => `
    <div class="anomaly-item ${a.type}">
      <div>
        <div style="font-weight:800; font-size:11px;">${a.title}</div>
        <div style="font-size:9.5px; opacity:0.9;">${a.desc}</div>
      </div>
      <span class="chip" style="font-size:9px; background:rgba(255,255,255,0.7);">${a.type === 'critical' ? 'تنبيه حرج' : (a.type === 'warning' ? 'تحذير' : 'ملاحظة')}</span>
    </div>
  `).join('')

  return `
    <div class="anomalies-card">
      <div style="font-size:12px; font-weight:800; color:#17324d; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#d97706" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        <span>التحليلات الذكية والانحرافات المرصودة</span>
      </div>
      ${itemsHtml}
    </div>
  `
}

// -------------------------------------------------------------------
// EXCEL-LIKE SMART DATA TABLE (Sticky Header/Col, Search, Group, Export)
// -------------------------------------------------------------------
function renderSmartTable(title, cols, rows, totalRow = '', groupByOptions = []) {
  const headers = cols.map((col, idx) => `
    <th class="${idx === 0 ? 'sticky-col' : ''}">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
        <span>${col.label}</span>
      </div>
    </th>
  `).join('')

  const rowsHtml = rows.map(r => `
    <tr>
      ${cols.map((col, idx) => `
        <td class="${col.num ? 'num' : ''} ${idx === 0 ? 'sticky-col' : ''}">
          ${r[col.key] ?? '—'}
        </td>
      `).join('')}
    </tr>
  `).join('')

  return `
    <div class="table-card" data-report-title="${escapeAttr(title)}">
      <div class="table-head">
        <div>
          <h2>${title}</h2>
          <small>${rows.length} سجلات معتمدة ومطابقة</small>
        </div>
        <div class="table-tools">
          <input class="search" placeholder="بحث فوري في الجدول…" oninput="window.applyTableSearch(this)">
          <button class="tool-btn" type="button" onclick="window.exportCurrentTableXlsx(this)">تحميل Excel</button>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>${headers}</tr>
          </thead>
          <tbody>
            ${rowsHtml}
            ${totalRow}
          </tbody>
        </table>
      </div>
    </div>
  `
}

window.applyTableSearch = input => {
  const q = input.value.trim().toLowerCase()
  const table = input.closest('.table-card').querySelector('tbody')
  table.querySelectorAll('tr:not(.total)').forEach(tr => {
    tr.style.display = !q || tr.innerText.toLowerCase().includes(q) ? '' : 'none'
  })
}

window.exportCurrentTableXlsx = btn => {
  const card = btn.closest('.table-card')
  const table = card.querySelector('table')
  const visibleRows = [...table.querySelectorAll('tr')].filter(r => r.style.display !== 'none')
  const matrix = visibleRows.map(r => [...r.children].map(c => c.innerText.trim()))
  const ws = XLSX.utils.aoa_to_sheet(matrix)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Report')
  const title = (card.dataset.reportTitle || 'AMMCO-Export').replace(/[\\/:*?"<>|]/g, '-')
  XLSX.writeFile(wb, `${title}.xlsx`, { compression: true })
}

window.exportCurrentReportExcel = () => {
  const tableCard = document.querySelector('.table-card')
  if (tableCard) {
    const btn = tableCard.querySelector('.table-tools button')
    if (btn) return window.exportCurrentTableXlsx(btn)
  }
  alert('جاري تنزيل تقرير المنصة…')
}



async function renderDashboard(){
 const f=currentFilters(),data=await loadExecutiveIntelligence(f);window.cachedPoints=data.timelinePoints
 const cols=[{key:'name',label:'الفرع'},{key:'sales',label:'صافي المبيعات',num:true},{key:'qty',label:'الكرتونة الفعلية',num:true},{key:'equivQty',label:'الكمية المكافئة (دبل×2)',num:true},{key:'avgPrice',label:'متوسط سعر الكرتونة',num:true},{key:'expenses',label:'إجمالي المصروفات',num:true},{key:'collections',label:'التحصيلات',num:true},{key:'expenseRatio',label:'نسبة المصروفات',num:true}]
 const rows=data.branchList.map(b=>({name:'<a href="javascript:drillDownBranch(\''+b.id+'\')" style="font-weight:800;color:#17324d">'+escapeHtml(b.name)+'</a>',sales:money(b.sales),qty:qty(b.qty),equivQty:qty(b.equivQty),avgPrice:money(b.avgPrice),expenses:money(b.expenses),collections:money(b.collections),expenseRatio:pct(b.expenseRatio)}))
 const t=data.branchList.reduce((a,b)=>{a.sales+=b.sales;a.qty+=b.qty;a.eq+=b.equivQty;a.exp+=b.expenses;a.coll+=b.collections;return a},{sales:0,qty:0,eq:0,exp:0,coll:0})
 const total='<tr class="total"><th class="sticky-col">الإجمالي</th><th class="num">'+money(t.sales)+'</th><th class="num">'+qty(t.qty)+'</th><th class="num">'+qty(t.eq)+'</th><th class="num">'+money(t.eq?t.sales/t.eq:0)+'</th><th class="num">'+money(t.exp)+'</th><th class="num">'+money(t.coll)+'</th><th>'+pct(t.sales?t.exp/t.sales:0)+'</th></tr>'
 const body=renderUnifiedFilterBar(f)+render8KPIGrid(data.kpis,f.compare)+renderTimelineChartSection()+'<div class="executive-analysis-grid">'+renderBranchBarsSection(data.branchList)+renderSmartAnomalies(data)+'</div>'+renderSmartTable('جدول ملخص أداء الفروع المعتمد',cols,rows,total)
 shell('لوحة الإدارة التنفيذية','One Number = One Source',body);bindExecFilters();setTimeout(drawTimelineSVG,50)
}
window.drillDownBranch=branchId=>{const p=qs();p.set('branch',branchId);location.hash='#/'+route().split('?')[0]+'?'+p.toString()}
async function renderAnalytics(){
 const f=currentFilters(),data=await loadExecutiveIntelligence(f);window.cachedPoints=data.timelinePoints
 shell('التحليلات المتقدمة','المقارنات التنفيذية والانحرافات',renderUnifiedFilterBar(f)+renderTimelineChartSection()+renderBranchBarsSection(data.branchList)+renderSmartAnomalies(data));bindExecFilters();setTimeout(drawTimelineSVG,50)
}
async function renderNextModule(title,path){
 shell(title,'وحدة إدارية موحدة داخل AMMCO',`
  <section class="embedded-next-card">
   <div id="embedded-next-status" class="notice">جاري تجهيز الوحدة وربط جلسة الدخول…</div>
   <div id="embedded-next-host"></div>
  </section>`)
 const status=document.getElementById('embedded-next-status')
 const host=document.getElementById('embedded-next-host')
 try{
  const {data:{session:active}}=await supabase.auth.getSession()
  if(!active)throw new Error('انتهت جلسة الدخول. سجل الدخول مرة أخرى.')
  const res=await fetch('/api/auth/sync',{
   method:'POST',
   headers:{Authorization:`Bearer ${active.access_token}`,'Content-Type':'application/json'},
   body:JSON.stringify({refreshToken:active.refresh_token})
  })
  const out=await res.json().catch(()=>({}))
  if(!res.ok)throw new Error(out.error||'تعذر مزامنة جلسة الدخول مع الوحدة الإدارية')
  if(status)status.remove()
  if(host)host.innerHTML=`<iframe class="embedded-next-frame" src="${path}" title="${escapeAttr(title)}" onload="prepareEmbeddedFrame(this)"></iframe>`
 }catch(err){
  if(status){status.className='error';status.textContent=String(err?.message||err)}
 }
}
window.prepareEmbeddedFrame=frame=>{
 try{
  const doc=frame.contentDocument
  if(!doc)return
  const style=doc.createElement('style')
  style.textContent=`
   .executive-sidebar,.executive-top-header{display:none!important}
   .executive-main-content{margin-right:0!important;padding-top:0!important;min-height:auto!important}
   .executive-app-shell{min-height:auto!important;background:#fff!important}
   .content-inner-wrapper{max-width:none!important;padding:12px!important}
   body{background:#fff!important}
  `
  doc.head.appendChild(style)
 }catch(err){console.warn('embedded module styling skipped',err)}
}

async function renderSettings(){
 shell('إعدادات النظام','تفضيلات الواجهة والمنصة','<section class="card settings-card"><h2>AMMCO Intelligence</h2><p>مصدر البيانات: AMMCO المعتمد فقط.</p><p>قاعدة الدبل: سعر الكرتونة 570 = ×2، غير ذلك ×1.</p><p>One Number = One Source مفعلة على التقارير.</p><button class="btn secondary" onclick="localStorage.clear();location.reload()">مسح إعدادات المتصفح</button></section>')
}

async function renderExecutive(){
 const cfg=currentFilters(),branch=cfg.branch,from=cfg.from,to=cfg.to
 const daily=await loadDaily(branch,from,to)
 const ids=await approvedIds()
 const approvedFilter=ids.length?ids:['00000000-0000-0000-0000-000000000000']
 const [warehouse,inventoryRows,prodRes,expenseRows]=await Promise.all([
  fetchAllRows(
   'warehouse_daily_summary',
   'id,branch_id,business_date,opening_qty,opening_value,incoming_factory_qty,incoming_factory_value,incoming_branches_qty,incoming_branches_value,sales_qty,sales_value,bonus_qty,bonus_value,gifts_qty,gifts_value,damages_qty,damages_value,return_factory_qty,return_factory_value,outgoing_branches_qty,outgoing_branches_value,adjustment_qty,adjustment_value,closing_qty,closing_value,raw_payload',
   q=>{
    q=q.in('batch_id',approvedFilter).gte('business_date',from).lte('business_date',to).order('business_date').order('id')
    if(branch)q=q.eq('branch_id',branch)
    return q
   },
   'تحميل مخزون التقرير التنفيذي'
  ),
  fetchAllRows(
   'inventory_daily',
   'id,branch_id,business_date,product_id,product_name,sales_qty,closing_qty,closing_value',
   q=>{
    q=q.in('batch_id',approvedFilter).gte('business_date',from).lte('business_date',to).order('business_date').order('id')
    if(branch)q=q.eq('branch_id',branch)
    return q
   },
   'تحميل تفاصيل أصناف التقرير التنفيذي'
  ),
  supabase.from('products').select('id,wholesale_carton_price').eq('is_active',true),
  fetchAllRows(
   'v_expense_analysis',
   'id,branch_id,entry_date,canonical_category,expense_group,amount',
   q=>{
    q=q.gte('entry_date',from).lte('entry_date',to).order('entry_date').order('id')
    if(branch)q=q.eq('branch_id',branch)
    return q
   },
   'تحميل مصروفات التقرير التنفيذي'
  )
 ])
 if(prodRes.error)throw prodRes.error
 const productRows=prodRes.data||[]

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
 const productById=new Map(productRows.map(p=>[p.id,p])),equivCartonsBy=new Map()
 inventoryRows.forEach(r=>{
  const factor=isDoubleProductVerified(productById.get(r.product_id))?2:1
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
  const verifiedEquiv=wh.raw_payload?.total_sales_source==='Total!BB'?Number(wh.raw_payload?.equivalent_cartons_month||0):0
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
 let q=supabase.from('cash_entries')
  .select('id,branch_id,entry_date,direction,description,amount,running_balance,category,source_code')
  .gte('entry_date',from).lte('entry_date',to)
  .order('entry_date',{ascending:false}).order('id',{ascending:false})
 if(branch)q=q.eq('branch_id',branch)
 const {data:entries,error}=await q
 if(error)throw error
 window.__treasurySheetData=entries||[]
 const branchMap=new Map(branches.map(b=>[b.id,b.name]))
 let totalIn=0,totalOut=0
 ;(entries||[]).forEach(e=>{if(e.direction==='in')totalIn+=Number(e.amount||0);else totalOut+=Number(e.amount||0)})
 const rows=(entries||[]).map(e=>{
  const incoming=e.direction==='in'?money(e.amount):''
  const outgoing=e.direction==='out'?money(e.amount):''
  const editAttr=profile?.role==='admin'?' ondblclick="editTreasurySheetRow('+e.id+')" title="انقر مرتين للتعديل"':''
  return '<tr'+editAttr+' data-entry-id="'+e.id+'" style="'+(profile?.role==='admin'?'cursor:pointer':'')+'">'+
   '<td class="row-label">'+escapeHtml(branchMap.get(e.branch_id)||'—')+'</td>'+
   '<td>'+escapeHtml(e.source_code||'')+'</td>'+
   '<td>'+escapeHtml(e.entry_date||'')+'</td>'+
   '<td>'+escapeHtml(e.description||'')+'</td>'+
   '<td>'+escapeHtml(e.category||'')+'</td>'+
   '<td class="num">'+incoming+'</td>'+
   '<td class="num">'+outgoing+'</td>'+
   '<td class="num">'+(e.running_balance===null||e.running_balance===undefined?'':money(e.running_balance))+'</td>'+
  '</tr>'
 }).join('')
 const totalRow='<tr class="total"><th>الإجمالي</th><th></th><th></th><th></th><th></th><th class="num">'+money(totalIn)+'</th><th class="num">'+money(totalOut)+'</th><th></th></tr>'
 const sheetTable='<section class="table-card treasury-source-card" data-report-title="الخزينة">'+
  '<div class="table-head"><div><h2>الخزينة — الأعمدة الفعلية من الشيت</h2><small>8 أعمدة فقط • '+(entries||[]).length+' حركة'+(profile?.role==='admin'?' • انقر مرتين على أي صف للتعديل':'')+'</small></div>'+
  '<div class="table-tools"><input class="search" placeholder="بحث…" oninput="applyTreasurySourceSearch(this)"><button class="tool-btn" type="button" onclick="exportVisibleTableXlsx(this)">Excel</button><button class="tool-btn" type="button" onclick="printReportOnly(this)">طباعة</button></div></div>'+
  '<div class="table-wrap"><table><thead><tr>'+
   '<th>الفرع</th><th>الكود</th><th>التاريخ</th><th>البيان</th><th>التصنيف</th><th>الوارد</th><th>الصادر</th><th>رصيد آخر</th>'+
  '</tr></thead><tbody>'+rows+totalRow+'</tbody></table></div></section>'
 const note=profile?.role==='admin'
  ? '<div class="notice">التعديل يتم على حقول الشيت الأصلية: الكود، التاريخ، البيان، التصنيف، الوارد، الصادر، ورصيد آخر. اسم الفرع ثابت لأنه مرتبط بملف الفرع والدفعة المعتمدة.</div>'
  : ''
 shell('الخزينة','عرض مباشر لحقول شيت الخزنة بدون أعمدة تحليلية إضافية',filters(from,to,branch)+scope(from,to,branch)+note+sheetTable)
 bindFilters('treasury')
}

window.applyTreasurySourceSearch=function(input){
 const q=(input.value||'').trim().toLowerCase()
 const card=input.closest('.table-card')
 card.querySelectorAll('tbody tr:not(.total)').forEach(row=>{row.style.display=!q||row.innerText.toLowerCase().includes(q)?'':'none'})
}

window.editTreasurySheetRow=function(id){
 if(profile?.role!=='admin')return
 const e=(window.__treasurySheetData||[]).find(x=>Number(x.id)===Number(id))
 if(!e)return
 document.getElementById('treasury-sheet-dialog')?.remove()
 const incoming=e.direction==='in'?Number(e.amount||0):0
 const outgoing=e.direction==='out'?Number(e.amount||0):0
 const html='<div class="dialog-backdrop" id="treasury-sheet-dialog"><div class="dialog-card">'+
  '<div class="dialog-head"><h3>تعديل حركة الخزينة #'+id+'</h3><button class="tool-btn" type="button" onclick="document.getElementById(\'treasury-sheet-dialog\').remove()">إغلاق</button></div>'+
  '<form id="treasury-sheet-form" class="dialog-form">'+
   '<div class="field"><label>الكود</label><input name="source_code" value="'+escapeAttr(e.source_code||'')+'"></div>'+
   '<div class="field"><label>التاريخ</label><input name="entry_date" type="date" value="'+escapeAttr(e.entry_date||'')+'" required></div>'+
   '<div class="field"><label>البيان</label><input name="description" value="'+escapeAttr(e.description||'')+'"></div>'+
   '<div class="field"><label>التصنيف</label><input name="category" value="'+escapeAttr(e.category||'')+'"></div>'+
   '<div class="field"><label>الوارد</label><input name="inbound" type="number" min="0" step="0.01" value="'+incoming+'"></div>'+
   '<div class="field"><label>الصادر</label><input name="outbound" type="number" min="0" step="0.01" value="'+outgoing+'"></div>'+
   '<div class="field"><label>رصيد آخر</label><input name="running_balance" type="number" step="0.01" value="'+(e.running_balance??'')+'"></div>'+
   '<div class="field"><label>سبب التعديل</label><textarea name="reason" rows="2" required placeholder="مثال: تصحيح مطابق لشيت الفرع"></textarea></div>'+
   '<button class="btn">حفظ التعديل</button><div id="treasury-sheet-msg"></div>'+
  '</form></div></div>'
 document.body.insertAdjacentHTML('beforeend',html)
 const form=document.getElementById('treasury-sheet-form')
 form.addEventListener('submit',async ev=>{
  ev.preventDefault()
  const msg=document.getElementById('treasury-sheet-msg')
  try{
   const {data:{session:active}}=await supabase.auth.getSession()
   if(!active)throw new Error('انتهت جلسة الدخول')
   const payload={
    id,
    source_code:form.source_code.value,
    entry_date:form.entry_date.value,
    description:form.description.value,
    category:form.category.value,
    inbound:Number(form.inbound.value||0),
    outbound:Number(form.outbound.value||0),
    running_balance:form.running_balance.value,
    reason:form.reason.value
   }
   msg.innerHTML='<div class="notice">جاري الحفظ…</div>'
   const res=await fetch(SUPABASE_URL+'/functions/v1/ammco-admin-cash',{
    method:'POST',
    headers:{Authorization:'Bearer '+active.access_token,apikey:SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify(payload)
   })
   const out=await res.json()
   if(!res.ok)throw new Error(out.error||'تعذر حفظ التعديل')
   document.getElementById('treasury-sheet-dialog')?.remove()
   clearPageCache()
   await renderTreasury()
  }catch(err){msg.innerHTML='<div class="error">'+escapeHtml(err.message||err)+'</div>'}
 })
}


async function renderSales(){const {branch,from,to}=currentFilters();const daily=await loadDaily(branch,from,to);const rows=daily.map(r=>({business_date:r.business_date,branch_name:r.branch_name,gross:money(r.gross_sales),discounts:money(r.discounts),net:money(r.net_sales),collections:money(r.collections),expenses:money(r.expenses)}));shell('تقرير المبيعات','تفاصيل المبيعات اليومية حسب الفرع',filters(from,to,branch)+scope(from,to,branch)+table('المبيعات اليومية',[{key:'business_date',label:'التاريخ'},{key:'branch_name',label:'الفرع'},{key:'gross',label:'قبل الخصم',num:1},{key:'discounts',label:'الخصم',num:1},{key:'net',label:'صافي البيع',num:1},{key:'collections',label:'التحصيل',num:1},{key:'expenses',label:'المصروفات',num:1}],rows));bindFilters('sales')}
async function renderExpensesCenter(){
 const {branch,from,to}=currentFilters()
 let expQ=supabase.from('v_expense_analysis')
  .select('branch_id,entry_date,canonical_category,expense_group,amount')
  .gte('entry_date',from).lte('entry_date',to)
 let salesQ=supabase.from('v_branch_daily_kpis')
  .select('branch_id,business_date,net_sales')
  .gte('business_date',from).lte('business_date',to)
 let setQ=supabase.from('branch_expense_accrual_settings')
  .select('branch_id,month_start,wages,branch_manager,sector_manager,rent,carried_expenses,commission_rate,working_days_basis')
  .lte('month_start',to).order('month_start',{ascending:false})
 if(branch){
  expQ=expQ.eq('branch_id',branch)
  salesQ=salesQ.eq('branch_id',branch)
  setQ=setQ.eq('branch_id',branch)
 }
 const [er,sr,tr]=await Promise.all([expQ,salesQ,setQ])
 if(er.error||sr.error||tr.error)throw er.error||sr.error||tr.error
 const expenses=er.data||[],sales=sr.data||[],settings=tr.data||[]
 const bset=branch?branches.filter(b=>b.id===branch):branches
 const branchMap=new Map(branches.map(b=>[b.id,b.name]))

 const salesBy=new Map(),daysBy=new Map()
 sales.forEach(r=>{
  salesBy.set(r.branch_id,(salesBy.get(r.branch_id)||0)+Number(r.net_sales||0))
  const s=daysBy.get(r.branch_id)||new Set();s.add(r.business_date);daysBy.set(r.branch_id,s)
 })
 const totalSales=[...salesBy.values()].reduce((a,b)=>a+b,0)
 const totalExpenses=expenses.reduce((a,r)=>a+Number(r.amount||0),0)
 const expenseRate=totalSales?totalExpenses/totalSales:0

 const categoryMap=new Map()
 expenses.forEach(r=>{
  const label=(r.canonical_category||r.expense_group||'غير مصنف').trim()||'غير مصنف'
  const x=categoryMap.get(label)||{label,total:0,branches:new Map()}
  const v=Number(r.amount||0)
  x.total+=v
  x.branches.set(r.branch_id,(x.branches.get(r.branch_id)||0)+v)
  categoryMap.set(label,x)
 })
 const detailRows=[...categoryMap.values()]
  .sort((a,b)=>b.total-a.total)
  .map(x=>{
   const row={label:escapeHtml(x.label)}
   bset.forEach(b=>row[b.id]=money(x.branches.get(b.id)||0))
   row.total=money(x.total)
   row.rate=pct(totalExpenses?x.total/totalExpenses:0)
   return row
  })
 const detailCols=[
  {key:'label',label:'بند المصروف'},
  ...bset.map(b=>({key:b.id,label:b.name,num:1})),
  {key:'total',label:'الإجمالي',num:1},
  {key:'rate',label:'% من المصروفات'}
 ]

 const latestSetting=new Map()
 settings.forEach(r=>{if(!latestSetting.has(r.branch_id))latestSetting.set(r.branch_id,r)})
 const expBy=new Map()
 expenses.forEach(r=>{
  const txt=((r.canonical_category||'')+' '+(r.expense_group||'')).toLowerCase()
  const x=expBy.get(r.branch_id)||{treasury:0,fuel:0,petro:0}
  const v=Number(r.amount||0)
  x.treasury+=v
  if(/سولار|وقود|fuel/.test(txt))x.fuel+=v
  if(/بترو|petro/.test(txt))x.petro+=v
  expBy.set(r.branch_id,x)
 })
 const analyticRaw=bset.map(b=>{
  const s=salesBy.get(b.id)||0
  const st=latestSetting.get(b.id)||{}
  const ex=expBy.get(b.id)||{treasury:0,fuel:0,petro:0}
  const days=(daysBy.get(b.id)||new Set()).size
  const basis=Number(st.working_days_basis||30)
  const wages=Number(st.wages||0)+Number(st.branch_manager||0)+Number(st.sector_manager||0)
  const rent=Number(st.rent||0)
  const accrued=wages+rent
  const carried=Number(st.carried_expenses||0)
  const toDate=(accrued*(days/Math.max(1,basis)))+carried
  const commission=s*Number(st.commission_rate||0)
  const vehicle=ex.fuel+ex.petro
  const total=toDate+ex.treasury+commission
  return {branch_name:b.name,sales:s,days,wages,rent,toDate,fuel:ex.fuel,petro:ex.petro,vehicle,treasury:ex.treasury,commission,total,rate:s?total/s:0}
 })
 const analyticRows=analyticRaw.map(x=>({
  branch_name:escapeHtml(x.branch_name),
  sales:money(x.sales),days:x.days,wages:money(x.wages),rent:money(x.rent),
  to_date:money(x.toDate),fuel:money(x.fuel),petro:money(x.petro),vehicle:money(x.vehicle),
  treasury:money(x.treasury),commission:money(x.commission),expenses:money(x.total),expense_rate:pct(x.rate)
 }))
 const analyticCols=[
  {key:'branch_name',label:'الفرع'},{key:'sales',label:'المبيعات',num:1},{key:'days',label:'أيام العمل'},
  {key:'wages',label:'أجور',num:1},{key:'rent',label:'إيجارات',num:1},{key:'to_date',label:'المستحق حتى تاريخه',num:1},
  {key:'fuel',label:'سولار',num:1},{key:'petro',label:'بترو أب',num:1},{key:'vehicle',label:'إجمالي السيارات',num:1},
  {key:'treasury',label:'مصروفات الخزينة',num:1},{key:'commission',label:'عمولات',num:1},
  {key:'expenses',label:'إجمالي المصروفات',num:1},{key:'expense_rate',label:'% المصروفات'}
 ]

 const cards='<section class="expense-summary-grid">'+
  '<div class="expense-summary-card"><span>إجمالي المصروفات</span><strong>'+money(totalExpenses)+' ج.م</strong></div>'+
  '<div class="expense-summary-card"><span>صافي المبيعات</span><strong>'+money(totalSales)+' ج.م</strong></div>'+
  '<div class="expense-summary-card"><span>نسبة المصروفات للمبيعات</span><strong>'+pct(expenseRate)+'</strong></div>'+
  '<div class="expense-summary-card"><span>عدد بنود المصروفات</span><strong>'+categoryMap.size+'</strong></div>'+
 '</section>'

 const tabs='<div class="expense-tabs">'+
  '<button class="expense-tab active" data-target="expense-details" onclick="switchExpenseTab(this)">المصروفات</button>'+
  '<button class="expense-tab" data-target="expense-analysis" onclick="switchExpenseTab(this)">تحليلي المصاريف</button>'+
 '</div>'

 const body=filters(from,to,branch)+scope(from,to,branch)+cards+tabs+
  '<div id="expense-details" class="expense-tab-panel active">'+table('المصروفات حسب البند والفروع',detailCols,detailRows)+'</div>'+
  '<div id="expense-analysis" class="expense-tab-panel">'+table('تحليلي المصاريف',analyticCols,analyticRows)+'</div>'

 shell('المصروفات','المصروفات الفعلية وتحليلها في شاشة واحدة',body)
 bindFilters('expenses-center')
}
window.switchExpenseTab=function(btn){
 const parent=btn.closest('.content')||document
 document.querySelectorAll('.expense-tab').forEach(x=>x.classList.remove('active'))
 document.querySelectorAll('.expense-tab-panel').forEach(x=>x.classList.remove('active'))
 btn.classList.add('active')
 document.getElementById(btn.dataset.target)?.classList.add('active')
}

async function renderExpenses(){
 const cfg=currentFilters(),branch=cfg.branch,from=cfg.from,to=cfg.to,ids=await approvedIds()
 const approvedFilter=ids.length?ids:['00000000-0000-0000-0000-000000000000']
 const [cash,sales]=await Promise.all([
  fetchAllRows(
   'cash_entries',
   'id,branch_id,entry_date,category,canonical_category,expense_group,description,amount,is_expense,entry_kind,direction',
   q=>{
    q=q.in('batch_id',approvedFilter).gte('entry_date',from).lte('entry_date',to).order('entry_date').order('id')
    if(branch)q=q.eq('branch_id',branch)
    return q
   },
   'تحميل حركات المصروفات المعتمدة'
  ),
  fetchAllRows(
   'v_branch_daily_kpis',
   'branch_id,business_date,net_sales',
   q=>{
    q=q.gte('business_date',from).lte('business_date',to).order('business_date').order('branch_id')
    if(branch)q=q.eq('branch_id',branch)
    return q
   },
   'تحميل مبيعات تقرير المصروفات'
  )
 ])
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
 let setQ=supabase.from('branch_expense_accrual_settings').select('branch_id,month_start,wages,branch_manager,sector_manager,rent,carried_expenses,commission_rate,working_days_basis').lte('month_start',to).order('month_start',{ascending:false})
 if(branch)setQ=setQ.eq('branch_id',branch)
 const [sales,expenses,setRes]=await Promise.all([
  fetchAllRows(
   'v_branch_daily_kpis',
   'branch_id,business_date,net_sales',
   q=>{
    q=q.gte('business_date',from).lte('business_date',to).order('business_date').order('branch_id')
    if(branch)q=q.eq('branch_id',branch)
    return q
   },
   'تحميل مبيعات تحليل المصروفات'
  ),
  fetchAllRows(
   'v_expense_analysis',
   'id,branch_id,entry_date,canonical_category,expense_group,amount',
   q=>{
    q=q.gte('entry_date',from).lte('entry_date',to).order('entry_date').order('id')
    if(branch)q=q.eq('branch_id',branch)
    return q
   },
   'تحميل مصروفات التحليل'
  ),
  setQ
 ])
 if(setRes.error)throw setRes.error
 const settings=setRes.data||[]
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
 const p=qs(),year=p.get('year')||String(defaultTo.slice(0,4)),branch=p.get('branch')||'',from=year+'-01-01',to=year+'-12-31',ids=await approvedIds()
 const approvedFilter=ids.length?ids:['00000000-0000-0000-0000-000000000000']
 const [daily,warehouse,expenses]=await Promise.all([
  fetchAllRows(
   'v_branch_daily_kpis',
   'branch_id,branch_name,business_date,gross_sales,net_sales,discounts,collections,closing_receivables',
   q=>{
    q=q.gte('business_date',from).lte('business_date',to).order('business_date').order('branch_id')
    if(branch)q=q.eq('branch_id',branch)
    return q
   },
   'تحميل التحليل الشهري'
  ),
  fetchAllRows(
   'warehouse_daily_summary',
   'id,branch_id,business_date,closing_value',
   q=>{
    q=q.in('batch_id',approvedFilter).gte('business_date',from).lte('business_date',to).order('business_date').order('id')
    if(branch)q=q.eq('branch_id',branch)
    return q
   },
   'تحميل مخزون YTD'
  ),
  fetchAllRows(
   'v_expense_analysis',
   'id,branch_id,entry_date,amount',
   q=>{
    q=q.gte('entry_date',from).lte('entry_date',to).order('entry_date').order('id')
    if(branch)q=q.eq('branch_id',branch)
    return q
   },
   'تحميل مصروفات YTD'
  )
 ])
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
 const p=qs(),to=p.get('to')||defaultTo,from=to.slice(0,4)+'-01-01',branch=p.get('branch')||'',ids=await approvedIds()
 const approvedFilter=ids.length?ids:['00000000-0000-0000-0000-000000000000']
 let accountQ=supabase.from('treasury_accounts').select('id,branch_id,name,code,account_type').eq('is_active',true)
 if(branch)accountQ=accountQ.eq('branch_id',branch)
 const [accountRes,entries]=await Promise.all([
  accountQ,
  fetchAllRows(
   'cash_entries',
   'id,branch_id,treasury_account_id,entry_date,direction,amount',
   q=>{
    q=q.in('batch_id',approvedFilter).gte('entry_date',from).lte('entry_date',to).order('entry_date').order('id')
    if(branch)q=q.eq('branch_id',branch)
    return q
   },
   'تحميل حركة البنوك المعتمدة'
  )
 ])
 if(accountRes.error)throw accountRes.error
 const accounts=accountRes.data||[]
 const names=new Map(branches.map(b=>[b.id,b.name])),byId=new Map(accounts.map(a=>[a.id,a]))
 const rowsMap=new Map()
 entries.forEach(e=>{
  const a=byId.get(e.treasury_account_id)
  if(!a||a.account_type!=='bank')return
  const key=a.branch_id+':'+a.id
  const x=rowsMap.get(key)||{branch_name:names.get(a.branch_id)||'-',account:a.name,in:0,out:0}
  if(e.direction==='in')x.in+=Number(e.amount||0);else x.out+=Number(e.amount||0)
  rowsMap.set(key,x)
 })
 const rows=[...rowsMap.values()].map(x=>({...x,in:money(x.in),out:money(x.out),net:money(x.in-x.out)}))
 const form='<form id="bank-filter" class="filters"><div class="field"><label>الفرع</label><select name="branch">'+branchOptions(branch)+'</select></div><div class="field"><label>حتى تاريخ</label><input type="date" name="to" value="'+to+'"></div><div></div><div class="field"><label>&nbsp;</label><button class="btn">تطبيق</button></div></form>'
 shell('البنوك وYTD','حركة الحسابات البنكية من الدفعات المعتمدة فقط',form+scope(from,to,branch)+table('الحسابات البنكية',[
  {key:'branch_name',label:'الفرع'},{key:'account',label:'الحساب'},{key:'in',label:'داخل',num:1},{key:'out',label:'خارج',num:1},{key:'net',label:'الصافي',num:1}
 ],rows))
 document.getElementById('bank-filter')?.addEventListener('submit',e=>{
  e.preventDefault()
  const fd=new FormData(e.currentTarget)
  location.hash='#/banks?branch='+(fd.get('branch')||'')+'&to='+fd.get('to')
 })
}

async function renderReps(){
 const {branch,from,to}=currentFilters(),ids=await approvedIds()
 const approvedFilter=ids.length?ids:['00000000-0000-0000-0000-000000000000']
 const data=await fetchAllRows(
  'sales_rep_daily',
  'id,branch_id,business_date,rep_name,sales_before_discount,net_after_discount,discounts,deposit_amount,closing_balance',
  q=>{
   q=q.in('batch_id',approvedFilter).gte('business_date',from).lte('business_date',to).order('business_date',{ascending:true}).order('id')
   if(branch)q=q.eq('branch_id',branch)
   return q
  },
  'تحميل بيانات المناديب المعتمدة'
 )
 const names=new Map(branches.map(b=>[b.id,b.name])),by=new Map()
 data.forEach(r=>{
  const k=r.branch_id+':'+r.rep_name
  const x=by.get(k)||{branch_name:names.get(r.branch_id),rep_name:r.rep_name,gross:0,net:0,disc:0,deposit:0,closing:0,lastDate:''}
  x.gross+=Number(r.sales_before_discount||0)
  x.net+=Number(r.net_after_discount||0)
  x.disc+=Number(r.discounts||0)
  x.deposit+=Number(r.deposit_amount||0)
  if(String(r.business_date)>=String(x.lastDate||'')){x.closing=Number(r.closing_balance||0);x.lastDate=r.business_date}
  by.set(k,x)
 })
 const rows=[...by.values()].map(x=>({...x,gross:money(x.gross),net:money(x.net),disc:money(x.disc),deposit:money(x.deposit),closing:money(x.closing)}))
 shell('أداء المناديب','المندوب × الفرع',filters(from,to,branch)+scope(from,to,branch)+table('أداء المناديب',[
  {key:'branch_name',label:'الفرع'},{key:'rep_name',label:'المندوب'},{key:'gross',label:'قبل الخصم',num:1},{key:'disc',label:'الخصم',num:1},{key:'net',label:'صافي البيع',num:1},{key:'deposit',label:'التوريد',num:1},{key:'closing',label:'الرصيد',num:1}
 ],rows))
 bindFilters('reps')
}
async function renderInventory(){
 const cfg=currentFilters(),branch=cfg.branch,from=cfg.from,to=cfg.to,ids=await approvedIds()
 const approvedFilter=ids.length?ids:['00000000-0000-0000-0000-000000000000']
 const data=await fetchAllRows(
  'warehouse_daily_summary',
  '*',
  q=>{
   q=q.in('batch_id',approvedFilter).gte('business_date',from).lte('business_date',to).order('business_date').order('id')
   if(branch)q=q.eq('branch_id',branch)
   return q
  },
  'تحميل حركة المخزون المعتمدة'
 )
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
 const approvedFilter=ids.length?ids:['00000000-0000-0000-0000-000000000000']
 const data=await fetchAllRows(
  'inventory_daily',
  'id,branch_id,business_date,product_id,product_name,sales_qty,closing_qty,closing_value',
  q=>{
   q=q.in('batch_id',approvedFilter).gte('business_date',from).lte('business_date',to).order('business_date',{ascending:true}).order('id')
   if(branch)q=q.eq('branch_id',branch)
   return q
  },
  'تحميل مصفوفة الأصناف المعتمدة'
 )
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
    : r.status==='rejected'
      ? `<button class="btn secondary" onclick="viewBatchIssues('${r.id}')">عرض أسباب المراجعة</button>`
      : ['uploaded','failed'].includes(r.status)
        ? `<button class="btn secondary" onclick="processBatch('${r.id}')">إعادة التحليل</button>`
        : r.status==='processing'
          ? '<span class="chip">قيد المعالجة</span>'
          : (r.failure_message||'—')
 }))
 shell('سجل الرفع','كل نسخ الشيتات وحالة الاعتماد',`<div id="imports-msg"></div>`+table('نسخ الشيتات',[{key:'branch_name',label:'الفرع'},{key:'period',label:'الفترة'},{key:'file',label:'الملف'},{key:'version',label:'الإصدار',num:1},{key:'status',label:'الحالة'},{key:'uploaded_at',label:'وقت الرفع'},{key:'approved_at',label:'وقت الاعتماد'},{key:'action',label:'إجراء'}],rows))
}
window.viewBatchIssues=async id=>{
 const msg=document.getElementById('imports-msg')
 if(msg)msg.innerHTML='<div class="notice">جاري تحميل الفروق السابقة…</div>'
 const [{data:issues,error:issuesError},{data:changes,error:changesError}]=await Promise.all([
  supabase.from('import_validation_issues').select('code,severity,message,sheet_name,row_number').eq('batch_id',id).order('severity',{ascending:true}).limit(200),
  supabase.from('import_day_changes').select('business_date,old_snapshot,new_snapshot,resolution_status').eq('batch_id',id).order('business_date').limit(100)
 ])
 const error=issuesError||changesError
 if(error){if(msg)msg.innerHTML='<div class="error">'+escapeHtml(error.message)+'</div>';return}
 const issueRows=issues||[],changeRows=changes||[]
 const errors=issueRows.filter(x=>x.severity==='error').length,warnings=issueRows.filter(x=>x.severity==='warning').length

 const snap=s=>{
  if(!s||typeof s!=='object')return {net:0,collections:0,debt:0,expenses:0,inventory:0}
  if(s.metrics)return {
   net:Number(s.metrics.netSales||0),collections:Number(s.metrics.collections||0),
   debt:Number(s.metrics.closingReceivables||0),expenses:Number(s.metrics.expenses||0),
   inventory:Number(s.metrics.inventoryValue||0)
  }
  const reps=Array.isArray(s.reps)?s.reps:[]
  const treasury=Array.isArray(s.treasury)?s.treasury:[]
  return {
   net:reps.reduce((a,r)=>a+Number(r.netAfterDiscount||r.sales||0),0),
   collections:reps.reduce((a,r)=>a+Number(r.depositAmount||r.collections||0),0),
   debt:reps.reduce((a,r)=>a+Number(r.closingBalance||0),0),
   expenses:treasury.filter(x=>x.isExpense).reduce((a,r)=>a+Number(r.amount||0),0),
   inventory:Number(s.warehouse?.closingValue||0)
  }
 }
 const diffHtml=changeRows.map(ch=>{
  const old=snap(ch.old_snapshot),neu=snap(ch.new_snapshot)
  return '<div class="history-diff-card"><div class="history-diff-date">'+escapeHtml(ch.business_date)+'</div>'+
   '<div class="history-diff-grid">'+
   [['صافي المبيعات',old.net,neu.net],['التحصيل',old.collections,neu.collections],['مديونية آخر',old.debt,neu.debt],['المصروفات',old.expenses,neu.expenses],['قيمة المخزون',old.inventory,neu.inventory]]
    .filter(x=>Math.abs(Number(x[1])-Number(x[2]))>.02)
    .map(x=>'<div><span>'+x[0]+'</span><b>'+money(x[1])+' → '+money(x[2])+'</b></div>').join('')+
   '</div></div>'
 }).join('')

 if(msg)msg.innerHTML=
  '<div class="notice"><b>الفروق السابقة:</b> '+changeRows.length+' يوم • '+errors+' خطأ • '+warnings+' تحذير</div>'+
  (diffHtml||'<div class="notice">لا توجد فروق رقمية مسجلة.</div>')+
  '<div class="history-review-actions">'+
   '<button class="btn secondary" onclick="keepOldImportNew(\''+id+'\',this)">احتفظ بالسابق واستورد الجديد فقط</button>'+
   '<button class="btn danger" onclick="approveReplacement(\''+id+'\',this)">اعتماد الاستبدال بهذه النسخة</button>'+
  '</div>'
}

window.keepOldImportNew=async(id,btn)=>{
 const msg=document.getElementById('imports-msg')
 if(btn){btn.disabled=true;btn.textContent='جاري تجهيز الجديد فقط…'}
 try{
  const {data:{session:active}}=await supabase.auth.getSession()
  const res=await fetch(`${SUPABASE_URL}/functions/v1/ammco-import-process`,{
   method:'POST',headers:{Authorization:`Bearer ${active.access_token}`,apikey:SUPABASE_KEY,'Content-Type':'application/json'},
   body:JSON.stringify({batchId:id,historyMode:'append_only'})
  })
  const out=await res.json()
  if(!res.ok)throw new Error(out.error||'تعذر تجهيز النسخة')
  if(out.noNewDays){if(msg)msg.innerHTML='<div class="notice">لا توجد أيام جديدة. البيانات القديمة بقيت كما هي ولم يتم تغييرها.</div>';return}
  if(out.status!=='validated')throw new Error('النسخة ما زالت تحتاج مراجعة')
  const {error}=await supabase.rpc('approve_import_batch',{p_batch_id:id})
  if(error)throw error
  clearPageCache()
  if(msg)msg.innerHTML='<div class="success">تم الاحتفاظ بالبيانات السابقة واعتماد الأيام الجديدة فقط.</div>'
  setTimeout(()=>render({force:true}),400)
 }catch(err){if(msg)msg.innerHTML='<div class="error">'+escapeHtml(err.message||String(err))+'</div>'}
 finally{if(btn){btn.disabled=false;btn.textContent='احتفظ بالسابق واستورد الجديد فقط'}}
}

window.approveReplacement=async(id,btn)=>{
 const msg=document.getElementById('imports-msg')
 if(!confirm('سيتم استبدال الأيام السابقة الموضحة أعلاه بهذه النسخة. هل تريد المتابعة؟'))return
 if(btn){btn.disabled=true;btn.textContent='جاري تجهيز الاستبدال…'}
 try{
  const {data:{session:active}}=await supabase.auth.getSession()
  const res=await fetch(`${SUPABASE_URL}/functions/v1/ammco-import-process`,{
   method:'POST',headers:{Authorization:`Bearer ${active.access_token}`,apikey:SUPABASE_KEY,'Content-Type':'application/json'},
   body:JSON.stringify({batchId:id,historyMode:'replace'})
  })
  const out=await res.json()
  if(!res.ok)throw new Error(out.error||'تعذر تجهيز الاستبدال')
  if(out.status!=='validated')throw new Error('توجد أخطاء أخرى غير فروق الأيام السابقة؛ لا يمكن الاستبدال')
  const {error}=await supabase.rpc('approve_import_batch',{p_batch_id:id})
  if(error)throw error
  clearPageCache()
  if(msg)msg.innerHTML='<div class="success">تم اعتماد الاستبدال وتحديث الأيام السابقة بالنسخة الجديدة.</div>'
  setTimeout(()=>render({force:true}),400)
 }catch(err){if(msg)msg.innerHTML='<div class="error">'+escapeHtml(err.message||String(err))+'</div>'}
 finally{if(btn){btn.disabled=false;btn.textContent='اعتماد الاستبدال بهذه النسخة'}}
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
 const branchOpts='<option value="">اختر الفرع</option>'+branches.map(b=>'<option value="'+b.id+'">'+escapeHtml(b.name)+'</option>').join('')
 const month=selectedMonth||today.toISOString().slice(0,7)
 const [yy,mm]=month.split('-').map(Number)
 const periodStart=month+'-01'
 const periodEnd=month+'-'+String(new Date(yy,mm,0).getDate()).padStart(2,'0')

 shell('رفع الشيتات والسجل','ارفع ملف فرع واحد ثم راجع حالته من السجل أسفل الصفحة',`
  <section class="upload-simple-card">
   <div class="upload-step-head"><span class="step-badge">1</span><div><h2>رفع شيت جديد</h2><p>اختر الفرع والفترة ثم ملف Excel.</p></div></div>
   <form id="simple-upload-form" class="upload-simple-form">
    <div class="field"><label>الفرع</label><select name="branch" required>${branchOpts}</select></div>
    <div class="field"><label>الشهر</label><select name="month" required>
      ${(availableMonths.length?availableMonths:[month]).map(m=>'<option value="'+m+'" '+(m===month?'selected':'')+'>'+monthLabel(m)+'</option>').join('')}
    </select></div>
    <div class="field upload-file-wide"><label>ملف Excel</label><input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required></div>
    <div class="field upload-mode-wide"><label>طريقة التعامل مع البيانات السابقة</label>
     <select name="historyMode">
      <option value="append_only" selected>إضافة الأيام الجديدة فقط وعدم تغيير الأيام السابقة</option>
      <option value="review">مقارنة أي تغييرات سابقة وعرضها للمراجعة</option>
     </select>
    </div>
    <div class="upload-primary-action"><button class="btn" type="submit">رفع وتحليل الشيت</button></div>
   </form>
   <div id="upload-msg"></div>
   <div id="simple-upload-progress" class="simple-upload-progress" hidden><span></span><b>جاري المعالجة…</b></div>
  </section>

  <section class="upload-history-section">
   <div class="upload-step-head"><span class="step-badge">2</span><div><h2>سجل الشيتات</h2><p>راجع النسخ السابقة أو أعد رفعها أو احذفها.</p></div></div>
   <div id="upload-history"></div>
  </section>
 `)

 const form=document.getElementById('simple-upload-form')
 const progress=document.getElementById('simple-upload-progress')
 form?.addEventListener('submit',async ev=>{
  ev.preventDefault()
  const msg=document.getElementById('upload-msg')
  const button=form.querySelector('button[type=submit]')
  const branchId=form.branch.value
  const selectedUploadMonth=form.month.value
  const [uy,um]=selectedUploadMonth.split('-').map(Number)
  const start=selectedUploadMonth+'-01'
  const end=selectedUploadMonth+'-'+String(new Date(uy,um,0).getDate()).padStart(2,'0')
  const file=form.file.files?.[0]
  const historyMode=form.historyMode.value||'append_only'
  if(!branchId||!selectedUploadMonth||!file){msg.innerHTML='<div class="error">اختر الفرع والشهر والملف.</div>';return}
  try{
   button.disabled=true
   progress.hidden=false
   progress.querySelector('b').textContent='1/3 قراءة ملف '+monthLabel(selectedUploadMonth)+'…'
   progress.querySelector('span').style.width='20%'
   msg.innerHTML=''

   const parsed=await parseWorkbookBrowser(file,{periodStart:start,periodEnd:end})
   progress.querySelector('b').textContent='2/3 رفع الملف…'
   progress.querySelector('span').style.width='55%'

   const {data:{session:active}}=await supabase.auth.getSession()
   if(!active)throw new Error('انتهت جلسة الدخول. سجل الدخول مرة أخرى.')

   const fd=new FormData()
   fd.set('branch_id',branchId)
   fd.set('period_start',start)
   fd.set('period_end',end)
   fd.set('file',file)
   fd.set('parsed_cache',new File([JSON.stringify(parsed)],'parsed-cache.json',{type:'application/json'}))

   const uploadRes=await fetch(SUPABASE_URL+'/functions/v1/ammco-import-upload',{
    method:'POST',headers:{Authorization:'Bearer '+active.access_token,apikey:SUPABASE_KEY},body:fd
   })
   const uploaded=await uploadRes.json()
   if(!uploadRes.ok)throw new Error(uploaded.error||'تعذر رفع الملف')

   progress.querySelector('b').textContent='3/3 تحليل وتسجيل البيانات…'
   progress.querySelector('span').style.width='82%'

   const processRes=await fetch(SUPABASE_URL+'/functions/v1/ammco-import-process',{
    method:'POST',
    headers:{Authorization:'Bearer '+active.access_token,apikey:SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({batchId:uploaded.batchId,parsed,historyMode})
   })
   const processed=await processRes.json()
   if(!processRes.ok)throw new Error(processed.error||'تعذر تحليل الملف')

   progress.querySelector('span').style.width='100%'
   if(processed.status==='validated'){
    msg.innerHTML='<div class="success"><b>تم الرفع والتحليل بنجاح.</b> النسخة جاهزة للاعتماد من السجل.</div>'
   }else if(processed.noNewDays){
    msg.innerHTML='<div class="notice">تم فحص الملف ولا توجد أيام جديدة لإضافتها.</div>'
   }else{
    msg.innerHTML='<div class="notice"><b>تم الرفع.</b> توجد ملاحظات تحتاج مراجعة من السجل.</div>'
   }
   form.file.value=''
   clearPageCache()
   await loadUploadHistory()
  }catch(err){
   msg.innerHTML='<div class="error">'+escapeHtml(err.message||err)+'</div>'
  }finally{
   button.disabled=false
   setTimeout(()=>{progress.hidden=true;progress.querySelector('span').style.width='0%'},700)
  }
 })
 loadUploadHistory()
}

async function loadUploadHistory(){
 const host=document.getElementById('upload-history')
 if(!host)return
 host.innerHTML='<div class="notice">جاري تحميل سجل الشيتات…</div>'
 const {data,error}=await supabase.from('import_batches')
  .select('id,branch_id,original_file_name,period_start,period_end,version,status,uploaded_at,approved_at,failure_message,branches(name)')
  .order('uploaded_at',{ascending:false}).limit(300)
 if(error){host.innerHTML='<div class="error">'+escapeHtml(error.message)+'</div>';return}
 const labels={uploaded:'مرفوع',processing:'قيد التحليل',validated:'جاهز للاعتماد',approved:'معتمد',rejected:'يحتاج مراجعة',failed:'فشل',superseded:'نسخة سابقة'}
 const rows=(data||[]).map(r=>{
  const branchName=Array.isArray(r.branches)?r.branches[0]?.name:r.branches?.name
  const actions=[]
  if(r.status==='validated'&&profile?.role==='admin')actions.push('<button class="inline-action" onclick="approveBatch(\''+r.id+'\')">اعتماد</button>')
  if(['uploaded','failed'].includes(r.status))actions.push('<button class="inline-action" onclick="processBatch(\''+r.id+'\')">إعادة التحليل</button>')
  if(r.status==='rejected')actions.push('<button class="inline-action" onclick="viewBatchIssues(\''+r.id+'\')">مراجعة</button>')
  if(profile?.role==='admin'){
   actions.push('<button class="inline-action" onclick="reuploadBatch(\''+r.id+'\',\''+r.branch_id+'\',\''+r.period_start+'\',\''+r.period_end+'\')">إعادة رفع</button>')
   actions.push('<button class="inline-action danger" onclick="deleteUploadBatch(\''+r.id+'\',\''+escapeAttr(r.original_file_name||'')+'\')">حذف</button>')
  }
  return {
   branch_name:escapeHtml(branchName||'—'),
   period:escapeHtml(r.period_start+' — '+r.period_end),
   file:escapeHtml(r.original_file_name||'—'),
   version:r.version,
   status:labels[r.status]||r.status,
   uploaded_at:r.uploaded_at?new Date(r.uploaded_at).toLocaleString('en-GB'):'—',
   approved_at:r.approved_at?new Date(r.approved_at).toLocaleString('en-GB'):'—',
   action:actions.join(' ')||escapeHtml(r.failure_message||'—')
  }
 })
 host.innerHTML='<div id="imports-msg"></div>'+table('سجل الشيتات',[
  {key:'branch_name',label:'الفرع'},{key:'period',label:'الفترة'},{key:'file',label:'الملف'},
  {key:'version',label:'الإصدار',num:1},{key:'status',label:'الحالة'},
  {key:'uploaded_at',label:'وقت الرفع'},{key:'approved_at',label:'وقت الاعتماد'},
  {key:'action',label:'الإجراءات',filter:false}
 ],rows)
}

window.deleteUploadBatch=async function(id,fileName){
 if(profile?.role!=='admin')return
 if(!confirm('سيتم حذف الشيت «'+fileName+'» وبياناته المرتبطة. هل تريد المتابعة؟'))return
 const msg=document.getElementById('imports-msg')
 try{
  if(msg)msg.innerHTML='<div class="notice">جاري حذف الشيت…</div>'
  const {data:{session:active}}=await supabase.auth.getSession()
  if(!active)throw new Error('انتهت جلسة الدخول')
  const res=await fetch(SUPABASE_URL+'/functions/v1/ammco-import-delete',{
   method:'POST',
   headers:{Authorization:'Bearer '+active.access_token,apikey:SUPABASE_KEY,'Content-Type':'application/json'},
   body:JSON.stringify({batchId:id})
  })
  const out=await res.json()
  if(!res.ok)throw new Error(out.error||'تعذر حذف الشيت')
  clearPageCache()
  if(msg)msg.innerHTML='<div class="success">تم حذف الشيت بنجاح.</div>'
  await loadUploadHistory()
 }catch(err){if(msg)msg.innerHTML='<div class="error">'+escapeHtml(err.message||err)+'</div>'}
}

window.reuploadBatch=function(id,branchId,periodStart,periodEnd){
 if(profile?.role!=='admin')return
 document.getElementById('reupload-dialog')?.remove()
 const html='<div class="dialog-backdrop" id="reupload-dialog"><div class="dialog-card">'+
  '<div class="dialog-head"><h3>إعادة رفع الشيت</h3><button class="tool-btn" type="button" onclick="document.getElementById(\'reupload-dialog\').remove()">إغلاق</button></div>'+
  '<form id="reupload-form" class="dialog-form">'+
   '<div class="locked-source"><span>الفترة</span><strong>'+escapeHtml(periodStart+' — '+periodEnd)+'</strong></div>'+
   '<div class="field"><label>ملف Excel الجديد</label><input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required></div>'+
   '<button class="btn">رفع وتحليل النسخة الجديدة</button><div id="reupload-msg"></div>'+
  '</form></div></div>'
 document.body.insertAdjacentHTML('beforeend',html)
 const form=document.getElementById('reupload-form')
 form.addEventListener('submit',async ev=>{
  ev.preventDefault()
  const msg=document.getElementById('reupload-msg'),file=form.file.files?.[0]
  if(!file){msg.innerHTML='<div class="error">اختر ملف Excel.</div>';return}
  try{
   msg.innerHTML='<div class="notice">جاري قراءة الملف…</div>'
   const parsed=await parseWorkbookBrowser(file,{periodStart,periodEnd})
   const {data:{session:active}}=await supabase.auth.getSession()
   if(!active)throw new Error('انتهت جلسة الدخول')
   const fd=new FormData()
   fd.set('branch_id',branchId);fd.set('period_start',periodStart);fd.set('period_end',periodEnd);fd.set('file',file)
   fd.set('parsed_cache',new File([JSON.stringify(parsed)],'parsed-cache.json',{type:'application/json'}))
   const uploadRes=await fetch(SUPABASE_URL+'/functions/v1/ammco-import-upload',{
    method:'POST',headers:{Authorization:'Bearer '+active.access_token,apikey:SUPABASE_KEY},body:fd
   })
   const uploaded=await uploadRes.json()
   if(!uploadRes.ok)throw new Error(uploaded.error||'تعذر رفع الملف')
   msg.innerHTML='<div class="notice">تم الرفع، جاري التحليل…</div>'
   const processRes=await fetch(SUPABASE_URL+'/functions/v1/ammco-import-process',{
    method:'POST',
    headers:{Authorization:'Bearer '+active.access_token,apikey:SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({batchId:uploaded.batchId,parsed,historyMode:'review'})
   })
   const processed=await processRes.json()
   if(!processRes.ok)throw new Error(processed.error||'تعذر تحليل الملف')
   if(processed.status==='validated'){
    const {error:approveError}=await supabase.rpc('approve_import_batch',{p_batch_id:uploaded.batchId})
    if(approveError)throw approveError
    msg.innerHTML='<div class="success">تم رفع النسخة الجديدة وتحليلها واعتمادها.</div>'
    clearPageCache()
    setTimeout(async()=>{document.getElementById('reupload-dialog')?.remove();await loadUploadHistory()},500)
   }else{
    msg.innerHTML='<div class="notice">تم رفع النسخة الجديدة لكنها تحتاج مراجعة قبل الاعتماد. ستظهر في السجل.</div>'
    clearPageCache()
    setTimeout(async()=>{document.getElementById('reupload-dialog')?.remove();await loadUploadHistory()},700)
   }
  }catch(err){msg.innerHTML='<div class="error">'+escapeHtml(err.message||err)+'</div>'}
 })
}

boot()
