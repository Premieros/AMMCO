import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const inputSchema = z.object({
  branchId: z.string().uuid(),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
})

function cleanFileName(name: string) {
  return name.replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 140)
}

export async function POST(request: Request) {
  const supabase = await createUserClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub

  if (!userId) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const formData = await request.formData()
  const replaceBatchId = formData.get('replace_batch_id') ? String(formData.get('replace_batch_id')) : null
  const historyMode = formData.get('history_mode') ? String(formData.get('history_mode')) : (replaceBatchId ? 'replace' : 'review')

  const parsed = inputSchema.safeParse({
    branchId: formData.get('branch_id'),
    periodStart: formData.get('period_start'),
    periodEnd: formData.get('period_end'),
  })

  if (!parsed.success) {
    return NextResponse.json({ error: 'بيانات الفرع أو الفترة غير صحيحة' }, { status: 400 })
  }

  if (parsed.data.periodEnd < parsed.data.periodStart) {
    return NextResponse.json({ error: 'نهاية الفترة يجب ألا تسبق البداية' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'ملف Excel مطلوب' }, { status: 400 })
  }

  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json({ error: 'المسموح ملفات .xlsx فقط' }, { status: 400 })
  }

  if (file.size <= 0 || file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'حجم الملف غير مسموح' }, { status: 400 })
  }

  const [{ data: profile }, { data: branch }] = await Promise.all([
    supabase.from('profiles').select('organization_id, role, is_active').eq('user_id', userId).maybeSingle(),
    supabase.from('branches').select('id, organization_id, is_active').eq('id', parsed.data.branchId).maybeSingle(),
  ])

  if (!profile?.is_active || !branch?.is_active || profile.organization_id !== branch.organization_id) {
    return NextResponse.json({ error: 'لا توجد صلاحية لهذا الفرع' }, { status: 403 })
  }

  if (profile.role === 'analyst') {
    return NextResponse.json({ error: 'صلاحية المحلل للعرض فقط' }, { status: 403 })
  }

  if (profile.role === 'branch_user') {
    const { data: access } = await supabase
      .from('user_branch_access')
      .select('branch_id')
      .eq('user_id', userId)
      .eq('branch_id', branch.id)
      .maybeSingle()

    if (!access) {
      return NextResponse.json({ error: 'لا توجد صلاحية رفع لهذا الفرع' }, { status: 403 })
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  const admin = createAdminClient()

  const { data: duplicate } = await admin
    .from('import_batches')
    .select('id, version, status')
    .eq('branch_id', branch.id)
    .eq('file_sha256', sha256)
    .maybeSingle()

  if (duplicate) {
    return NextResponse.json(
      { error: `هذا الملف مرفوع بالفعل كإصدار ${duplicate.version}` },
      { status: 409 },
    )
  }

  const { data: latest } = await admin
    .from('import_batches')
    .select('version')
    .eq('branch_id', branch.id)
    .eq('period_start', parsed.data.periodStart)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const version = (latest?.version ?? 0) + 1
  const safeName = cleanFileName(file.name)
  const storagePath = `${branch.id}/${parsed.data.periodStart.slice(0, 7)}/v${version}-${sha256.slice(0, 12)}-${safeName}`

  const { error: uploadError } = await admin.storage
    .from('branch-workbooks')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: 'فشل حفظ ملف Excel' }, { status: 500 })
  }

  const { data: batch, error: batchError } = await admin
    .from('import_batches')
    .insert({
      organization_id: branch.organization_id,
      branch_id: branch.id,
      period_start: parsed.data.periodStart,
      period_end: parsed.data.periodEnd,
      version,
      status: 'uploaded',
      original_file_name: file.name,
      storage_path: storagePath,
      file_sha256: sha256,
      replaces_batch_id: replaceBatchId,
      file_size_bytes: file.size,
      uploaded_by: userId,
      metadata: { source: 'web_upload', history_mode: historyMode },
    })
    .select('id, version')
    .single()

  if (batchError || !batch) {
    await admin.storage.from('branch-workbooks').remove([storagePath])
    return NextResponse.json({ error: 'فشل تسجيل عملية الرفع' }, { status: 500 })
  }

  return NextResponse.json({ batchId: batch.id, version: batch.version, historyMode })
}
