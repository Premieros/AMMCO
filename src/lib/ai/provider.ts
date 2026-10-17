export type AgentModelMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
}

type AiProvider = 'ollama' | 'openai-compatible'

function runtimeProvider(): AiProvider {
  return process.env.AI_PROVIDER === 'openai-compatible' ? 'openai-compatible' : 'ollama'
}

function normalizeBaseUrl(value: string | undefined, provider: AiProvider) {
  if (value) return value.replace(/\/+$/, '')
  return provider === 'ollama' ? '' : 'https://api.openai.com/v1'
}

function isLocalUrl(value: string) {
  try {
    const url = new URL(value)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

export function getAiRuntimeStatus() {
  const provider = runtimeProvider()
  const baseUrl = normalizeBaseUrl(process.env.AI_API_BASE_URL, provider)
  const model = process.env.AI_MODEL || null
  const apiKey = process.env.AI_API_KEY || null
  const localUrlBlocked = Boolean(process.env.VERCEL && baseUrl && isLocalUrl(baseUrl))

  return {
    provider,
    configured: Boolean(baseUrl && model && apiKey && !localUrlBlocked),
    model,
    baseUrl: baseUrl || null,
    localUrlBlocked,
  }
}

export async function callAgentModel(messages: AgentModelMessage[]) {
  const provider = runtimeProvider()
  const apiKey = process.env.AI_API_KEY
  const model = process.env.AI_MODEL
  const baseUrl = normalizeBaseUrl(process.env.AI_API_BASE_URL, provider)

  if (!apiKey || !model || !baseUrl) {
    throw new Error('AI_PROVIDER_NOT_CONFIGURED')
  }

  if (process.env.VERCEL && isLocalUrl(baseUrl)) {
    throw new Error('OLLAMA_LOCALHOST_UNREACHABLE')
  }

  const response = await fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1200)
    throw new Error('AI_PROVIDER_ERROR:' + response.status + ':' + detail)
  }

  const payload = (await response.json()) as ChatCompletionResponse
  const content = payload.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error('AI_PROVIDER_EMPTY_RESPONSE')
  }

  return content
}
