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
 if(['dashboard','executive','receivables','monthly'].includes(r))return 'التقرير المجمع'
 if(['sales'].includes(r))return 'البيعات اصناف'
 if(['products'].includes(r))return 'رصيد الفروع'
 if(['expense-matrix'].includes(r))return 'تحليلي مصروفات'
 if(['expenses'].includes(r))return 'تقرير المصروفات'
 if(['treasury','banks','accounting-inputs'].includes(r))return 'تحويل مصنع'
 if(['inventory'].includes(r))return 'حركة مخزون'
 if(['reps'].includes(r))return 'بترو اب'
 if(['branches','users','imports','uploads'].includes(r))return 'إدارة النظام'
 return 'التقرير المجمع'
}

function shell(title,subtitle,body){
 const r=route().split('?')[0],sheetSection=sheetSectionForRoute(r)
 app.innerHTML=`<div class="shell">
 <aside class="sidebar">
  <div class="brand"><div class="logo">A</div><div><b>AMMCO</b><small>Management Intelligence</small></div></div>

  <div class="nav-title">التقرير المجمع</div><nav class="nav">
   <a class="${r==='dashboard'?'active':''}" href="#/dashboard">لوحة الإدارة</a>
   <a class="${r==='executive'?'active':''}" href="#/executive">التقرير التنفيذي</a>
   <a class="${r==='receivables'?'active':''}" href="#/receivables">المديونيات والتحصيل</a>
   <a class="${r==='monthly'?'active':''}" href="#/monthly">التحليل الشهري وYTD</a>
  </nav>

  <div class="nav-title">البيعات اصناف</div><nav class="nav">
   <a class="${r==='sales'?'active':''}" href="#/sales">المبيعات</a>
  </nav>

  <div class="nav-title">رصيد الفروع</div><nav class="nav">
   <a class="${r==='products'?'active':''}" href="#/products">مصفوفة الأصناف والأرصدة</a>
  </nav>

  <div class="nav-title">تحليلي مصروفات</div><nav class="nav">
   <a class="${r==='expense-matrix'?'active':''}" href="#/expense-matrix">مصفوفة المصروفات</a>
  </nav>

  <div class="nav-title">تقرير المصروفات</div><nav class="nav">
   <a class="${r==='expenses'?'active':''}" href="#/expenses">تفاصيل المصروفات</a>
  </nav>

  <div class="nav-title">تحويل مصنع</div><nav class="nav">
   <a class="${r==='treasury'?'active':''}" href="#/treasury">الخزينة والبنوك</a>
   <a class="${r==='banks'?'active':''}" href="#/banks">البنوك وYTD</a>
  </nav>

  <div class="nav-title">حركة مخزون</div><nav class="nav">
   <a class="${r==='inventory'?'active':''}" href="#/inventory">حركة المخزون</a>
  </nav>

  <div class="nav-title">بترو اب</div><nav class="nav">
   <a class="${r==='reps'?'active':''}" href="#/reps">أداء المناديب</a>
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
   ${body}
  </section>
 </main>
 </div>`
 document.getElementById('logout')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.hash='';})
}
function branchOptions(selected=''){return `<option value="">كل الفروع</option>${branches.map(b=>`<option value="${b.id}" ${selected===b.id?'selected':''}>${b.name}</option>`).join('')}`}
function filters(from,to,branch){return `<form id="filters" class="filters compact-filters">
 <div class="field filter-branch"><label>الفرع</label><select name="branch">${branchOptions(branch)}</select></div>
 <div class="field"><label>من</label><input type="date" name="from" value="${from}"></div>
 <div class="field"><label>إلى</label><input type="date" name="to" value="${to}"></div>
 <div class="filter-buttons"><button class="btn" type="submit">تطبيق</button><button class="btn secondary" type="button" onclick="resetReportFilters()">مسح</button></div>
</form>`}
function bindFilters(path){document.getElementById('filters')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);location.hash=`#/${path}?branch=${f.get('branch')||''}&from=${f.get('from')}&to=${f.get('to')}`})}
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
window.resetReportFilters=()=>{const r=route().split('?')[0];location.hash='#/'+r}
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
async function render(){
 if(!session) return renderLogin()
 if(!profile?.is_active) return shell('AMMCO','الحساب غير مهيأ أو غير نشط','<div class="notice">راجع مدير النظام لربط الحساب بالمؤسسة.</div>')
 const r=route().split('?')[0]
 try{
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
async function renderDashboard(){
 const {branch,from,to}=currentFilters();const daily=await loadDaily(branch,from,to)
 const totals=daily.reduce((a,r)=>{a.gross+=+r.gross_sales||0;a.net+=+r.net_sales||0;a.disc+=+r.discounts||0;a.coll+=+r.collections||0;a.exp+=+r.expenses||0;return a},{gross:0,net:0,disc:0,coll:0,exp:0})
 const by=new Map();daily.forEach(r=>{const k=r.branch_id;const x=by.get(k)||{branch_name:r.branch_name,net:0,coll:0,disc:0,exp:0,debt:0};x.net+=+r.net_sales||0;x.coll+=+r.collections||0;x.disc+=+r.discounts||0;x.exp+=+r.expenses||0;x.debt=+r.closing_receivables||x.debt;by.set(k,x)})
 const rawRows=[...by.values()].sort((a,b)=>b.net-a.net)
 const companyDebt=rawRows.reduce((s,x)=>s+x.debt,0)
 const rows=rawRows.map(x=>({...x,net:money(x.net),coll:money(x.coll),coll_rate:pct(x.net?x.coll/x.net:0),disc:money(x.disc),disc_rate:pct((x.net+x.disc)?x.disc/(x.net+x.disc):0),exp:money(x.exp),exp_rate:pct(x.net?x.exp/x.net:0),debt:money(x.debt)}))
 const totalRow=`<tr class="total"><th>إجمالي الشركة</th><th class="num">${money(totals.net)}</th><th class="num">${money(totals.coll)}</th><th>${pct(totals.net?totals.coll/totals.net:0)}</th><th class="num">${money(totals.disc)}</th><th>${pct(totals.gross?totals.disc/totals.gross:0)}</th><th class="num">${money(totals.exp)}</th><th>${pct(totals.net?totals.exp/totals.net:0)}</th><th class="num">${money(companyDebt)}</th></tr>`
 shell('مركز الإدارة','ملخص أداء الفروع',filters(from,to,branch)+scope(from,to,branch)+`<section class="kpis dashboard-kpis">
  <div class="kpi"><span>صافي المبيعات</span><strong>${money(totals.net)}</strong></div>
  <div class="kpi"><span>التحصيل</span><strong>${money(totals.coll)}</strong></div>
  <div class="kpi"><span>الخصومات</span><strong>${money(totals.disc)}</strong></div>
  <div class="kpi"><span>المصروفات</span><strong>${money(totals.exp)}</strong></div>
 </section>`+table('مقارنة الفروع',[{key:'branch_name',label:'الفرع'},{key:'net',label:'صافي البيع',num:1},{key:'coll',label:'التحصيل',num:1},{key:'coll_rate',label:'% التحصيل'},{key:'disc',label:'الخصم',num:1},{key:'disc_rate',label:'% الخصم'},{key:'exp',label:'المصروفات',num:1},{key:'exp_rate',label:'% المصروف'},{key:'debt',label:'مديونية آخر',num:1}],rows,totalRow));bindFilters('dashboard')
}
async function renderExecutive(){
 const cfg=currentFilters(),branch=cfg.branch,from=cfg.from,to=cfg.to
 const daily=await loadDaily(branch,from,to)
 const by=new Map()
 daily.forEach(function(r){
  const k=r.branch_id
  const x=by.get(k)||{branch_name:r.branch_name,gross:0,disc:0,net:0,coll:0,open:Number(r.opening_receivables||0),debt:0,exp:0}
  x.gross+=Number(r.gross_sales||0);x.disc+=Number(r.discounts||0);x.net+=Number(r.net_sales||0);x.coll+=Number(r.collections||0);x.exp+=Number(r.expenses||0);x.debt=Number(r.closing_receivables||x.debt)
  by.set(k,x)
 })
 const raw=[...by.values()].sort(function(a,b){return b.net-a.net})
 const totals=raw.reduce(function(a,x){a.gross+=x.gross;a.disc+=x.disc;a.net+=x.net;a.coll+=x.coll;a.open+=x.open;a.debt+=x.debt;a.exp+=x.exp;return a},{gross:0,disc:0,net:0,coll:0,open:0,debt:0,exp:0})
 const rows=raw.map(function(x){return{
  branch_name:x.branch_name,gross:money(x.gross),disc:money(x.disc),disc_rate:pct(x.gross?x.disc/x.gross:0),net:money(x.net),
  coll:money(x.coll),coll_rate:pct(x.net?x.coll/x.net:0),open:money(x.open),debt:money(x.debt),exp:money(x.exp),exp_rate:pct(x.net?x.exp/x.net:0)
 }})
 const totalRow='<tr class="total"><th>إجمالي الشركة</th><th class="num">'+money(totals.gross)+'</th><th class="num">'+money(totals.disc)+'</th><th>'+pct(totals.gross?totals.disc/totals.gross:0)+'</th><th class="num">'+money(totals.net)+'</th><th class="num">'+money(totals.coll)+'</th><th>'+pct(totals.net?totals.coll/totals.net:0)+'</th><th class="num">'+money(totals.open)+'</th><th class="num">'+money(totals.debt)+'</th><th class="num">'+money(totals.exp)+'</th><th>'+pct(totals.net?totals.exp/totals.net:0)+'</th></tr>'
 const kpis='<section class="kpis dashboard-kpis">'+
  '<div class="kpi"><span>صافي المبيعات</span><strong>'+money(totals.net)+'</strong></div>'+
  '<div class="kpi"><span>التحصيل</span><strong>'+money(totals.coll)+'</strong></div>'+
  '<div class="kpi"><span>مديونية آخر</span><strong>'+money(totals.debt)+'</strong></div>'+
  '<div class="kpi"><span>المصروفات</span><strong>'+money(totals.exp)+'</strong></div></section>'
 shell('التقرير التنفيذي','مقارنة الإدارة حسب الفروع',filters(from,to,branch)+scope(from,to,branch)+kpis+table('الملخص التنفيذي',[
  {key:'branch_name',label:'الفرع'},{key:'gross',label:'قبل الخصم',num:1},{key:'disc',label:'الخصم',num:1},{key:'disc_rate',label:'% الخصم'},
  {key:'net',label:'صافي البيع',num:1},{key:'coll',label:'التحصيل',num:1},{key:'coll_rate',label:'% التحصيل'},
  {key:'open',label:'مديونية أول',num:1},{key:'debt',label:'مديونية آخر',num:1},{key:'exp',label:'المصروفات',num:1},{key:'exp_rate',label:'% المصروف'}
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
async function renderExpenses(){const {branch,from,to}=currentFilters();let q=supabase.from('v_expense_analysis').select('entry_date,branch_id,branch_name,canonical_category,expense_group,description,amount').gte('entry_date',from).lte('entry_date',to).order('entry_date');if(branch)q=q.eq('branch_id',branch);const {data,error}=await q;if(error)throw error;const rows=(data||[]).map(r=>({...r,amount:money(r.amount)}));shell('تفاصيل المصروفات','كل بند مع الفرع والمجموعة',filters(from,to,branch)+scope(from,to,branch)+table('المصروفات',[{key:'entry_date',label:'التاريخ'},{key:'branch_name',label:'الفرع'},{key:'canonical_category',label:'البند'},{key:'expense_group',label:'المجموعة'},{key:'description',label:'البيان'},{key:'amount',label:'القيمة',num:1}],rows));bindFilters('expenses')}

async function renderExpenseMatrix(){
 const {branch,from,to}=currentFilters()
 let q=supabase.from('v_expense_analysis').select('branch_id,branch_name,canonical_category,amount').gte('entry_date',from).lte('entry_date',to)
 if(branch)q=q.eq('branch_id',branch)
 const [{data:expenses,error},{data:sales}]=await Promise.all([
  q,
  supabase.from('v_branch_daily_kpis').select('branch_id,net_sales').gte('business_date',from).lte('business_date',to)
 ])
 if(error)throw error
 const bset=branch?branches.filter(b=>b.id===branch):branches
 const byCat=new Map(),salesBy=new Map()
 ;(sales||[]).forEach(r=>salesBy.set(r.branch_id,(salesBy.get(r.branch_id)||0)+(+r.net_sales||0)))
 ;(expenses||[]).forEach(r=>{const cat=r.canonical_category||'غير مصنف';const row=byCat.get(cat)||new Map();row.set(r.branch_id,(row.get(r.branch_id)||0)+(+r.amount||0));byCat.set(cat,row)})
 const head=bset.map((b,i)=>`<th class="${i%2?'group-green':'group-blue'}">${b.name}</th>`).join('')
 const rows=[...byCat.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ar')).map(([cat,row])=>`<tr><td class="row-label">${cat}</td>${bset.map(b=>`<td class="num">${money(row.get(b.id)||0)}</td>`).join('')}<td class="num"><b>${money([...row.values()].reduce((s,v)=>s+v,0))}</b></td></tr>`).join('')
 const totals=bset.map(b=>{const total=[...byCat.values()].reduce((s,row)=>s+(row.get(b.id)||0),0);return `<td class="num"><b>${money(total)}</b><div class="muted">${pct((salesBy.get(b.id)||0)?total/(salesBy.get(b.id)||1):0)}</div></td>`}).join('')
 shell('مصفوفة المصروفات','البند × الفرع مع إجمالي الشركة والنسبة من المبيعات',filters(from,to,branch)+scope(from,to,branch)+`<section class="table-card matrix"><div class="table-head"><h2>Expense Matrix</h2></div><div class="table-wrap"><table><thead><tr><th class="group-orange">البند</th>${head}<th class="group-gold">إجمالي الشركة</th></tr></thead><tbody>${rows}<tr class="total"><th>إجمالي الفرع</th>${totals}<th>${money((expenses||[]).reduce((s,r)=>s+(+r.amount||0),0))}</th></tr></tbody></table></div></section>`)
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
 const p=qs();const year=p.get('year')||String(new Date().getFullYear());const branch=p.get('branch')||''
 let q=supabase.from('v_branch_daily_kpis').select('branch_id,branch_name,business_date,gross_sales,net_sales,discounts,collections,expenses,closing_receivables,inventory_value').gte('business_date',`${year}-01-01`).lte('business_date',`${year}-12-31`).order('business_date')
 if(branch)q=q.eq('branch_id',branch)
 const {data,error}=await q;if(error)throw error
 const by=new Map()
 ;(data||[]).forEach(r=>{const m=r.business_date.slice(0,7);const x=by.get(m)||{month:m,gross:0,net:0,disc:0,coll:0,exp:0,debt:0,inv:0};x.gross+=+r.gross_sales||0;x.net+=+r.net_sales||0;x.disc+=+r.discounts||0;x.coll+=+r.collections||0;x.exp+=+r.expenses||0;x.debt=+r.closing_receivables||x.debt;x.inv=+r.inventory_value||x.inv;by.set(m,x)})
 let ytd=0
 const rows=[...by.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(x=>{ytd+=x.net;return{month:x.month,gross:money(x.gross),disc:money(x.disc),net:money(x.net),coll:money(x.coll),exp:money(x.exp),debt:money(x.debt),inv:money(x.inv),ytd:money(ytd)}})
 const form=`<form id="year-filter" class="filters"><div class="field"><label>الفرع</label><select name="branch">${branchOptions(branch)}</select></div><div class="field"><label>السنة</label><input name="year" value="${year}"></div><div></div><div class="field"><label>&nbsp;</label><button class="btn">تطبيق</button></div></form>`
 shell('التحليل الشهري وYTD','مقارنة الشهور والتراكم السنوي',form+table('Monthly / YTD',[{key:'month',label:'الشهر'},{key:'gross',label:'قبل الخصم',num:1},{key:'disc',label:'الخصم',num:1},{key:'net',label:'صافي البيع',num:1},{key:'coll',label:'التحصيل',num:1},{key:'exp',label:'المصروفات',num:1},{key:'debt',label:'مديونية آخر',num:1},{key:'inv',label:'مخزون آخر',num:1},{key:'ytd',label:'YTD مبيعات',num:1}],rows))
 document.getElementById('year-filter')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget);location.hash=`#/monthly?branch=${fd.get('branch')||''}&year=${fd.get('year')}`})
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

async function renderReps(){const {branch,from,to}=currentFilters();const ids=await approvedIds();let q=supabase.from('sales_rep_daily').select('branch_id,business_date,rep_name,sales_before_discount,net_after_discount,discounts,deposit_amount,closing_balance').in('batch_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']).gte('business_date',from).lte('business_date',to);if(branch)q=q.eq('branch_id',branch);const {data,error}=await q;if(error)throw error;const names=new Map(branches.map(b=>[b.id,b.name]));const by=new Map();(data||[]).forEach(r=>{const k=`${r.branch_id}:${r.rep_name}`;const x=by.get(k)||{branch_name:names.get(r.branch_id),rep_name:r.rep_name,gross:0,net:0,disc:0,deposit:0,closing:0};x.gross+=+r.sales_before_discount||0;x.net+=+r.net_after_discount||0;x.disc+=+r.discounts||0;x.deposit+=+r.deposit_amount||0;x.closing=+r.closing_balance||x.closing;by.set(k,x)});const rows=[...by.values()].map(x=>({...x,gross:money(x.gross),net:money(x.net),disc:money(x.disc),deposit:money(x.deposit),closing:money(x.closing)}));shell('أداء المناديب','المندوب × الفرع',filters(from,to,branch)+scope(from,to,branch)+table('أداء المناديب',[{key:'branch_name',label:'الفرع'},{key:'rep_name',label:'المندوب'},{key:'gross',label:'قبل الخصم',num:1},{key:'disc',label:'الخصم',num:1},{key:'net',label:'صافي البيع',num:1},{key:'deposit',label:'التوريد',num:1},{key:'closing',label:'الرصيد',num:1}],rows));bindFilters('reps')}
async function renderInventory(){const {branch,from,to}=currentFilters();const ids=await approvedIds();let q=supabase.from('inventory_daily').select('branch_id,business_date,product_name,opening_qty,incoming_factory_qty,incoming_branches_qty,sales_qty,bonus_qty,gifts_qty,damages_qty,return_factory_qty,outgoing_branches_qty,adjustments_qty,closing_qty,closing_value').in('batch_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']).gte('business_date',from).lte('business_date',to);if(branch)q=q.eq('branch_id',branch);const {data,error}=await q;if(error)throw error;const names=new Map(branches.map(b=>[b.id,b.name]));const rows=(data||[]).slice(0,5000).map(r=>({branch_name:names.get(r.branch_id),business_date:r.business_date,product_name:r.product_name,opening:money(r.opening_qty),factory:money(r.incoming_factory_qty),sales:money(r.sales_qty),closing:money(r.closing_qty),value:money(r.closing_value)}));shell('حركة المخزون','حركة الصنف حسب الفرع واليوم',filters(from,to,branch)+scope(from,to,branch)+table('حركة المخزون',[{key:'business_date',label:'التاريخ'},{key:'branch_name',label:'الفرع'},{key:'product_name',label:'الصنف'},{key:'opening',label:'رصيد أول',num:1},{key:'factory',label:'وارد مصنع',num:1},{key:'sales',label:'مبيعات',num:1},{key:'closing',label:'رصيد آخر',num:1},{key:'value',label:'قيمة الرصيد',num:1}],rows));bindFilters('inventory')}
async function renderProducts(){const {branch,from,to}=currentFilters();const ids=await approvedIds();let q=supabase.from('inventory_daily').select('branch_id,product_name,sales_qty,closing_qty,closing_value').in('batch_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']).gte('business_date',from).lte('business_date',to);if(branch)q=q.eq('branch_id',branch);const {data,error}=await q;if(error)throw error;const bset=branch?branches.filter(b=>b.id===branch):branches;const matrix=new Map();(data||[]).forEach(r=>{const x=matrix.get(r.product_name)||{};const c=x[r.branch_id]||{sales:0,closing:0,value:0};c.sales+=+r.sales_qty||0;c.closing=+r.closing_qty||c.closing;c.value=+r.closing_value||c.value;x[r.branch_id]=c;matrix.set(r.product_name,x)});const rows=[...matrix.entries()].map(([product,cells])=>{let html=`<td class="row-label">${product}</td>`;for(const b of bset){const c=cells[b.id]||{};html+=`<td class="num">${money(c.sales)}</td><td class="num">${money(c.closing)}</td><td class="num">${money(c.value)}</td>`}return `<tr>${html}</tr>`}).join('');const head=bset.map((b,i)=>`<th colspan="3" class="${i%2?'group-green':'group-blue'}">${b.name}</th>`).join('');const sub=bset.map(()=>'<th>بيع</th><th>رصيد</th><th>قيمة</th>').join('');shell('مصفوفة الأصناف','الصنف × الفروع',filters(from,to,branch)+scope(from,to,branch)+`<section class="table-card matrix"><div class="table-head"><h2>Product Sales & Stock Matrix</h2></div><div class="table-wrap"><table><thead><tr><th rowspan="2">الصنف</th>${head}</tr><tr>${sub}</tr></thead><tbody>${rows}</tbody></table></div></section>`);bindFilters('products')}
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
