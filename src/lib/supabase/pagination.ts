import type { PostgrestError } from '@supabase/supabase-js'

type PageResult<T> = {
  data: T[] | null
  error: PostgrestError | null
}

export function formatSupabaseError(error: PostgrestError) {
  const parts = [error.message]
  if (error.hint) parts.push(`hint: ${error.hint}`)
  if (error.details) parts.push(`details: ${error.details}`)
  if (error.code) parts.push(`code: ${error.code}`)
  return parts.join(' | ')
}

export function throwIfSupabaseError(
  error: PostgrestError | null | undefined,
  context: string,
) {
  if (!error) return
  throw new Error(`${context}: ${formatSupabaseError(error)}`)
}

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  context: string,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = []
  let from = 0

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await fetchPage(from, to)
    throwIfSupabaseError(error, context)

    const page = data ?? []
    rows.push(...page)

    if (page.length < pageSize) break
    from += pageSize
  }

  return rows
}
