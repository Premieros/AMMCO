'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

export type SmartColumn = {
  key: string
  label: string
  numeric?: boolean
  hiddenByDefault?: boolean
}

type Row = Record<string, string | number | null>

function text(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function SmartTable({
  rows,
  columns,
  rowHrefKey,
  branchKey = 'branch_name',
  title,
}: {
  rows: Row[]
  columns: SmartColumn[]
  rowHrefKey?: string
  branchKey?: string
  title?: string
}) {
  const [search, setSearch] = useState('')
  const [selectedBranches, setSelectedBranches] = useState<string[]>([])
  const [hidden, setHidden] = useState<string[]>(
    columns.filter((c) => c.hiddenByDefault).map((c) => c.key),
  )
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})

  const branches = useMemo(
    () => [...new Set(rows.map((row) => text(row[branchKey])).filter(Boolean))].sort(),
    [rows, branchKey],
  )

  const visibleColumns = columns.filter((column) => !hidden.includes(column.key))
  const activeFilterCount = selectedBranches.length + Object.values(columnFilters).filter((value) => value.trim()).length + (search.trim() ? 1 : 0)

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let next = rows.filter((row) => {
      if (selectedBranches.length > 0 && !selectedBranches.includes(text(row[branchKey]))) return false
      if (q && !columns.some((column) => text(row[column.key]).toLowerCase().includes(q))) return false
      return columns.every((column) => {
        const filter = (columnFilters[column.key] ?? '').trim().toLowerCase()
        if (!filter) return true
        return text(row[column.key]).toLowerCase().includes(filter)
      })
    })

    if (sort) {
      next = [...next].sort((a, b) => {
        const left = a[sort.key]
        const right = b[sort.key]
        const ln = typeof left === 'number' ? left : Number.NaN
        const rn = typeof right === 'number' ? right : Number.NaN
        const cmp = Number.isFinite(ln) && Number.isFinite(rn)
          ? ln - rn
          : text(left).localeCompare(text(right), 'en', { numeric: true, sensitivity: 'base' })
        return sort.dir === 'asc' ? cmp : -cmp
      })
    }

    return next
  }, [rows, columns, search, selectedBranches, branchKey, columnFilters, sort])

  const toggleSort = (key: string) => {
    setSort((current) =>
      !current || current.key !== key
        ? { key, dir: 'asc' }
        : current.dir === 'asc'
          ? { key, dir: 'desc' }
          : null,
    )
  }

  return (
    <section className="card smart-table-card">
      <div className="smart-table-toolbar">
        <div>
          {title ? <h2>{title}</h2> : null}
          <span className="muted">{filteredRows.length} صف</span>
        </div>
        <div className="smart-table-tools">
          <input
            className="table-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث في كل الأعمدة..."
          />

          {branches.length > 1 ? (
            <details className="table-menu">
              <summary>{`فلتر الفروع${selectedBranches.length ? ` (${selectedBranches.length})` : ""}`}</summary>
              <div className="table-menu-panel">
                <button type="button" className="menu-clear" onClick={() => setSelectedBranches([])}>كل الفروع</button>
                {branches.map((branch) => (
                  <label key={branch}>
                    <input
                      type="checkbox"
                      checked={selectedBranches.includes(branch)}
                      onChange={() => setSelectedBranches((current) =>
                        current.includes(branch)
                          ? current.filter((item) => item !== branch)
                          : [...current, branch],
                      )}
                    />
                    <span>{branch}</span>
                  </label>
                ))}
              </div>
            </details>
          ) : null}

          <details className="table-menu">
            <summary>اختيار الأعمدة</summary>
            <div className="table-menu-panel">
              {columns.map((column) => (
                <label key={column.key}>
                  <input
                    type="checkbox"
                    checked={!hidden.includes(column.key)}
                    onChange={() => setHidden((current) =>
                      current.includes(column.key)
                        ? current.filter((item) => item !== column.key)
                        : [...current, column.key],
                    )}
                  />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          </details>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setSearch('')
                setSelectedBranches([])
                setColumnFilters({})
                setSort(null)
              }}
            >
              مسح الفلاتر ({activeFilterCount})
            </button>
          ) : null}
        </div>
      </div>

      <div className="table-wrap enterprise-table">
        <table>
          <thead>
            <tr>
              {visibleColumns.map((column) => (
                <th key={column.key}>
                  <button className="th-sort" type="button" onClick={() => toggleSort(column.key)}>
                    {column.label}
                    {sort?.key === column.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
            <tr className="column-filter-row">
              {visibleColumns.map((column) => (
                <th key={column.key}>
                  <input
                    value={columnFilters[column.key] ?? ''}
                    onChange={(event) => setColumnFilters((current) => ({
                      ...current,
                      [column.key]: event.target.value,
                    }))}
                    placeholder="فلتر"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, index) => {
              const href = rowHrefKey ? text(row[rowHrefKey]) : ''
              const cells = visibleColumns.map((column) => (
                <td key={column.key} className={column.numeric ? 'num-cell' : undefined}>
                  {column.key === branchKey
                    ? <span className="branch-badge">{text(row[column.key]) || '-'}</span>
                    : href
                      ? <Link href={href}>{text(row[column.key]) || '-'}</Link>
                      : (text(row[column.key]) || '-')}
                </td>
              ))

              return href
                ? <tr className="click-row" key={href || index}>{cells}</tr>
                : <tr key={index}>{cells}</tr>
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
