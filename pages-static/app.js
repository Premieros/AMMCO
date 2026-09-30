import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL='https://yumeijsyiphzdsulsubf.supabase.co'
const SUPABASE_KEY='sb_publishable_ktXP7ss_qK6hZFmKybHw8A_89guYEK9'
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
const app=document.getElementById('app')
const fmt=new Intl.NumberFormat('en-US',{maximumFractionDigits:2})
const money=v=>fmt.format(Number(v||0))
const pct=v=>`${fmt.format(Number(v||0)*100)}%`
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
   <a class="${r==='expenses'?'active':''}" href="#/expenses">المصروفات</a>
   <a class="${r==='inventory'?'active':''}" href="#/inventory">حركة المخزون</a>
   <a class="${r==='products'?'active':''}" href="#/products">مصفوفة الأصناف</a>
  </nav>
  <div class="nav-title">البيانات</div><nav class="nav">
   <a class="${r==='branches'?'active':''}" href="#/branches">إدارة الفروع</a>
   <a class="${r==='imports'?'active':''}" href="#/imports">سجل الرفع</a>
   <a class="${r==='uploads'?'active':''}" href="#/uploads">رفع شيت</a>
  </nav>
 </aside>
 <main class="main"><header class="topbar"><div><b>مركز الإدارة</b></div><div class="actions"><button class="btn secondary" onclick="location.hash='#/branches'">+ إضافة فرع</button><button class="btn" onclick="location.hash='#/uploads'">رفع شيت</button><button class="btn secondary" id="logout">خروج</button></div></header>
 <section class="content"><div class="pagehead"><div><h1>${title}</h1><div class="muted">${subtitle||''}</div></div></div>${body}</section></main></div>`
 document.getElementById('logout')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.hash='';})
}

function branchOptions(selected=''){return `<option value="">كل الفروع</option>${branches.map(b=>`<option value="${b.id}" ${selected===b.id?'selected':''}>${b.name}</option>`).join('')}`}
function filters(from,to,branch){return `<form id="filters" class="filters"><div class="field"><label>الفرع</label><select name="branch">${branchOptions(branch)}</select></div><div class="field"><label>من</label><input type="date" name="from" value="${from}"></div><div class="field"><label>إلى</label><input type="date" name="to" value="${to}"></div><div class="field"><label>&nbsp;</label><button class="btn">تطبيق</button></div></form>`}
function bindFilters(path){document.getElementById('filters')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);location.hash=`#/${path}?branch=${f.get('branch')||''}&from=${f.get('from')}&to=${f.get('to')}`})}
function scope(from,to,branch){return `<div class="scope"><span class="chip">الفرع: <b>${branches.find(b=>b.id===branch)?.name||'كل الفروع'}</b></span><span class="chip">الفترة: <b>${from} → ${to}</b></span><span class="chip">المصدر: <b>النسخ المعتمدة فقط</b></span></div>`}
function table(title,cols,rows,totalRow=''){return `<section class="table-card"><div class="table-head"><h2>${title}</h2><input class="search" placeholder="بحث داخل التقرير" oninput="filterTable(this)"></div><div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${c.label}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td class="${c.num?'num':''} ${c.key==='branch_name'?'row-label':''}">${r[c.key]??'-'}</td>`).join('')}</tr>`).join('')}${totalRow}</tbody></table></div></section>`}
window.filterTable=input=>{const q=input.value.trim().toLowerCase();const tbody=input.closest('.table-card').querySelector('tbody');[...tbody.rows].forEach(r=>r.style.display=r.innerText.toLowerCase().includes(q)?'':'none')}

async function render(){
 if(!session) return renderLogin()
 if(!profile?.is_active) return shell('AMMCO','الحساب غير مهيأ أو غير نشط','<div class="notice">راجع مدير النظام لربط الحساب بالمؤسسة.</div>')
 const r=route().split('?')[0]
 try{
  if(r==='branches')return renderBranches()
  if(r==='sales')return renderSales()
  if(r==='expenses')return renderExpenses()
  if(r==='reps')return renderReps()
  if(r==='inventory')return renderInventory()
  if(r==='products')return renderProducts()
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
 const rows=[...by.values()].map(x=>({...x,net:money(x.net),coll:money(x.coll),disc:money(x.disc),exp:money(x.exp),debt:money(x.debt)}))
 shell('مركز الإدارة','صورة تنفيذية موحدة لأداء الفروع',filters(from,to,branch)+scope(from,to,branch)+`<section class="kpis"><div class="kpi"><span>صافي المبيعات</span><strong>${money(totals.net)}</strong></div><div class="kpi"><span>التحصيل</span><strong>${money(totals.coll)}</strong></div><div class="kpi"><span>الخصومات</span><strong>${money(totals.disc)}</strong></div><div class="kpi"><span>المصروفات</span><strong>${money(totals.exp)}</strong></div></section>`+table('مقارنة الفروع',[{key:'branch_name',label:'الفرع'},{key:'net',label:'صافي البيع',num:1},{key:'coll',label:'التحصيل',num:1},{key:'disc',label:'الخصم',num:1},{key:'exp',label:'المصروفات',num:1},{key:'debt',label:'مديونية آخر',num:1}],rows));bindFilters('dashboard')
}
async function renderExecutive(){const {branch,from,to}=currentFilters();const daily=await loadDaily(branch,from,to);const by=new Map();daily.forEach(r=>{const k=r.branch_id;const x=by.get(k)||{branch_name:r.branch_name,gross:0,disc:0,net:0,coll:0,open:+r.opening_receivables||0,debt:0,exp:0};x.gross+=+r.gross_sales||0;x.disc+=+r.discounts||0;x.net+=+r.net_sales||0;x.coll+=+r.collections||0;x.exp+=+r.expenses||0;x.debt=+r.closing_receivables||x.debt;by.set(k,x)});const rows=[...by.values()].map(x=>({...x,gross:money(x.gross),disc:money(x.disc),net:money(x.net),coll:money(x.coll),open:money(x.open),debt:money(x.debt),exp:money(x.exp)}));shell('التقرير التنفيذي','مقارنة الإدارة حسب الفروع',filters(from,to,branch)+scope(from,to,branch)+table('الملخص التنفيذي',[{key:'branch_name',label:'الفرع'},{key:'gross',label:'قبل الخصم',num:1},{key:'disc',label:'الخصم',num:1},{key:'net',label:'صافي البيع',num:1},{key:'coll',label:'التحصيل',num:1},{key:'open',label:'مديونية أول',num:1},{key:'debt',label:'مديونية آخر',num:1},{key:'exp',label:'المصروفات',num:1}],rows));bindFilters('executive')}
async function renderSales(){const {branch,from,to}=currentFilters();const daily=await loadDaily(branch,from,to);const rows=daily.map(r=>({business_date:r.business_date,branch_name:r.branch_name,gross:money(r.gross_sales),discounts:money(r.discounts),net:money(r.net_sales),collections:money(r.collections),expenses:money(r.expenses)}));shell('تقرير المبيعات','تفاصيل المبيعات اليومية حسب الفرع',filters(from,to,branch)+scope(from,to,branch)+table('المبيعات اليومية',[{key:'business_date',label:'التاريخ'},{key:'branch_name',label:'الفرع'},{key:'gross',label:'قبل الخصم',num:1},{key:'discounts',label:'الخصم',num:1},{key:'net',label:'صافي البيع',num:1},{key:'collections',label:'التحصيل',num:1},{key:'expenses',label:'المصروفات',num:1}],rows));bindFilters('sales')}
async function renderExpenses(){const {branch,from,to}=currentFilters();let q=supabase.from('v_expense_analysis').select('entry_date,branch_id,branch_name,canonical_category,expense_group,description,amount').gte('entry_date',from).lte('entry_date',to).order('entry_date');if(branch)q=q.eq('branch_id',branch);const {data,error}=await q;if(error)throw error;const rows=(data||[]).map(r=>({...r,amount:money(r.amount)}));shell('تفاصيل المصروفات','كل بند مع الفرع والمجموعة',filters(from,to,branch)+scope(from,to,branch)+table('المصروفات',[{key:'entry_date',label:'التاريخ'},{key:'branch_name',label:'الفرع'},{key:'canonical_category',label:'البند'},{key:'expense_group',label:'المجموعة'},{key:'description',label:'البيان'},{key:'amount',label:'القيمة',num:1}],rows));bindFilters('expenses')}
async function renderReps(){const {branch,from,to}=currentFilters();const ids=await approvedIds();let q=supabase.from('sales_rep_daily').select('branch_id,business_date,rep_name,sales_before_discount,net_after_discount,discounts,deposit_amount,closing_balance').in('batch_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']).gte('business_date',from).lte('business_date',to);if(branch)q=q.eq('branch_id',branch);const {data,error}=await q;if(error)throw error;const names=new Map(branches.map(b=>[b.id,b.name]));const by=new Map();(data||[]).forEach(r=>{const k=`${r.branch_id}:${r.rep_name}`;const x=by.get(k)||{branch_name:names.get(r.branch_id),rep_name:r.rep_name,gross:0,net:0,disc:0,deposit:0,closing:0};x.gross+=+r.sales_before_discount||0;x.net+=+r.net_after_discount||0;x.disc+=+r.discounts||0;x.deposit+=+r.deposit_amount||0;x.closing=+r.closing_balance||x.closing;by.set(k,x)});const rows=[...by.values()].map(x=>({...x,gross:money(x.gross),net:money(x.net),disc:money(x.disc),deposit:money(x.deposit),closing:money(x.closing)}));shell('أداء المناديب','المندوب × الفرع',filters(from,to,branch)+scope(from,to,branch)+table('أداء المناديب',[{key:'branch_name',label:'الفرع'},{key:'rep_name',label:'المندوب'},{key:'gross',label:'قبل الخصم',num:1},{key:'disc',label:'الخصم',num:1},{key:'net',label:'صافي البيع',num:1},{key:'deposit',label:'التوريد',num:1},{key:'closing',label:'الرصيد',num:1}],rows));bindFilters('reps')}
async function renderInventory(){const {branch,from,to}=currentFilters();const ids=await approvedIds();let q=supabase.from('inventory_daily').select('branch_id,business_date,product_name,opening_qty,incoming_factory_qty,incoming_branches_qty,sales_qty,bonus_qty,gifts_qty,damages_qty,return_factory_qty,outgoing_branches_qty,adjustments_qty,closing_qty,closing_value').in('batch_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']).gte('business_date',from).lte('business_date',to);if(branch)q=q.eq('branch_id',branch);const {data,error}=await q;if(error)throw error;const names=new Map(branches.map(b=>[b.id,b.name]));const rows=(data||[]).slice(0,5000).map(r=>({branch_name:names.get(r.branch_id),business_date:r.business_date,product_name:r.product_name,opening:money(r.opening_qty),factory:money(r.incoming_factory_qty),sales:money(r.sales_qty),closing:money(r.closing_qty),value:money(r.closing_value)}));shell('حركة المخزون','حركة الصنف حسب الفرع واليوم',filters(from,to,branch)+scope(from,to,branch)+table('حركة المخزون',[{key:'business_date',label:'التاريخ'},{key:'branch_name',label:'الفرع'},{key:'product_name',label:'الصنف'},{key:'opening',label:'رصيد أول',num:1},{key:'factory',label:'وارد مصنع',num:1},{key:'sales',label:'مبيعات',num:1},{key:'closing',label:'رصيد آخر',num:1},{key:'value',label:'قيمة الرصيد',num:1}],rows));bindFilters('inventory')}
async function renderProducts(){const {branch,from,to}=currentFilters();const ids=await approvedIds();let q=supabase.from('inventory_daily').select('branch_id,product_name,sales_qty,closing_qty,closing_value').in('batch_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']).gte('business_date',from).lte('business_date',to);if(branch)q=q.eq('branch_id',branch);const {data,error}=await q;if(error)throw error;const bset=branch?branches.filter(b=>b.id===branch):branches;const matrix=new Map();(data||[]).forEach(r=>{const x=matrix.get(r.product_name)||{};const c=x[r.branch_id]||{sales:0,closing:0,value:0};c.sales+=+r.sales_qty||0;c.closing=+r.closing_qty||c.closing;c.value=+r.closing_value||c.value;x[r.branch_id]=c;matrix.set(r.product_name,x)});const rows=[...matrix.entries()].map(([product,cells])=>{let html=`<td class="row-label">${product}</td>`;for(const b of bset){const c=cells[b.id]||{};html+=`<td class="num">${money(c.sales)}</td><td class="num">${money(c.closing)}</td><td class="num">${money(c.value)}</td>`}return `<tr>${html}</tr>`}).join('');const head=bset.map((b,i)=>`<th colspan="3" class="${i%2?'group-green':'group-blue'}">${b.name}</th>`).join('');const sub=bset.map(()=>'<th>بيع</th><th>رصيد</th><th>قيمة</th>').join('');shell('مصفوفة الأصناف','الصنف × الفروع',filters(from,to,branch)+scope(from,to,branch)+`<section class="table-card matrix"><div class="table-head"><h2>Product Sales & Stock Matrix</h2></div><div class="table-wrap"><table><thead><tr><th rowspan="2">الصنف</th>${head}</tr><tr>${sub}</tr></thead><tbody>${rows}</tbody></table></div></section>`);bindFilters('products')}
async function renderBranches(){const {data,error}=await supabase.from('branches').select('id,name,code,is_active,created_at,treasury_accounts(id,is_active)').order('created_at');if(error)throw error;const rows=(data||[]).map(b=>({name:b.name,code:b.code,status:b.is_active?'نشط':'متوقف',treasuries:(b.treasury_accounts||[]).filter(x=>x.is_active).length,created_at:new Date(b.created_at).toLocaleString('en-GB')}));const add=profile?.role==='admin'?`<section class="card" style="margin-bottom:14px"><h2>+ إضافة فرع جديد</h2><form id="add-branch" class="filters" style="margin:0"><div class="field"><label>اسم الفرع</label><input name="name" required></div><div class="field"><label>كود الفرع</label><input name="code" dir="ltr" required></div><div></div><div class="field"><label>&nbsp;</label><button class="btn">إنشاء الفرع</button></div></form><div id="branch-msg"></div></section>`:'';shell('إدارة الفروع','إضافة الفروع وإدارة الحالة',add+table('الفروع الحالية',[{key:'name',label:'الفرع'},{key:'code',label:'الكود'},{key:'status',label:'الحالة'},{key:'treasuries',label:'عدد الخزائن',num:1},{key:'created_at',label:'تاريخ الإنشاء'}],rows));document.getElementById('add-branch')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const {error}=await supabase.rpc('create_branch_with_default_treasury',{p_code:String(fd.get('code')).trim(),p_name:String(fd.get('name')).trim()});document.getElementById('branch-msg').innerHTML=error?`<div class="error">${error.message}</div>`:'<div class="success">تم إنشاء الفرع والخزنة الرئيسية.</div>';if(!error)boot()})}
async function renderImports(){const {data,error}=await supabase.from('import_batches').select('id,branch_id,original_file_name,period_start,period_end,version,status,uploaded_at,approved_at,branches(name)').order('uploaded_at',{ascending:false}).limit(300);if(error)throw error;const rows=(data||[]).map(r=>({branch_name:Array.isArray(r.branches)?r.branches[0]?.name:r.branches?.name,period:`${r.period_start} — ${r.period_end}`,file:r.original_file_name,version:r.version,status:r.status,uploaded_at:new Date(r.uploaded_at).toLocaleString('en-GB'),approved_at:r.approved_at?new Date(r.approved_at).toLocaleString('en-GB'):''}));shell('سجل الرفع','كل نسخ الشيتات وحالة الاعتماد',table('نسخ الشيتات',[{key:'branch_name',label:'الفرع'},{key:'period',label:'الفترة'},{key:'file',label:'الملف'},{key:'version',label:'الإصدار',num:1},{key:'status',label:'الحالة'},{key:'uploaded_at',label:'وقت الرفع'},{key:'approved_at',label:'وقت الاعتماد'}],rows))}
function renderUploads(){
 const branchOpts=branches.map(b=>`<option value="${b.id}">${b.name}</option>`).join('')
 shell('رفع شيت فرع','رفع آمن مباشرة إلى Supabase Edge Function',`
  <div id="upload-msg"></div>
  <section class="card">
   <div class="notice">ملف .xlsx فقط، بحد أقصى 25MB. يتم التحقق من المستخدم والفرع قبل حفظ الملف.</div>
   <form id="upload-form" class="filters" style="grid-template-columns:1fr 1fr 1fr 1.2fr auto">
    <div class="field"><label>الفرع</label><select name="branch_id" required><option value="">اختر الفرع</option>${branchOpts}</select></div>
    <div class="field"><label>من</label><input type="date" name="period_start" required></div>
    <div class="field"><label>إلى</label><input type="date" name="period_end" required></div>
    <div class="field"><label>ملف Excel</label><input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required></div>
    <div class="field"><label>&nbsp;</label><button class="btn" id="upload-btn">رفع الملف</button></div>
   </form>
   <div class="muted">المسار: Browser → Edge Function → Private Storage → Import Batch. المعالجة التفصيلية تنتقل الآن إلى Edge Function منفصلة.</div>
  </section>`)
 document.getElementById('upload-form')?.addEventListener('submit',async e=>{
  e.preventDefault()
  const button=document.getElementById('upload-btn'); const msg=document.getElementById('upload-msg')
  button.disabled=true; button.textContent='جاري الرفع…'; msg.innerHTML=''
  try{
   const fd=new FormData(e.currentTarget)
   const {data:{session:active}}=await supabase.auth.getSession()
   const res=await fetch(`${SUPABASE_URL}/functions/v1/ammco-import-upload`,{
    method:'POST',
    headers:{Authorization:`Bearer ${active.access_token}`,apikey:SUPABASE_KEY},
    body:fd
   })
   const out=await res.json()
   if(!res.ok) throw new Error(out.error||'تعذر رفع الملف')
   msg.innerHTML=`<div class="notice">تم رفع الإصدار ${out.version}. جاري تحليل الشيت والتحقق من البيانات…</div>`
   const processRes=await fetch(`${SUPABASE_URL}/functions/v1/ammco-import-process`,{
    method:'POST',
    headers:{Authorization:`Bearer ${active.access_token}`,apikey:SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({batchId:out.batchId})
   })
   const processed=await processRes.json()
   if(!processRes.ok) throw new Error(processed.error||'تم رفع الملف لكن تعذر تحليل محتواه')
   if(processed.status==='rejected'){
    msg.innerHTML=`<div class="error">تم حفظ الملف وتحليله، لكنه يحتاج مراجعة: ${processed.issues} ملاحظة تحقق.</div>`
   }else{
    msg.innerHTML=`<div class="success">تم رفع وتحليل الإصدار ${out.version} بنجاح: ${processed.sheets} صفحة، ${processed.rows} صف، ${processed.products} صنف.</div>`
   }
   e.currentTarget.reset()
  }catch(err){msg.innerHTML=`<div class="error">${err.message||err}</div>`}
  finally{button.disabled=false;button.textContent='رفع الملف'}
 })
}

boot()
