import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callAgentModel, type AgentModelMessage } from '@/lib/ai/provider'
import {
  getRepositoryIdentity,
  listRepositoryFiles,
  readRepositoryFile,
} from '@/lib/ai/github-read-tools'

type ClientHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
}

type RequestBody = {
  message?: string
  history?: ClientHistoryMessage[]
}

type AgentCommand =
  | {
      type: 'tool'
      tool: 'list_files'
      args?: {
        prefix?: string
      }
    }
  | {
      type: 'tool'
      tool: 'read_file'
      args: {
        path: string
      }
    }
  | {
      type: 'final'
      content: string
    }

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
      if (parsed?.type === 'final' && typeof parsed.content === 'string') {
        return parsed
      }
      if (parsed?.type === 'tool' && (parsed.tool === 'list_files' || parsed.tool === 'read_file')) {
        return parsed
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null
}

async function executeTool(command: Extract<AgentCommand, { type: 'tool' }>) {
  if (command.tool === 'list_files') {
    const files = await listRepositoryFiles(command.args?.prefix || '')
    return JSON.stringify({ files }, null, 2)
  }

  const path = command.args?.path
  if (!path) {
    throw new Error('MISSING_FILE_PATH')
  }

  const content = await readRepositoryFile(path)
  return JSON.stringify({ path, content }, null, 2)
}

function systemPrompt() {
  const repo = getRepositoryIdentity()

  return [
    'أنت AMMCO AI Developer، مساعد برمجي مخصص لتطوير مستودع ' + repo.fullName + '.',
    'الوضع الحالي READ_ONLY: مسموح لك قراءة ملفات المستودع وتحليلها فقط، ولا تدّعِ أنك عدلت أو نشرت أي ملف.',
    'استخدم الأدوات بدل التخمين عندما يحتاج السؤال إلى معرفة الكود.',
    'لديك أداتان فقط في هذه المرحلة:',
    '1) list_files: يعرض ملفات المستودع أو الملفات تحت prefix محدد.',
    '2) read_file: يقرأ ملفًا نصيًا واحدًا.',
    'عندما تحتاج أداة، أرجع JSON فقط بهذا الشكل:',
    '{"type":"tool","tool":"list_files","args":{"prefix":"src/app"}}',
    'أو:',
    '{"type":"tool","tool":"read_file","args":{"path":"src/app/page.tsx"}}',
    'عندما تنتهي، أرجع JSON فقط بهذا الشكل:',
    '{"type":"final","content":"الإجابة النهائية بالعربية"}',
    'لا تستخدم Markdown fences حول JSON.',
    'ركز على حلول عملية، واذكر الملفات التي راجعتها عند تقديم نتيجة تقنية.',
    'فرع القراءة الحالي: ' + repo.branch + '.',
  ].join('\n')
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody
    const userMessage = body.message?.trim()

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

    const history = (body.history || [])
      .filter(
        (item): item is ClientHistoryMessage =>
          (item.role === 'user' || item.role === 'assistant') &&
          typeof item.content === 'string' &&
          item.content.trim().length > 0,
      )
      .slice(-8)

    const messages: AgentModelMessage[] = [
      { role: 'system', content: systemPrompt() },
      ...history.map((item) => ({ role: item.role, content: item.content })),
      { role: 'user', content: userMessage },
    ]

    const steps: string[] = []

    for (let iteration = 0; iteration < 6; iteration += 1) {
      const raw = await callAgentModel(messages)
      const command = parseAgentCommand(raw)

      if (!command) {
        return NextResponse.json({
          reply: raw,
          steps,
          mode: 'read-only',
        })
      }

      if (command.type === 'final') {
        return NextResponse.json({
          reply: command.content,
          steps,
          mode: 'read-only',
        })
      }

      const label =
        command.tool === 'read_file'
          ? 'قراءة ' + (command.args?.path || 'ملف')
          : 'استعراض ملفات ' + (command.args?.prefix || 'المستودع')

      steps.push(label)

      try {
        const result = await executeTool(command)
        messages.push({ role: 'assistant', content: raw })
        messages.push({
          role: 'user',
          content: 'TOOL_RESULT ' + command.tool + '\n' + result,
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
        error: 'وصل الوكيل إلى الحد الأقصى لخطوات القراءة. أعد صياغة الطلب بشكل أكثر تحديدًا.',
        steps,
      },
      { status: 422 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'

    if (message === 'AI_PROVIDER_NOT_CONFIGURED') {
      return NextResponse.json(
        {
          error:
            'مزود الذكاء غير مضبوط بعد. أضف AI_API_KEY و AI_MODEL و AI_API_BASE_URL في إعدادات Vercel.',
        },
        { status: 503 },
      )
    }

    return NextResponse.json(
      {
        error: 'تعذر تنفيذ الطلب الآن.',
        detail: message.slice(0, 500),
      },
      { status: 500 },
    )
  }
}
