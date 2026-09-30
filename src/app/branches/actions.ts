'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function createBranch(formData: FormData) {
  const code = String(formData.get('code') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()

  if (!code || !name) {
    redirect('/branches?error=' + encodeURIComponent('اسم الفرع والكود مطلوبان'))
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_branch_with_default_treasury', {
    p_code: code,
    p_name: name,
  })

  if (error) {
    redirect('/branches?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/branches')
  revalidatePath('/uploads')
  redirect('/branches?success=' + encodeURIComponent('تم إنشاء الفرع والخزنة الرئيسية بنجاح'))
}
