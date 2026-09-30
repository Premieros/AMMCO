import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm'
import { parseWorkbookBrowser } from './workbook-parser.js'

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

function shell(title,subtitle,body){
 const r=route()
 app.innerHTML=`<div class="shell">
 <aside class="sidebar">
  <div class="brand"><div class="logo">A</div><div><b>AMMCO</b><small>Management Intelligence</small></div></div>
  <div class="nav-title">الرئيسية</div><nav class="nav"><a class="${r==='dashboard'?'active':''}" href="#/dashboard">لوحة الإدارة</a></nav>
  <div class="nav-title">تقارير الإدارة</div><nav class="nav">
   <a class="${r==='executive'?'active':''}" href="#/executive">التقرير التنفيذي</a>
   <a class="${r==='sales'?'active':''}" href="#/sales">المبيعات</a>
   <a class="${r==='reps'?'active':''}" href="#/reps">أداء المناديب</a>
   <a class="${r==='expenses'?'active':''}" href="#/expenses">تفاصيل المصروفات</a>
   <a class="${r==='expense-matrix'?'active':''}" href="#/expense-matrix">مصفوفة المصروفات</a>
   <a class="${r==='receivables'?'active':''}" href="#/receivables">المديونيات والتحصيل</a>
   <a class="${r==='inventory'?'active':''}" href="#/inventory">حركة المخزون</a>
   <a class="${r==='products'?'active':''}" href="#/products">مصفوفة الأصناف</a>
   <a class="${r==='monthly'?'active':''}" href="#/monthly">التحليل الشهري وYTD</a>
   <a class="${r==='banks'?'active':''}" href="#/banks">البنوك وYTD</a>
  </nav>
  <div class="nav-title">التشغيل والمراجعة</div><nav class="nav">
   <a class="${r==='treasury'?'active':''}" href="#/treasury">الخزينة والبنوك</a>
   <a class="${r==='accounting-inputs'?'active':''}" href="#/accounting-inputs">إدخالات المحاسب والتوجيه</a>
  </nav>
  <div class="nav-title">الإدارة</div><nav class="nav">
   <a class="${r==='branches'?'active':''}" href="#/branches">إدارة الفروع</a>
   ${profile?.role==='admin'?`<a class="${r==='users'?'active':''}" href="#/users">المستخدمون والصلاحيات</a>`:''}
   <a class="${r==='imports'?'active':''}" href="#/imports">سجل الرفع</a>
   <a class="${r==='uploads'?'active':''}" href="#/uploads">رفع شيت</a>
  </nav>
 </aside>
 <main class="main"><header class="topbar"><div><b>مركز الإدارة</b></div><div class="actions"><button class="btn secondary" onclick="location.hash='#/branches'">+ إضافة فرع</button><button class="btn" onclick="location.hash='#/uploads'">رفع شيت</button><button class="btn secondary" id="logout">خروج</button></div></header>
 <section class="content"><div class="pagehead"><div><h1>${title}</h1><div class="muted">${subtitle||''}</div></div></div>${body}</section></main></div>`
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
 const filterRow=cols.map((col,index)=>{
  if(col.filter===false)return '<th></th>'
  const values=[...new Set(rows.map(r=>String(r[col.key]??'').replace(/<[^>]*>/g,'').trim()).filter(Boolean))]
  if(values.length>0&&values.length<=24){
   return `<th><select class="col-filter" data-col="${index}" onchange="applyTableFilters(this)"><option value="">الكل</option>${values.sort((a,b)=>a.localeCompare(b,'ar',{numeric:true})).map(v=>`<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('')}</select></th>`
  }
  return `<th><input class="col-filter" data-col="${index}" placeholder="فلتر…" oninput="applyTableFilters(this)"></th>`
 }).join('')
 return `<section class="table-card"><div class="table-head"><div><h2>${title}</h2><small>${rows.length} صف</small></div><div class="table-tools"><input class="search" placeholder="بحث…" oninput="applyTableFilters(this)"><button class="tool-btn" type="button" onclick="clearTableFilters(this)">مسح الفلاتر</button><button class="tool-btn" type="button" onclick="exportVisibleTable(this)">CSV</button><button class="tool-btn" type="button" onclick="window.print()">طباعة</button></div></div><div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${c.label}<span class="filter-mark">⌄</span></th>`).join('')}</tr><tr class="column-filter-row">${filterRow}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td class="${c.num?'num':''} ${c.key==='branch_name'?'row-label':''}">${r[c.key]??'-'}</td>`).join('')}</tr>`).join('')}${totalRow}</tbody></table></div></section>`
}
window.applyTableFilters=source=>{
 const card=source.closest('.table-card'),q=(card.querySelector('.search')?.value||'').trim().toLowerCase(),filters=[...card.querySelectorAll('.col-filter')]
 const rows=[...card.querySelectorAll('tbody tr:not(.total)')]
 rows.forEach(row=>{
  const cells=[...row.children]
  const globalOk=!q||row.innerText.toLowerCase().includes(q)
  const colsOk=filters.every(f=>{const v=(f.value||'').trim().toLowerCase();if(!v)return true;const cell=(cells[Number(f.dataset.col)]?.innerText||'').trim().toLowerCase();return f.tagName==='SELECT'?cell===v:cell.includes(v)})
  row.style.display=globalOk&&colsOk?'':'none'
 })
}
window.filterTable=input=>window.applyTableFilters(input)
window.clearTableFilters=button=>{const card=button.closest('.table-card');card.querySelectorAll('.search,.col-filter').forEach(el=>el.value='');window.applyTableFilters(card.querySelector('.search'))}
window.resetReportFilters=()=>{const r=route().split('?')[0];location.hash=`#/${r}`}
window.exportVisibleTable=button=>{
 const card=button.closest('.table-card'),rows=[...card.querySelectorAll('tr')].filter(r=>r.style.display!=='none')
 const csv='\uFEFF'+rows.map(r=>[...r.children].map(c=>`"${c.innerText.replace(/"/g,'""')}"`).join(',')).join('\n')
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a')
 a.href=url;a.download=(card.querySelector('h2')?.innerText||'AMMCO-report')+'.csv';a.click();URL.revokeObjectURL(url)
}

async function render(){
 if(!session) return renderLogin()
 if(!profile?.is_active) return shell('AMMCO','الحساب غير مهيأ أو غير نشط','<div class="notice">راجع مدير النظام لربط الحساب بالمؤسسة.</div>')
 const r=route().split('?')[0]
 try{
  if(r==='branches')return renderBranches()
  if(r==='users')return renderUsers()
  if(r==='treasury')return renderTreasury()
  if(r==='accounting-inputs')return renderAccountingInputs()
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
 const rows=rawRows.map(x=>({...x,net:money(x.net),coll:money(x.coll),disc:money(x.disc),exp:money(x.exp),debt:money(x.debt)}))
 const totalRow=`<tr class="total"><th>إجمالي الشركة</th><th class="num">${money(totals.net)}</th><th class="num">${money(totals.coll)}</th><th class="num">${money(totals.disc)}</th><th class="num">${money(totals.exp)}</th><th class="num">${money(companyDebt)}</th></tr>`
 shell('مركز الإدارة','ملخص أداء الفروع',filters(from,to,branch)+scope(from,to,branch)+`<section class="kpis dashboard-kpis">
  <div class="kpi"><span>صافي المبيعات</span><strong>${money(totals.net)}</strong></div>
  <div class="kpi"><span>التحصيل</span><strong>${money(totals.coll)}</strong></div>
  <div class="kpi"><span>الخصومات</span><strong>${money(totals.disc)}</strong></div>
  <div class="kpi"><span>المصروفات</span><strong>${money(totals.exp)}</strong></div>
 </section>`+table('مقارنة الفروع',[{key:'branch_name',label:'الفرع'},{key:'net',label:'صافي البيع',num:1},{key:'coll',label:'التحصيل',num:1},{key:'disc',label:'الخصم',num:1},{key:'exp',label:'المصروفات',num:1},{key:'debt',label:'مديونية آخر',num:1}],rows,totalRow));bindFilters('dashboard')
}
async function renderExecutive(){const {branch,from,to}=currentFilters();const daily=await loadDaily(branch,from,to);const by=new Map();daily.forEach(r=>{const k=r.branch_id;const x=by.get(k)||{branch_name:r.branch_name,gross:0,disc:0,net:0,coll:0,open:+r.opening_receivables||0,debt:0,exp:0};x.gross+=+r.gross_sales||0;x.disc+=+r.discounts||0;x.net+=+r.net_sales||0;x.coll+=+r.collections||0;x.exp+=+r.expenses||0;x.debt=+r.closing_receivables||x.debt;by.set(k,x)});const rows=[...by.values()].map(x=>({...x,gross:money(x.gross),disc:money(x.disc),net:money(x.net),coll:money(x.coll),open:money(x.open),debt:money(x.debt),exp:money(x.exp)}));shell('التقرير التنفيذي','مقارنة الإدارة حسب الفروع',filters(from,to,branch)+scope(from,to,branch)+table('الملخص التنفيذي',[{key:'branch_name',label:'الفرع'},{key:'gross',label:'قبل الخصم',num:1},{key:'disc',label:'الخصم',num:1},{key:'net',label:'صافي البيع',num:1},{key:'coll',label:'التحصيل',num:1},{key:'open',label:'مديونية أول',num:1},{key:'debt',label:'مديونية آخر',num:1},{key:'exp',label:'المصروفات',num:1}],rows));bindFilters('executive')}
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
