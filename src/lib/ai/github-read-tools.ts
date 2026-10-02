const DEFAULT_OWNER = 'Premieros'
const DEFAULT_REPO = 'AMMCO'
const DEFAULT_BRANCH = 'main'
const MAX_FILE_CHARS = 16000
const MAX_LIST_ITEMS = 300

type GitHubTreeResponse = {
  tree?: Array<{
    path?: string
    type?: string
    size?: number
  }>
}

type GitHubContentResponse = {
  type?: string
  content?: string
  encoding?: string
  size?: number
}

function repoConfig() {
  return {
    owner: process.env.AI_GITHUB_OWNER || DEFAULT_OWNER,
    repo: process.env.AI_GITHUB_REPO || DEFAULT_REPO,
    branch: process.env.AI_GITHUB_BRANCH || DEFAULT_BRANCH,
  }
}

function githubHeaders() {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'AMMCO-AI-Developer',
  }

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN
  }

  return headers
}

async function githubFetch<T>(path: string): Promise<T> {
  const response = await fetch('https://api.github.com' + path, {
    headers: githubHeaders(),
    cache: 'no-store',
  })

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800)
    throw new Error('GITHUB_API_ERROR:' + response.status + ':' + detail)
  }

  return (await response.json()) as T
}

function safeRepoPath(path: string) {
  const normalized = path.trim().replace(/^\/+/, '')

  if (!normalized || normalized.includes('..') || normalized.includes('\\')) {
    throw new Error('INVALID_REPOSITORY_PATH')
  }

  const lowered = normalized.toLowerCase()
  if (
    lowered === '.env' ||
    lowered.startsWith('.env.') ||
    lowered.includes('/.env') ||
    lowered.includes('node_modules/') ||
    lowered.endsWith('.pem') ||
    lowered.endsWith('.key') ||
    lowered.endsWith('.p12') ||
    lowered.endsWith('.pfx')
  ) {
    throw new Error('BLOCKED_REPOSITORY_PATH')
  }

  return normalized
}

function encodeRepoPath(path: string) {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/')
}

export async function listRepositoryFiles(prefix = '', ref?: string) {
  const { owner, repo, branch } = repoConfig()
  const targetRef = ref || branch
  const normalizedPrefix = prefix.trim().replace(/^\/+/, '')

  if (normalizedPrefix.includes('..') || normalizedPrefix.includes('\\')) {
    throw new Error('INVALID_REPOSITORY_PREFIX')
  }

  const result = await githubFetch<GitHubTreeResponse>(
    '/repos/' +
      encodeURIComponent(owner) +
      '/' +
      encodeURIComponent(repo) +
      '/git/trees/' +
      encodeURIComponent(targetRef) +
      '?recursive=1',
  )

  return (result.tree || [])
    .filter((item) => item.type === 'blob' && typeof item.path === 'string')
    .map((item) => item.path as string)
    .filter((path) => !normalizedPrefix || path.startsWith(normalizedPrefix))
    .filter((path) => {
      const lower = path.toLowerCase()
      return (
        !lower.includes('/node_modules/') &&
        !lower.startsWith('node_modules/') &&
        !lower.includes('/.next/') &&
        !lower.startsWith('.next/') &&
        !lower.includes('/.env')
      )
    })
    .slice(0, MAX_LIST_ITEMS)
}

export async function readRepositoryFile(path: string, ref?: string) {
  const safePath = safeRepoPath(path)
  const { owner, repo, branch } = repoConfig()
  const targetRef = ref || branch

  const result = await githubFetch<GitHubContentResponse>(
    '/repos/' +
      encodeURIComponent(owner) +
      '/' +
      encodeURIComponent(repo) +
      '/contents/' +
      encodeRepoPath(safePath) +
      '?ref=' +
      encodeURIComponent(targetRef),
  )

  if (result.type !== 'file' || result.encoding !== 'base64' || !result.content) {
    throw new Error('UNSUPPORTED_REPOSITORY_CONTENT')
  }

  const decoded = Buffer.from(result.content.replace(/\n/g, ''), 'base64').toString('utf8')
  return decoded.slice(0, MAX_FILE_CHARS)
}

export function getRepositoryIdentity() {
  const { owner, repo, branch } = repoConfig()
  return {
    fullName: owner + '/' + repo,
    branch,
  }
}
