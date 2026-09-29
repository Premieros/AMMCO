'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function editTreasuryEntry(formData: FormData) {
  const id = Number(formData.get('id'))
  const description = String(formData.get('description') ?? '').trim()
  const canonicalCategory = String(formData.get('canonical_category') ?? '').trim()
  const expenseGroup = String(formData.get('expense_group') ?? '').trim()
  const treasuryAccountId = String(formData.get('treasury_account_id') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim()

  if (!Number.isFinite(id) || id <= 0) redirect('/treasury?error=' + encodeURIComponent('حركة غير صالحة'))
  if (!reason) redirect(`/treasury/${id}?error=${encodeURIComponent('سبب التعديل مطلوب')}`)

  const supabase = await createClient()
  const { error } = await supabase.rpc('edit_cash_entry', {
    p_cash_entry_id: id,
    p_description: description,
    p_canonical_category: canonicalCategory,
    p_expense_group: expenseGroup,
    p_treasury_account_id: treasuryAccountId,
    p_reason: reason,
  })

  if (error) redirect(`/treasury/${id}?error=${encodeURIComponent(error.message)}`)

  revalidatePath('/treasury')
  revalidatePath('/expenses')
  revalidatePath('/')
  revalidatePath(`/treasury/${id}`)
  redirect(`/treasury/${id}?success=${encodeURIComponent('تم حفظ التعديل في سجل المراجعة')}`)
}
