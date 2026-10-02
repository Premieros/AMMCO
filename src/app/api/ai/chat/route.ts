import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callAgentModel, type AgentModelMessage } from '@/lib/ai/provider'
import {
  getRepositoryIdentity,
  listRepositoryFiles,
  readRepositoryFile,
} from '@/lib/ai/github-read-tools'
import {
  compareAgentBranch,
  createAgentBranch,
  openDraftPullRequest,
  validateAgentBranch,
  writeRepositoryFile,
} from '@/lib/ai/github-write-tools'

type ClientHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
}

type AgentMode = 'read' | 'edit'

type RequestBody = {
  message?: string
  history?: ClientHistoryMessage[]
  mode?: AgentMode
  branch?: string | null
}

type AgentCommand =
  | {
      type: 'tool'
      tool: 'list_files'
      args?: { prefix?: string }
    }
  | {
      type: 'tool'
      tool: 'read_file'
      args: { path: string }
    }
  | {
      type: 'tool'
      tool: 'write_file'
      args: { path: string; content: string; message?: string }
    }
  | {
      type: 'tool'
      tool: 'compare_changes'
      args?: Record<string, never>
    }
  | {
      type: 'tool'
      tool: 'open_pr'
      args: { title: string; body?: string }
    }
  | {
      type: 'final'
      content: string
    }

const TOOL_NAMES = new Set([
  'list_files',
  'read_file',
  'write_file',
  'compare_changes',
  'open_pr',
])

function parseAgentCommand(raw: string): AgentCommand | null {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')

  const candidates = [cleaned]
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as AgentCommand
      if (parsed?.type === 'final' && typeof parsed.content === 'string') return parsed
      if (
        parsed?.type === 'tool' &&
        typeof parsed.tool === 'string' &&
        TOOL_NAMES.has(parsed.tool)
      ) {
        return parsed
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null
}

function systemPrompt(mode: AgentMode, activeBranch: string | null) {
  const repo = getRepositoryIdentity()
  const common = [
    'أنت AMMCO AI Developer، مساعد برمجي مخصص لتطوير مستودع ' + repo.fullName + '.',
    'استخدم الأدوات بدل التخمين عندما يحتاج السؤال إلى معرفة الكود.',
    'أرجع JSON فقط لكل خطوة، بدون Markdown fences.',
    'للقراءة: {"type":"tool","tool":"list_files","args":{"prefix":"src/app"}}',
    'أو: {"type":"tool","tool":"read_file","args":{"path":"src/app/page.tsx"}}',
    'وعند الانتهاء: {"type":"final","content":"الإجابة النهائية بالعربية"}',
    'اذكر الملفات التي راجعتها أو عدلتها في النتيجة النهائية.',
  ]

  if (mode === 'read') {
    return [
      ...common,
      'الوضع الحالي READ_ONLY: لا يجوز لك طلب write_file أو compare_changes أو open_pr.',
      'لا تدّعِ أنك عدلت أو نشرت أي ملف.',
      'فرع القراءة الأساسي: ' + repo.branch + '.',
    ].join('\n')
  }

  return [
    ...common,
    'الوضع الحالي EDIT مع حواجز أمان.',
    'استخدم write_file فقط إذا كان طلب المستخدم صريحًا بالتنفيذ أو التعديل أو الإنشاء أو الإصلاح.',
    'لا تستخدم write_file لمجرد سؤال أو تحليل أو شرح.',
    'write_file ينشئ أو يحدّث ملفًا نصيًا كاملًا على فرع ai/ منفصل؛ لا يوجد حذف ملفات.',
    'صيغة الكتابة: {"type":"tool","tool":"write_file","args":{"path":"src/...","content":"المحتوى الكامل","message":"وصف التعديل"}}',
    'بعد التعديلات استخدم compare_changes لمراجعة الملفات المتغيرة قبل إنهاء المهمة.',
    'صيغة المقارنة: {"type":"tool","tool":"compare_changes","args":{}}',
    'استخدم open_pr فقط إذا طلب المستخدم صراحة فتح Pull Request أو تجهيز التعديل للمراجعة.',
    'صيغة PR: {"type":"tool","tool":"open_pr","args":{"title":"عنوان","body":"ملخص"}}',
    'open_pr ينشئ Draft PR فقط ولا يدمج شيئًا.',
    'ممنوع تعديل main مباشرة، وممنوع تعديل .env أو .github أو supabase أو أي مفاتيح أو أسرار.',
    'ممنوع إجراء أي تعديل على Schema أو بيانات Supabase من هذه الأدوات.',
    activeBranch ? 'فرع العمل الحالي: ' + activeBranch + '.' : 'سيُنشأ فرع ai/ تلقائيًا عند أول write_file.',
  ].join('\n')
}

function toolLabel(command: Extract<AgentCommand, { type: 'tool' }>) {
  if (command.tool === 'list_files') return 'استعراض ملفات ' + (command.args?.prefix || 'المستودع')
  if (command.tool === 'read_file') return 'قراءة ' + (command.args?.path || 'ملف')
  if (command.tool === 'write_file') return 'تعديل ' + (command.args?.path || 'ملف')
  if (command.tool === 'compare_changes') return 'مراجعة التغييرات'
  return 'فتح Draft Pull Request'
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody
    const userMessage = body.message?.trim()
    const mode: AgentMode = body.mode === 'edit' ? 'edit' : 'read'

    if (!userMessage) {
      return NextResponse.json({ error: 'اكتب طلبًا أولًا.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getClaims()
    const userId = auth?.claims?.sub

    if (!userId) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولًا.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'AI Developer متاح للمدير فقط حاليًا.' }, { status: 403 })
    }

    let activeBranch: string | null = null
    if (mode === 'edit' && body.branch) {
      activeBranch = validateAgentBranch(body.branch)
    }

    const history = (body.history || [])
      .filter(
        (item): item is ClientHistoryMessage =>
          (item.role === 'user' || item.role === 'assistant') &&
          typeof item.content === 'string' &&
          item.content.trim().length > 0,
      )
      .slice(-8)

    const messages: AgentModelMessage[] = [
      { role: 'system', content: systemPrompt(mode, activeBranch) },
      ...history.map((item) => ({ role: item.role, content: item.content })),
      { role: 'user', content: userMessage },
    ]

    const steps: string[] = []
    let prUrl: string | null = null
    const maxIterations = mode === 'edit' ? 10 : 6

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const raw = await callAgentModel(messages)
      const command = parseAgentCommand(raw)

      if (!command) {
        return NextResponse.json({ reply: raw, steps, mode, branch: activeBranch, prUrl })
      }

      if (command.type === 'final') {
        return NextResponse.json({
          reply: command.content,
          steps,
          mode,
          branch: activeBranch,
          prUrl,
        })
      }

      steps.push(toolLabel(command))

      try {
        let result: unknown
        const ref = activeBranch || getRepositoryIdentity().branch

        if (command.tool === 'list_files') {
          result = await listRepositoryFiles(command.args?.prefix || '', ref)
        } else if (command.tool === 'read_file') {
          const path = command.args?.path
          if (!path) throw new Error('MISSING_FILE_PATH')
          result = { path, content: await readRepositoryFile(path, ref) }
        } else if (command.tool === 'write_file') {
          if (mode !== 'edit') throw new Error('WRITE_MODE_REQUIRED')
          const path = command.args?.path
          const content = command.args?.content
          if (!path || typeof content !== 'string') throw new Error('INVALID_WRITE_ARGS')

          if (!activeBranch) {
            activeBranch = await createAgentBranch(userMessage)
            messages[0] = { role: 'system', content: systemPrompt(mode, activeBranch) }
          }

          result = await writeRepositoryFile({
            branch: activeBranch,
            path,
            content,
            message: command.args?.message || 'AI developer update',
          })
        } else if (command.tool === 'compare_changes') {
          if (mode !== 'edit' || !activeBranch) throw new Error('NO_ACTIVE_EDIT_BRANCH')
          result = await compareAgentBranch(activeBranch)
        } else {
          if (mode !== 'edit' || !activeBranch) throw new Error('NO_ACTIVE_EDIT_BRANCH')
          const title = command.args?.title
          if (!title) throw new Error('MISSING_PR_TITLE')
          const pr = await openDraftPullRequest(activeBranch, title, command.args?.body || '')
          prUrl = pr.url
          result = pr
        }

        messages.push({ role: 'assistant', content: raw })
        messages.push({
          role: 'user',
          content: 'TOOL_RESULT ' + command.tool + '\n' + JSON.stringify(result, null, 2),
        })
      } catch (error) {
        messages.push({ role: 'assistant', content: raw })
        messages.push({
          role: 'user',
          content:
            'TOOL_ERROR ' +
            command.tool +
            '\n' +
            (error instanceof Error ? error.message : 'UNKNOWN_TOOL_ERROR'),
        })
      }
    }

    return NextResponse.json(
      {
        error: 'وصل الوكيل إلى الحد الأقصى للخطوات. أعد صياغة المهمة بشكل أكثر تحديدًا.',
        steps,
        mode,
        branch: activeBranch,
        prUrl,
      },
      { status: 422 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'

    if (message === 'AI_PROVIDER_NOT_CONFIGURED') {
      return NextResponse.json(
        { error: 'مزود الذكاء غير مضبوط بعد. أضف AI_API_KEY و AI_MODEL و AI_API_BASE_URL في إعدادات Vercel.' },
        { status: 503 },
      )
    }

    if (message === 'GITHUB_WRITE_NOT_CONFIGURED') {
      return NextResponse.json(
        { error: 'وضع Edit يحتاج GITHUB_TOKEN بصلاحية كتابة على مستودع AMMCO في Vercel.' },
        { status: 503 },
      )
    }

    return NextResponse.json(
      { error: 'تعذر تنفيذ الطلب الآن.', detail: message.slice(0, 500) },
      { status: 500 },
    )
  }
}
