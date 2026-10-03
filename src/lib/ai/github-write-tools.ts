const DEFAULT_OWNER = 'Premieros'
const DEFAULT_REPO = 'AMMCO'
const DEFAULT_BRANCH = 'main'
const MAX_WRITE_CHARS = 120000

type RefResponse = {
  object?: { sha?: string }
}

type ContentResponse = {
  type?: string
  sha?: string
}

type PullResponse = {
  html_url?: string
  number?: number
  draft?: boolean
}

function config() {
  return {
    owner: process.env.AI_GITHUB_OWNER || DEFAULT_OWNER,
    repo: process.env.AI_GITHUB_REPO || DEFAULT_REPO,
    baseBranch: process.env.AI_GITHUB_BRANCH || DEFAULT_BRANCH,
  }
}

function requireToken() {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_WRITE_NOT_CONFIGURED')
  return token
}

function headers() {
  return {
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'AMMCO-AI-Developer',
    Authorization: 'Bearer ' + requireToken(),
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('https://api.github.com' + path, {
    ...init,
    headers: { ...headers(), ...(init?.headers || {}) },
    cache: 'no-store',
  })

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000)
    throw new Error('GITHUB_WRITE_ERROR:' + response.status + ':' + detail)
  }

  if (response.status === 204) return {} as T
  return (await response.json()) as T
}

function safeBranch(branch: string) {
  const value = branch.trim()
  if (!/^ai\/[a-z0-9][a-z0-9._\/-]{2,120}$/i.test(value)) {
    throw new Error('INVALID_AI_BRANCH')
  }
  if (value.includes('..') || value.endsWith('/') || value === 'ai/main') {
    throw new Error('INVALID_AI_BRANCH')
  }
  return value
}

function safeWritePath(path: string) {
  const normalized = path.trim().replace(/^\/+/, '')
  const lower = normalized.toLowerCase()

  if (!normalized || normalized.includes('..') || normalized.includes('\\')) {
    throw new Error('INVALID_REPOSITORY_PATH')
  }

  if (
    lower === '.env' ||
    lower.startsWith('.env.') ||
    lower.includes('/.env') ||
    lower.startsWith('.github/') ||
    lower.startsWith('supabase/') ||
    lower.includes('/node_modules/') ||
    lower.startsWith('node_modules/') ||
    lower.endsWith('.pem') ||
    lower.endsWith('.key') ||
    lower.endsWith('.p12') ||
    lower.endsWith('.pfx')
  ) {
    throw new Error('BLOCKED_WRITE_PATH')
  }

  return normalized
}

function encodePath(path: string) {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/')
}

function slug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'task'
}

export function validateAgentBranch(branch: string) {
  return safeBranch(branch)
}

export async function createAgentBranch(taskLabel: string) {
  const { owner, repo, baseBranch } = config()
  const base = await request<RefResponse>(
    '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/git/ref/heads/' + encodeURIComponent(baseBranch),
  )
  const sha = base.object?.sha
  if (!sha) throw new Error('BASE_BRANCH_SHA_MISSING')

  const branch = 'ai/' + Date.now().toString(36) + '-' + slug(taskLabel)
  await request(
    '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/git/refs',
    {
      method: 'POST',
      body: JSON.stringify({ ref: 'refs/heads/' + branch, sha }),
    },
  )

  return branch
}

async function existingFileSha(path: string, branch: string) {
  const { owner, repo } = config()
  const url =
    '/repos/' +
    encodeURIComponent(owner) +
    '/' +
    encodeURIComponent(repo) +
    '/contents/' +
    encodePath(path) +
    '?ref=' +
    encodeURIComponent(branch)

  const response = await fetch('https://api.github.com' + url, {
    headers: headers(),
    cache: 'no-store',
  })

  if (response.status === 404) return null
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000)
    throw new Error('GITHUB_WRITE_ERROR:' + response.status + ':' + detail)
  }

  const payload = (await response.json()) as ContentResponse
  return payload.type === 'file' && payload.sha ? payload.sha : null
}

export async function writeRepositoryFile(args: {
  branch: string
  path: string
  content: string
  message: string
}) {
  const { owner, repo } = config()
  const branch = safeBranch(args.branch)
  const path = safeWritePath(args.path)
  const content = args.content

  if (!content || content.length > MAX_WRITE_CHARS) {
    throw new Error('INVALID_WRITE_CONTENT_SIZE')
  }

  const currentSha = await existingFileSha(path, branch)
  const body: Record<string, string> = {
    message: args.message.trim().slice(0, 120) || 'AI developer update',
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch,
  }
  if (currentSha) body.sha = currentSha

  const result = await request<{ commit?: { sha?: string }; content?: { sha?: string } }>(
    '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/contents/' + encodePath(path),
    { method: 'PUT', body: JSON.stringify(body) },
  )

  return {
    path,
    branch,
    commitSha: result.commit?.sha || null,
    contentSha: result.content?.sha || null,
    action: currentSha ? 'updated' : 'created',
  }
}

export async function compareAgentBranch(branchInput: string) {
  const { owner, repo, baseBranch } = config()
  const branch = safeBranch(branchInput)
  const result = await request<{
    status?: string
    ahead_by?: number
    behind_by?: number
    total_commits?: number
    files?: Array<{ filename?: string; status?: string; additions?: number; deletions?: number; changes?: number }>
  }>(
    '/repos/' +
      encodeURIComponent(owner) +
      '/' +
      encodeURIComponent(repo) +
      '/compare/' +
      encodeURIComponent(baseBranch) +
      '...' +
      encodeURIComponent(branch),
  )

  return {
    branch,
    base: baseBranch,
    status: result.status || null,
    aheadBy: result.ahead_by || 0,
    behindBy: result.behind_by || 0,
    totalCommits: result.total_commits || 0,
    files: (result.files || []).slice(0, 100).map((file) => ({
      filename: file.filename || '',
      status: file.status || '',
      additions: file.additions || 0,
      deletions: file.deletions || 0,
      changes: file.changes || 0,
    })),
  }
}

export async function openDraftPullRequest(branchInput: string, title: string, body: string) {
  const { owner, repo, baseBranch } = config()
  const branch = safeBranch(branchInput)
  const listPath =
    '/repos/' +
    encodeURIComponent(owner) +
    '/' +
    encodeURIComponent(repo) +
    '/pulls?state=open&head=' +
    encodeURIComponent(owner + ':' + branch) +
    '&base=' +
    encodeURIComponent(baseBranch)

  const existing = await request<PullResponse[]>(listPath)
  if (existing[0]?.html_url) {
    return { url: existing[0].html_url, number: existing[0].number || null, draft: existing[0].draft ?? true, existing: true }
  }

  const created = await request<PullResponse>(
    '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/pulls',
    {
      method: 'POST',
      body: JSON.stringify({
        title: title.trim().slice(0, 120) || 'AI Developer changes',
        body: body.trim().slice(0, 5000),
        head: branch,
        base: baseBranch,
        draft: true,
      }),
    },
  )

  return { url: created.html_url || null, number: created.number || null, draft: true, existing: false }
}

export async function getAgentBranchCiStatus(branchInput: string) {
  const { owner, repo } = config()
  const branch = safeBranch(branchInput)
  const ref = await request<RefResponse>(
    '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/git/ref/heads/' + encodeURIComponent(branch),
  )
  const sha = ref.object?.sha
  if (!sha) throw new Error('AGENT_BRANCH_SHA_MISSING')

  const combined = await request<{
    state?: string
    statuses?: Array<{ context?: string; state?: string; description?: string; target_url?: string }>
  }>(
    '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/commits/' + encodeURIComponent(sha) + '/status',
  )

  let checks: Array<{ name: string; status: string | null; conclusion: string | null; url: string | null }> = []
  try {
    const checkRuns = await request<{
      check_runs?: Array<{ name?: string; status?: string; conclusion?: string | null; html_url?: string }>
    }>(
      '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/commits/' + encodeURIComponent(sha) + '/check-runs',
    )
    checks = (checkRuns.check_runs || []).slice(0, 30).map((check) => ({
      name: check.name || 'check',
      status: check.status || null,
      conclusion: check.conclusion || null,
      url: check.html_url || null,
    }))
  } catch {
    // Some tokens may not have Checks read permission; commit statuses still work.
  }

  return {
    branch,
    sha,
    state: combined.state || 'pending',
    statuses: (combined.statuses || []).slice(0, 30).map((status) => ({
      context: status.context || 'status',
      state: status.state || 'pending',
      description: status.description || null,
      url: status.target_url || null,
    })),
    checks,
  }
}
