'use client'

import { FormEvent, useState } from 'react'
import { Bot, CircleCheck, CircleX, Database, Github, Loader2, Send, ShieldCheck } from 'lucide-react'
import styles from './ai-developer-console.module.css'

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
  model: string | null
}

type AgentResponse = {
  reply?: string
  error?: string
  detail?: string
  steps?: string[]
}

export function AiDeveloperConsole({
  repository,
  databaseRef,
  databaseHealthy,
  aiConfigured,
  model,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'intro',
      role: 'assistant',
      content:
        'أنا متصل بمستودع AMMCO في وضع القراءة فقط حاليًا. اطلب مني فحص صفحة، تتبع خطأ، شرح جزء من المشروع، أو تحديد الملفات المطلوبة لميزة جديدة.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const prompt = input.trim()
    if (!prompt || loading || !aiConfigured) return

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
        body: JSON.stringify({ message: prompt, history }),
      })

      const payload = (await response.json()) as AgentResponse

      if (!response.ok) {
        throw new Error(payload.error || payload.detail || 'تعذر تنفيذ الطلب.')
      }

      setMessages((current) => [
        ...current,
        {
          id: 'assistant-' + Date.now(),
          role: 'assistant',
          content: payload.reply || 'تمت قراءة المشروع ولكن لم تصل إجابة نصية.',
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

  return (
    <div className={styles.console}>
      <section className={styles.statusGrid} aria-label="حالة اتصالات AI Developer">
        <div className={styles.statusCard}>
          <div className={styles.statusIcon}><Github size={18} /></div>
          <div className={styles.statusCopy}>
            <strong>GitHub</strong>
            <span>{repository} · قراءة فقط</span>
          </div>
          <CircleCheck size={16} color="#059669" />
        </div>

        <div className={styles.statusCard}>
          <div className={styles.statusIcon}><Database size={18} /></div>
          <div className={styles.statusCopy}>
            <strong>Supabase AMMCO</strong>
            <span>{databaseRef}</span>
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
          <span className={styles.modeBadge}>
            <ShieldCheck size={13} />
            READ ONLY
          </span>
        </header>

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
                <Loader2 size={15} className={styles.spinner} /> جاري فحص المشروع...
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
              placeholder="مثال: افحص نظام تسجيل الدخول وحدد الملفات المسؤولة عنه"
              disabled={!aiConfigured || loading}
            />
            <button className={styles.sendButton} type="submit" disabled={!aiConfigured || loading || !input.trim()}>
              {loading ? <Loader2 size={15} className={styles.spinner} /> : <Send size={15} />}
              <span>إرسال</span>
            </button>
          </form>
          {!aiConfigured ? (
            <div className={styles.configNotice}>
              لإتاحة الشات أضف AI_API_KEY و AI_MODEL و AI_API_BASE_URL إلى Environment Variables في Vercel.
            </div>
          ) : null}
        </footer>
      </section>
    </div>
  )
}
