'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function correctExpense(formData: FormData) {
  const id = Number(formData.get('id'))
  const canonicalCategory = String(formData.get('canonical_category') ?? '').trim()
  const expenseGroup = String(formData.get('expense_group') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim()

  if (!Number.isFinite(id) || id <= 0) {
    redirect('/expenses?error=' + encodeURIComponent('حركة غير صالحة'))
  }

  if (!reason) {
    redirect(`/expenses/${id}?error=${encodeURIComponent('سبب التصحيح مطلوب')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('correct_cash_entry', {
    p_cash_entry_id: id,
    p_canonical_category: canonicalCategory,
    p_expense_group: expenseGroup,
    p_reason: reason,
  })

  if (error) {
    redirect(`/expenses/${id}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/')
  revalidatePath('/expenses')
  revalidatePath(`/expenses/${id}`)
  redirect(`/expenses/${id}?success=${encodeURIComponent('تم حفظ التصحيح وتسجيله في سجل المراجعة')}`)
}
