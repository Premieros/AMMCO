
import { createClient } from 'npm:@supabase/supabase-js@2.117.2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'غير مصرح' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const publishable = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')!)[ 'default' ]
  const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)[ 'default' ]
  const userClient = createClient(url, publishable, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: userData, error: userError } = await userClient.auth.getUser()
  const userId = userData?.user?.id
  if (userError || !userId) return json({ error: 'غير مصرح' }, 401)

  let form: FormData
  try { form = await req.formData() } catch { return json({ error: 'بيانات الرفع غير صالحة' }, 400) }

  const branchId = String(form.get('branch_id') ?? '')
  const periodStart = String(form.get('period_start') ?? '')
  const periodEnd = String(form.get('period_end') ?? '')
  const file = form.get('file')
  const parsedCache = form.get('parsed_cache')

  if (!/^[0-9a-f-]{36}$/i.test(branchId) || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return json({ error: 'بيانات الفرع أو الفترة غير صحيحة' }, 400)
  if (periodEnd < periodStart) return json({ error: 'نهاية الفترة يجب ألا تسبق البداية' }, 400)
  if (!(file instanceof File)) return json({ error: 'ملف Excel مطلوب' }, 400)
  if (!file.name.toLowerCase().endsWith('.xlsx')) return json({ error: 'المسموح ملفات .xlsx فقط' }, 400)
  if (file.size <= 0 || file.size > 25 * 1024 * 1024) return json({ error: 'حجم الملف غير مسموح' }, 400)
  if (parsedCache !== null && (!(parsedCache instanceof File) || parsedCache.size <= 0 || parsedCache.size > 40 * 1024 * 1024)) return json({ error: 'نسخة التحليل المؤقتة غير صالحة' }, 400)

  const [{ data: profile }, { data: branch }] = await Promise.all([
    userClient.from('profiles').select('organization_id,role,is_active').eq('user_id', userId).maybeSingle(),
    userClient.from('branches').select('id,organization_id,is_active').eq('id', branchId).maybeSingle(),
  ])
  if (!profile?.is_active || !branch?.is_active || profile.organization_id !== branch.organization_id) return json({ error: 'لا توجد صلاحية لهذا الفرع' }, 403)
  if (profile.role === 'analyst') return json({ error: 'صلاحية المحلل للعرض فقط' }, 403)
  if (profile.role === 'branch_user') {
    const { data: access } = await userClient.from('user_branch_access').select('branch_id').eq('user_id', userId).eq('branch_id', branchId).maybeSingle()
    if (!access) return json({ error: 'لا توجد صلاحية رفع لهذا الفرع' }, 403)
  }

  const buffer = await file.arrayBuffer()
  const sha256 = await sha256Hex(buffer)
  const { data: duplicate } = await admin.from('import_batches').select('id,version,status,storage_path').eq('branch_id', branchId).eq('file_sha256', sha256).maybeSingle()
  if (duplicate) {
    if (['uploaded','processing','failed','rejected','validated'].includes(duplicate.status)) {
      if (parsedCache instanceof File && duplicate.storage_path) {
        const { error: cacheError } = await admin.storage.from('branch-workbooks').upload(
          `${duplicate.storage_path}.parsed.json`,
          await parsedCache.arrayBuffer(),
          { contentType: 'application/json', upsert: true },
        )
        if (cacheError) return json({ error: 'فشل حفظ نسخة التحليل المؤقتة', detail: cacheError.message }, 500)
      }
      if (duplicate.status === 'processing') {
        await admin.from('import_batches').update({ status: 'uploaded', failure_message: null }).eq('id', duplicate.id)
      }
      return json({ batchId: duplicate.id, version: duplicate.version, status: 'uploaded', reused: true })
    }
    return json({ error: `هذا الملف مرفوع بالفعل كإصدار ${duplicate.version}` }, 409)
  }

  const { data: latest } = await admin.from('import_batches').select('version').eq('branch_id', branchId).eq('period_start', periodStart).order('version', { ascending: false }).limit(1).maybeSingle()
  const version = (latest?.version ?? 0) + 1
  const storagePath = `${branchId}/${periodStart.slice(0,7)}/v${version}-${sha256.slice(0,20)}.xlsx`

  const { error: uploadError } = await admin.storage.from('branch-workbooks').upload(storagePath, buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert: false,
  })
  if (uploadError) return json({ error: 'فشل حفظ ملف Excel', detail: uploadError.message }, 500)

  if (parsedCache instanceof File) {
    const { error: cacheError } = await admin.storage.from('branch-workbooks').upload(
      `${storagePath}.parsed.json`,
      await parsedCache.arrayBuffer(),
      { contentType: 'application/json', upsert: true },
    )
    if (cacheError) {
      await admin.storage.from('branch-workbooks').remove([storagePath])
      return json({ error: 'فشل حفظ نسخة التحليل المؤقتة', detail: cacheError.message }, 500)
    }
  }

  const { data: batch, error: batchError } = await admin.from('import_batches').insert({
    organization_id: branch.organization_id,
    branch_id: branchId,
    period_start: periodStart,
    period_end: periodEnd,
    version,
    status: 'uploaded',
    original_file_name: file.name,
    storage_path: storagePath,
    file_sha256: sha256,
    file_size_bytes: file.size,
    uploaded_by: userId,
    metadata: { source: 'github_pages_upload' },
  }).select('id,version').single()

  if (batchError || !batch) {
    await admin.storage.from('branch-workbooks').remove([storagePath, `${storagePath}.parsed.json`])
    return json({ error: 'فشل تسجيل عملية الرفع', detail: batchError?.message }, 500)
  }
  return json({ batchId: batch.id, version: batch.version, status: 'uploaded' })
})
