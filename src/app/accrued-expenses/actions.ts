'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function numberValue(formData: FormData, key: string) {
  const value = Number(String(formData.get(key) ?? '0').replace(/,/g, ''))
  return Number.isFinite(value) ? value : Number.NaN
}

export async function saveAccrualSettings(formData: FormData) {
  const branchId = String(formData.get('branch_id') ?? '')
  const month = String(formData.get('month') ?? '')
  const monthStart = /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : ''
  const wages = numberValue(formData, 'wages')
  const branchManager = numberValue(formData, 'branch_manager')
  const sectorManager = numberValue(formData, 'sector_manager')
  const rent = numberValue(formData, 'rent')
  const carriedExpenses = numberValue(formData, 'carried_expenses')
  const commissionRate = numberValue(formData, 'commission_rate') / 100
  const workingDaysBasis = numberValue(formData, 'working_days_basis')

  const values = [wages, branchManager, sectorManager, rent, carriedExpenses, commissionRate, workingDaysBasis]
  if (!branchId || !monthStart || values.some((value) => !Number.isFinite(value))) {
    redirect('/accrued-expenses?error=' + encodeURIComponent('بيانات الإعداد غير مكتملة'))
  }
  if ([wages, branchManager, sectorManager, rent].some((value) => value < 0) || commissionRate < 0 || commissionRate > 1 || workingDaysBasis < 1 || workingDaysBasis > 31) {
    redirect('/accrued-expenses?error=' + encodeURIComponent('تحقق من قيم المستحقات ومعدل العمولة وأيام الأساس'))
  }

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: targetBranch }] = await Promise.all([
    supabase.from('profiles').select('organization_id,role').eq('user_id', userId).maybeSingle(),
    supabase.from('branches').select('organization_id').eq('id', branchId).maybeSingle(),
  ])

  if (!profile || profile.role !== 'admin' || !targetBranch || targetBranch.organization_id !== profile.organization_id) {
    redirect('/accrued-expenses?error=' + encodeURIComponent('غير مصرح بتعديل المستحقات'))
  }

  const { error } = await supabase.from('branch_expense_accrual_settings').upsert({
    branch_id: branchId,
    organization_id: profile.organization_id,
    month_start: monthStart,
    wages,
    branch_manager: branchManager,
    sector_manager: sectorManager,
    rent,
    carried_expenses: carriedExpenses,
    commission_rate: commissionRate,
    working_days_basis: workingDaysBasis,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'branch_id,month_start' })

  if (error) redirect('/accrued-expenses?error=' + encodeURIComponent(error.message))

  revalidatePath('/accrued-expenses')
  redirect(`/accrued-expenses?branch=${encodeURIComponent(branchId)}&month=${month}&success=${encodeURIComponent('تم حفظ إعدادات المستحقات')}`)
}
