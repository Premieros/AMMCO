import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'
import { saveAccrualSettings } from './actions'

export const dynamic='force-dynamic'

function n(v:unknown){return Number(v??0)}
function money(v:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'EGP',maximumFractionDigits:0}).format(v)}
function pct(v:number){return `${new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v*100)}%`}
function monthEnd(month:string){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)}
function workdays(from:string,to:string){let count=0;for(let d=new Date(from+'T00:00:00Z'),end=new Date(to+'T00:00:00Z');d<=end;d.setUTCDate(d.getUTCDate()+1)){if(d.getUTCDay()!==5)count+=1}return count}

type Setting={branch_id:string;wages:number;branch_manager:number;sector_manager:number;rent:number;carried_expenses:number;commission_rate:number;working_days_basis:number}
type Daily={branch_id:string|null;net_sales:number|null}
type Expense={branch_id:string;amount:number}

export default async function AccruedExpenses({searchParams}:{searchParams:Promise<{branch?:string;month?:string;success?:string;error?:string}>}){
 const f=await searchParams;const today=new Date().toISOString().slice(0,10);const month=f.month??today.slice(0,7);const from=`${month}-01`;const end=monthEnd(month);const asOf=today<from?from:(today<end?today:end)
 const supabase=await createClient();const {data:auth}=await supabase.auth.getClaims();const userId=auth?.claims?.sub;if(!userId)redirect('/login')
 const [{data:profile},{data:branches}]=await Promise.all([supabase.from('profiles').select('role').eq('user_id',userId).maybeSingle(),supabase.from('branches').select('id,name').eq('is_active',true).order('name')])
 const selectedBranch=f.branch??branches?.[0]?.id??''
 let settingsQuery=supabase.from('branch_expense_accrual_settings').select('branch_id,wages,branch_manager,sector_manager,rent,carried_expenses,commission_rate,working_days_basis').eq('month_start',from)
 let dailyQuery=supabase.from('v_branch_daily_kpis').select('branch_id,net_sales').gte('business_date',from).lte('business_date',asOf)
 let expenseQuery=supabase.from('v_expense_analysis').select('branch_id,amount').gte('entry_date',from).lte('entry_date',asOf)
 if(selectedBranch){settingsQuery=settingsQuery.eq('branch_id',selectedBranch);dailyQuery=dailyQuery.eq('branch_id',selectedBranch);expenseQuery=expenseQuery.eq('branch_id',selectedBranch)}
 const [{data:settingData,error:settingError},{data:dailyData},{data:expenseData}]=await Promise.all([settingsQuery.maybeSingle(),dailyQuery,expenseQuery])
 const setting=(settingData??null) as Setting|null;const daily=(dailyData??[]) as Daily[];const expenses=(expenseData??[]) as Expense[]
 const sales=daily.reduce((s,r)=>s+n(r.net_sales),0);const cash=expenses.reduce((s,r)=>s+n(r.amount),0)
 const monthlyFixed=n(setting?.wages)+n(setting?.branch_manager)+n(setting?.sector_manager)+n(setting?.rent);const basis=n(setting?.working_days_basis)||26;const elapsed=workdays(from,asOf)
 const accruedToDate=monthlyFixed/basis*elapsed+n(setting?.carried_expenses);const commission=sales*n(setting?.commission_rate);const analyticalTotal=cash+accruedToDate+commission
 return <AppShell title="المستحق مقابل النقدي" subtitle="بديل قاعدة البيانات لمعادلات تحليلي المصروفات في ملف الإدارة المرجعي">
  <form className="card filters" method="get"><div className="field"><label>الفرع</label><select name="branch" defaultValue={selectedBranch}>{(branches??[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div className="field"><label>الشهر</label><input type="month" name="month" defaultValue={month}/></div><div className="field filter-action"><label>&nbsp;</label><button className="btn">تطبيق</button></div></form>
  {f.success&&<div className="notice">{f.success}</div>}{f.error&&<div className="notice">{f.error}</div>}{settingError&&<div className="notice">إعدادات المستحقات تحتاج تطبيق Migration قبل الاستخدام الفعلي.</div>}
  <section className="grid portal-kpis"><div className="card"><div className="kpi-label">مصروف نقدي فعلي</div><div className="kpi-value">{money(cash)}</div></div><div className="card"><div className="kpi-label">مستحق حتى {asOf}</div><div className="kpi-value">{money(accruedToDate)}</div><div className="muted">{elapsed} يوم عمل من أساس {basis}</div></div><div className="card"><div className="kpi-label">عمولة محسوبة</div><div className="kpi-value">{money(commission)}</div><div className="muted">{pct(n(setting?.commission_rate))} × صافي المبيعات</div></div><div className="card"><div className="kpi-label">الإجمالي التحليلي</div><div className="kpi-value">{money(analyticalTotal)}</div><div className="muted">نقدي + مستحق + عمولة</div></div></section>
  <section className="card"><div className="section-head"><h2>تفصيل المستحق الشهري</h2><span className="muted">النموذج المرجعي: إجمالي المستحق ÷ أيام الأساس × أيام العمل + المرحلة</span></div><div className="table-wrap"><table><thead><tr><th>أجور</th><th>مدير الفرع</th><th>مدير القطاع</th><th>إيجار</th><th>إجمالي شهري</th><th>مرحّل</th><th>مستحق حتى التاريخ</th></tr></thead><tbody><tr><td>{money(n(setting?.wages))}</td><td>{money(n(setting?.branch_manager))}</td><td>{money(n(setting?.sector_manager))}</td><td>{money(n(setting?.rent))}</td><td>{money(monthlyFixed)}</td><td>{money(n(setting?.carried_expenses))}</td><td>{money(accruedToDate)}</td></tr></tbody></table></div></section>
  {profile?.role==='admin'&&<section className="card"><div className="section-head"><h2>إعدادات الشهر</h2></div><form action={saveAccrualSettings} className="filters"><input type="hidden" name="branch_id" value={selectedBranch}/><input type="hidden" name="month" value={month}/>{[['wages','أجور',setting?.wages],['branch_manager','مدير الفرع',setting?.branch_manager],['sector_manager','مدير القطاع',setting?.sector_manager],['rent','إيجار',setting?.rent],['carried_expenses','مصروفات مرحلة',setting?.carried_expenses]].map(([name,label,value])=><div className="field" key={String(name)}><label>{String(label)}</label><input name={String(name)} type="number" step="0.01" defaultValue={n(value)}/></div>)}<div className="field"><label>العمولة %</label><input name="commission_rate" type="number" step="0.01" defaultValue={n(setting?.commission_rate)*100||3}/></div><div className="field"><label>أيام الأساس</label><input name="working_days_basis" type="number" min="1" max="31" defaultValue={basis}/></div><div className="field filter-action"><label>&nbsp;</label><button className="btn">حفظ الإعدادات</button></div></form></section>}
 </AppShell>
}
