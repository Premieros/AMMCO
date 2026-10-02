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

export function getAiRuntimeStatus() {
  return {
    configured: Boolean(process.env.AI_API_KEY && process.env.AI_MODEL),
    model: process.env.AI_MODEL || null,
    baseUrl: process.env.AI_API_BASE_URL || null,
  }
}

export async function callAgentModel(messages: AgentModelMessage[]) {
  const apiKey = process.env.AI_API_KEY
  const model = process.env.AI_MODEL
  const baseUrl = (process.env.AI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')

  if (!apiKey || !model) {
    throw new Error('AI_PROVIDER_NOT_CONFIGURED')
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
