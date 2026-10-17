'use client'

import { FormEvent, useState } from 'react'
import {
  Bot,
  CircleCheck,
  CircleX,
  Database,
  GitBranch,
  Loader2,
  Pencil,
  Search,
  Send,
  ShieldCheck,
} from 'lucide-react'
import styles from './ai-developer-console.module.css'

type AgentMode = 'read' | 'edit'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  steps?: string[]
}

type Props = {
  repository: string
  databaseRef: string
  databaseHealthy: boolean
  aiConfigured: boolean
  githubWriteConfigured: boolean
  model: string | null
}

type AgentResponse = {
  reply?: string
  error?: string
  detail?: string
  steps?: string[]
  branch?: string | null
  prUrl?: string | null
}

export function AiDeveloperConsole({
  repository,
  databaseRef,
  databaseHealthy,
  aiConfigured,
  githubWriteConfigured,
  model,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'intro',
      role: 'assistant',
      content:
        'أنا متصل بمستودع AMMCO. استخدم Ask للفحص والشرح فقط، أو Edit عندما تريد مني تنفيذ تعديل فعلي على فرع ai/ منفصل.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<AgentMode>('read')
  const [branch, setBranch] = useState<string | null>(null)
  const [prUrl, setPrUrl] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const prompt = input.trim()
    if (!prompt || loading || !aiConfigured) return
    if (mode === 'edit' && !githubWriteConfigured) return

    const history = messages
      .filter((message) => message.id !== 'intro')
      .slice(-8)
      .map((message) => ({ role: message.role, content: message.content }))

    const userMessage: Message = {
      id: 'user-' + Date.now(),
      role: 'user',
      content: prompt,
    }

    setMessages((current) => [...current, userMessage])
    setInput('')
    setLoading(true)

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, history, mode, branch }),
      })

      const payload = (await response.json()) as AgentResponse

      if (payload.branch) setBranch(payload.branch)
      if (payload.prUrl) setPrUrl(payload.prUrl)

      if (!response.ok) {
        throw new Error(payload.error || payload.detail || 'تعذر تنفيذ الطلب.')
      }

      setMessages((current) => [
        ...current,
        {
          id: 'assistant-' + Date.now(),
          role: 'assistant',
          content: payload.reply || 'تم تنفيذ الخطوات ولكن لم تصل إجابة نصية.',
          steps: payload.steps || [],
        },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: 'error-' + Date.now(),
          role: 'assistant',
          content: error instanceof Error ? error.message : 'حدث خطأ غير متوقع.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const canEdit = aiConfigured && githubWriteConfigured

  return (
    <div className={styles.console}>
      <section className={styles.statusGrid} aria-label="حالة اتصالات AI Developer">
        <div className={styles.statusCard}>
          <div className={styles.statusIcon}><GitBranch size={18} /></div>
          <div className={styles.statusCopy}>
            <strong>GitHub</strong>
            <span>{branch || repository + ' · main للقراءة'}</span>
          </div>
          <CircleCheck size={16} color="#059669" />
        </div>

        <div className={styles.statusCard}>
          <div className={styles.statusIcon}><Database size={18} /></div>
          <div className={styles.statusCopy}>
            <strong>Supabase AMMCO</strong>
            <span>{databaseRef} · بدون أدوات كتابة</span>
          </div>
          {databaseHealthy ? <CircleCheck size={16} color="#059669" /> : <CircleX size={16} color="#dc2626" />}
        </div>

        <div className={styles.statusCard}>
          <div className={styles.statusIcon}><Bot size={18} /></div>
          <div className={styles.statusCopy}>
            <strong>AI Provider</strong>
            <span>{aiConfigured ? model || 'مضبوط' : 'يحتاج إعداد Vercel'}</span>
          </div>
          {aiConfigured ? <CircleCheck size={16} color="#059669" /> : <CircleX size={16} color="#d97706" />}
        </div>
      </section>

      <section className={styles.chatShell}>
        <header className={styles.chatHead}>
          <div className={styles.chatHeadTitle}>
            <Bot size={17} />
            <span>AMMCO AI Developer</span>
          </div>

          <div className={styles.modeControls}>
            <button
              type="button"
              className={`${styles.modeButton} ${mode === 'read' ? styles.modeButtonActive : ''}`}
              onClick={() => setMode('read')}
              disabled={loading}
            >
              <Search size={13} />
              Ask
            </button>
            <button
              type="button"
              className={`${styles.modeButton} ${mode === 'edit' ? styles.modeButtonEditActive : ''}`}
              onClick={() => setMode('edit')}
              disabled={loading || !canEdit}
              title={!githubWriteConfigured ? 'أضف GITHUB_TOKEN في Vercel لتفعيل Edit' : undefined}
            >
              <Pencil size={13} />
              Edit
            </button>
            <span className={styles.modeBadge}>
              <ShieldCheck size={13} />
              {mode === 'read' ? 'READ ONLY' : 'AI BRANCH ONLY'}
            </span>
          </div>
        </header>

        {branch || prUrl ? (
          <div className={styles.workStrip}>
            {branch ? <span><GitBranch size={12} /> {branch}</span> : null}
            {prUrl ? <a href={prUrl} target="_blank" rel="noreferrer">فتح Draft PR</a> : null}
          </div>
        ) : null}

        <div className={styles.messages}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`${styles.messageRow} ${
                message.role === 'user' ? styles.messageRowUser : styles.messageRowAssistant
              }`}
            >
              <div
                className={`${styles.bubble} ${
                  message.role === 'user' ? styles.userBubble : styles.assistantBubble
                }`}
              >
                {message.content}
                {message.steps && message.steps.length > 0 ? (
                  <div className={styles.trace}>
                    {message.steps.map((step, index) => (
                      <div className={styles.traceItem} key={step + index}>
                        <CircleCheck size={11} />
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {loading ? (
            <div className={`${styles.messageRow} ${styles.messageRowAssistant}`}>
              <div className={`${styles.bubble} ${styles.assistantBubble}`}>
                <Loader2 size={15} className={styles.spinner} />
                {mode === 'edit' ? ' جاري تنفيذ المهمة على فرع آمن...' : ' جاري فحص المشروع...'}
              </div>
            </div>
          ) : null}
        </div>

        <footer className={styles.composer}>
          <form className={styles.composerForm} onSubmit={submit}>
            <textarea
              className={styles.textarea}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                mode === 'edit'
                  ? 'مثال: عدل صفحة المبيعات وأضف فلترًا للتاريخ ثم راجع التغييرات'
                  : 'مثال: افحص نظام تسجيل الدخول وحدد الملفات المسؤولة عنه'
              }
              disabled={!aiConfigured || loading || (mode === 'edit' && !githubWriteConfigured)}
            />
            <button
              className={styles.sendButton}
              type="submit"
              disabled={!aiConfigured || loading || !input.trim() || (mode === 'edit' && !githubWriteConfigured)}
            >
              {loading ? <Loader2 size={15} className={styles.spinner} /> : <Send size={15} />}
              <span>{mode === 'edit' ? 'تنفيذ' : 'إرسال'}</span>
            </button>
          </form>

          {!aiConfigured ? (
            <div className={styles.configNotice}>
              لإتاحة الشات أضف AI_API_KEY و AI_MODEL و AI_API_BASE_URL إلى Environment Variables في Vercel.
            </div>
          ) : null}
          {aiConfigured && !githubWriteConfigured ? (
            <div className={styles.configNotice}>
              وضع Ask يعمل. لتفعيل Edit أضف GITHUB_TOKEN بصلاحية كتابة على Premieros/AMMCO.
            </div>
          ) : null}
        </footer>
      </section>
    </div>
  )
}
