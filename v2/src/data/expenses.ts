import {supabase} from '../lib/supabase'
import {fetchAllPages} from './pagination'

export type ExpenseRow={id:string|number;branchId:string;date:string;category:string;group:string;amount:number;type:string;source:string;isExpense:boolean}
export type AccrualSetting={branch_id:string;month_start:string;wages:number;rent:number;working_days_basis:number;branch_manager:number;sector_manager:number;carried_expenses:number;commission_rate:number}

export async function getExpenses(params:{from:string;to:string;branchId?:string;month:string}){
 const [cash,petro,settings,daily]=await Promise.all([
  fetchAllPages<any>((fromRow,toRow)=>{
   let q=supabase.from('cash_entries').select('id,branch_id,entry_date,canonical_category,expense_group,amount,raw_payload,is_expense')
    .gte('entry_date',params.from).lte('entry_date',params.to).order('entry_date')
   if(params.branchId)q=q.eq('branch_id',params.branchId)
   return q.range(fromRow,toRow)
  }),
  fetchAllPages<any>((fromRow,toRow)=>{
   let q=supabase.from('vehicle_daily').select('id,branch_id,business_date,fuel_expense,other_expense,raw_payload')
    .gte('business_date',params.from).lte('business_date',params.to).contains('raw_payload',{non_cash:true})
   if(params.branchId)q=q.eq('branch_id',params.branchId)
   return q.range(fromRow,toRow)
  }),
  fetchAllPages<any>((fromRow,toRow)=>{
   let q=supabase.from('branch_expense_accrual_settings')
    .select('branch_id,month_start,wages,rent,working_days_basis,branch_manager,sector_manager,carried_expenses,commission_rate')
    .eq('month_start',params.month+'-01')
   if(params.branchId)q=q.eq('branch_id',params.branchId)
   return q.range(fromRow,toRow)
  }),
  fetchAllPages<any>((fromRow,toRow)=>{
   let q=supabase.from('v_branch_daily_kpis').select('branch_id,business_date')
    .gte('business_date',params.from).lte('business_date',params.to)
   if(params.branchId)q=q.eq('branch_id',params.branchId)
   return q.range(fromRow,toRow)
  })
 ])
 const daysBy=new Map<string,Set<string>>()
 for(const r of daily){const s=daysBy.get(r.branch_id)||new Set<string>();s.add(String(r.business_date));daysBy.set(r.branch_id,s)}
 const accrualRows:ExpenseRow[]=[]
 for(const s of settings){
  const basis=Math.max(1,Number(s.working_days_basis||30))
  const elapsed=Math.min((daysBy.get(s.branch_id)||new Set()).size,basis)
  const ratio=elapsed/basis
  const wages=(Number(s.wages||0)+Number(s.branch_manager||0)+Number(s.sector_manager||0))*ratio
  const rent=Number(s.rent||0)*ratio
  if(wages)accrualRows.push({id:'w-'+s.branch_id,branchId:s.branch_id,date:params.to,category:'أجور ومرتبات',group:'اجور وحوافز وعمولات',amount:wages,type:'تشغيلي',source:'استحقاق شهري',isExpense:true})
  if(rent)accrualRows.push({id:'r-'+s.branch_id,branchId:s.branch_id,date:params.to,category:'إيجارات',group:'تشغيل ومرافق',amount:rent,type:'تشغيلي',source:'استحقاق شهري',isExpense:true})
 }
 const rows:ExpenseRow[]=[
  ...cash.map(r=>({id:r.id,branchId:r.branch_id,date:r.entry_date,category:r.canonical_category||'غير مصنف',group:r.expense_group||'غير مصنف',amount:Number(r.amount||0),type:r.is_expense?(r.raw_payload?.manual_expense_type||'تلقائي'):'غير مصروف',source:'الخزينة',isExpense:Boolean(r.is_expense)})),
  ...petro.map(r=>({id:'p-'+r.id,branchId:r.branch_id,date:r.business_date,category:'بترو اب',group:'مصروفات السيارات',amount:Number(r.fuel_expense||0)+Number(r.other_expense||0),type:'تشغيلي',source:'بترو اب',isExpense:true})),
  ...accrualRows
 ]
 return {rows,settings:settings as AccrualSetting[]}
}

export async function saveAccrual(input:{branchId:string;month:string;wages:number;rent:number;workingDays:number;branchManager?:number;sectorManager?:number;carriedExpenses?:number;commissionRate?:number}){
 const {data:{session}}=await supabase.auth.getSession()
 if(!session)throw new Error('انتهت جلسة الدخول')
 const res=await fetch(import.meta.env.VITE_SUPABASE_URL+'/functions/v1/ammco-admin-cash',{
  method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},
  body:JSON.stringify({action:'set_accrual_settings',branch_id:input.branchId,month_start:input.month+'-01',wages:input.wages,rent:input.rent,working_days_basis:input.workingDays,...(input.branchManager===undefined?{}:{branch_manager:input.branchManager}),...(input.sectorManager===undefined?{}:{sector_manager:input.sectorManager}),...(input.carriedExpenses===undefined?{}:{carried_expenses:input.carriedExpenses}),...(input.commissionRate===undefined?{}:{commission_rate:input.commissionRate})})
 })
 const out=await res.json()
 if(!res.ok)throw new Error(out.error||'تعذر حفظ الإعدادات')
 return out
}

export async function setExpenseType(ids:number[],expenseType:'تشغيلي'|'غير تشغيلي',label:string){
 const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('انتهت جلسة الدخول')
 const res=await fetch(import.meta.env.VITE_SUPABASE_URL+'/functions/v1/ammco-admin-cash',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({action:'set_expense_type',ids,expense_type:expenseType,label})})
 const out=await res.json();if(!res.ok)throw new Error(out.error||'تعذر تغيير نوع المصروف');return out
}
