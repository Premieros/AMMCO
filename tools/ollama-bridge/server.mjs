import http from 'node:http'

const host = process.env.BRIDGE_HOST || '127.0.0.1'
const port = Number(process.env.BRIDGE_PORT || 8787)
const ollamaUrl = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')
const token = process.env.BRIDGE_TOKEN

if (!token || token.length < 24) {
  console.error('BRIDGE_TOKEN is required and must be at least 24 characters.')
  process.exit(1)
}

const allowedPrefixes = ['/v1/', '/api/tags', '/api/show', '/health']

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function authorized(req) {
  const auth = req.headers.authorization || ''
  return auth === 'Bearer ' + token
}

async function proxy(req, res) {
  const url = new URL(req.url || '/', 'http://bridge.local')

  if (!allowedPrefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix))) {
    return json(res, 404, { error: 'NOT_FOUND' })
  }

  if (url.pathname === '/health') {
    try {
      const health = await fetch(ollamaUrl + '/api/tags', { signal: AbortSignal.timeout(5000) })
      return json(res, health.ok ? 200 : 502, {
        ok: health.ok,
        ollama: health.ok ? 'reachable' : 'unhealthy',
      })
    } catch {
      return json(res, 502, { ok: false, ollama: 'unreachable' })
    }
  }

  if (!authorized(req)) {
    return json(res, 401, { error: 'UNAUTHORIZED' })
  }

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = Buffer.concat(chunks)

  const target = ollamaUrl + url.pathname + url.search

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        Accept: req.headers.accept || 'application/json',
      },
      body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : body,
      signal: AbortSignal.timeout(120000),
    })

    const headers = {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    }

    res.writeHead(upstream.status, headers)

    if (!upstream.body) {
      res.end()
      return
    }

    const reader = upstream.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
    res.end()
  } catch (error) {
    json(res, 502, {
      error: 'OLLAMA_UPSTREAM_ERROR',
      detail: error instanceof Error ? error.message : 'unknown',
    })
  }
}

const server = http.createServer((req, res) => {
  proxy(req, res).catch(() => json(res, 500, { error: 'BRIDGE_ERROR' }))
})

server.listen(port, host, () => {
  console.log(`AMMCO Ollama Bridge listening on http://${host}:${port}`)
  console.log(`Forwarding to ${ollamaUrl}`)
})
