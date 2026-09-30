'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowUpDown,
  Search,
  SlidersHorizontal,
  Download,
  ChevronRight,
  ChevronLeft,
  ChevronsRight,
  ChevronsLeft,
  Layers,
} from 'lucide-react'

export interface TableColumn<T> {
  key: keyof T | string
  label: string
  numeric?: boolean
  render?: (row: T) => React.ReactNode
  sortable?: boolean
  hideByDefault?: boolean
}

interface SmartDataTableProps<T> {
  title?: string
  subtitle?: string
  rows: T[]
  columns: TableColumn<T>[]
  rowHrefKey?: string
  onExportExcel?: () => void
  groupByOptions?: { key: keyof T | string; label: string }[]
  topTotals?: Record<string, string | number>
}

export function SmartDataTable<T extends Record<string, any>>({
  title,
  subtitle,
  rows,
  columns,
  rowHrefKey,
  onExportExcel,
  groupByOptions = [],
  topTotals,
}: SmartDataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState<string>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    return new Set(columns.filter((c) => !c.hideByDefault).map((c) => String(c.key)))
  })
  const [showColPicker, setShowColPicker] = useState(false)
  const [groupBy, setGroupBy] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(50)

  // Toggle Column Visibility
  const toggleColumn = (key: string) => {
    const next = new Set(visibleColumns)
    if (next.has(key)) {
      if (next.size > 2) next.delete(key) // keep at least 2
    } else {
      next.add(key)
    }
    setVisibleColumns(next)
  }

  // Filter & Search
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows

    const q = searchTerm.toLowerCase()
    return rows.filter((r) => {
      for (const col of columns) {
        const val = r[col.key]
        if (val !== undefined && val !== null) {
          if (String(val).toLowerCase().includes(q)) return true
        }
      }
      return false
    })
  }, [rows, searchTerm, columns])

  // Sorting
  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows

    return [...filteredRows].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]

      if (aVal === bVal) return 0
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      const numA = Number(aVal)
      const numB = Number(bVal)
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
        return sortOrder === 'asc' ? numA - numB : numB - numA
      }

      const strA = String(aVal).toLowerCase()
      const strB = String(bVal).toLowerCase()
      return sortOrder === 'asc'
        ? strA.localeCompare(strB, 'ar')
        : strB.localeCompare(strA, 'ar')
    })
  }, [filteredRows, sortKey, sortOrder])

  // Grouping
  const groupedData = useMemo(() => {
    if (!groupBy) return null

    const groups = new Map<string, T[]>()
    for (const r of sortedRows) {
      const gKey = String(r[groupBy] ?? 'غير محدد')
      const list = groups.get(gKey) ?? []
      list.push(r)
      groups.set(gKey, list)
    }
    return groups
  }, [sortedRows, groupBy])

  // Pagination
  const totalItems = sortedRows.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const paginatedRows = useMemo(() => {
    if (pageSize === 0) return sortedRows // All
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, currentPage, pageSize])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortOrder('desc')
    }
  }

  const activeCols = columns.filter((c) => visibleColumns.has(String(c.key)))

  return (
    <div className="smart-excel-table-container">
      {/* Table Toolbar */}
      <div className="smart-table-toolbar">
        <div className="toolbar-start">
          {title && (
            <div className="table-headline">
              <h3>{title}</h3>
              {subtitle && <span className="table-subtitle">{subtitle}</span>}
            </div>
          )}

          {/* Search Box */}
          <div className="table-search-box">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="بحث في جميع الحقول والأصناف..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
            />
            {searchTerm && (
              <button
                type="button"
                className="clear-search"
                onClick={() => setSearchTerm('')}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="toolbar-end">
          {/* Group By selector */}
          {groupByOptions.length > 0 && (
            <div className="table-group-selector">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={groupBy}
                onChange={(e) => {
                  setGroupBy(e.target.value)
                  setCurrentPage(1)
                }}
              >
                <option value="">بدون تجميع</option>
                {groupByOptions.map((opt) => (
                  <option key={String(opt.key)} value={String(opt.key)}>
                    تجميع حسب: {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Column Visibility Picker */}
          <div className="col-picker-anchor">
            <button
              type="button"
              className="btn-toolbar"
              onClick={() => setShowColPicker(!showColPicker)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>الأعمدة ({activeCols.length})</span>
            </button>

            {showColPicker && (
              <div className="col-picker-dropdown">
                <div className="col-picker-header">
                  <strong>اختيار الأعمدة المعروضة</strong>
                  <button
                    type="button"
                    onClick={() => setShowColPicker(false)}
                    className="close-picker"
                  >
                    ✕
                  </button>
                </div>
                <div className="col-picker-list">
                  {columns.map((col) => {
                    const k = String(col.key)
                    const checked = visibleColumns.has(k)
                    return (
                      <label key={k} className="col-picker-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleColumn(k)}
                        />
                        <span>{col.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Excel Export */}
          {onExportExcel && (
            <button
              type="button"
              className="btn-toolbar btn-export"
              onClick={onExportExcel}
              title="تصدير كامل البيانات إلى Excel"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* Top Totals Banner (Requirement 18: إجمالي أعلى التقرير) */}
      {topTotals && (
        <div className="table-top-summary-strip">
          <div className="summary-strip-badge">إجمالي النتائج</div>
          <div className="summary-strip-values">
            {Object.entries(topTotals).map(([k, v]) => (
              <div className="strip-item" key={k}>
                <span className="strip-label">{k}:</span>
                <strong className="strip-val">{v}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable Table Area with Sticky Headers & Sticky First Column */}
      <div className="excel-scroll-frame">
        <table className="excel-table">
          <thead>
            <tr>
              {activeCols.map((col, idx) => {
                const k = String(col.key)
                const isSorted = sortKey === k
                const isFirstCol = idx === 0

                return (
                  <th
                    key={k}
                    className={`${isFirstCol ? 'sticky-first-col' : ''} ${
                      col.numeric ? 'cell-numeric' : ''
                    }`}
                    onClick={() => handleSort(k)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="th-content">
                      <span>{col.label}</span>
                      <ArrowUpDown
                        className={`sort-icon w-3 h-3 ${
                          isSorted ? 'sort-active' : 'opacity-30'
                        }`}
                      />
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {groupedData ? (
              // Grouped Render
              [...groupedData.entries()].map(([gName, gRows]) => (
                <tbody key={gName} className="group-body">
                  <tr className="group-header-row">
                    <td colSpan={activeCols.length}>
                      <span className="group-title">
                        {gName} ({gRows.length} بند)
                      </span>
                    </td>
                  </tr>
                  {gRows.map((row, rIdx) => {
                    const href = rowHrefKey ? row[rowHrefKey] : null
                    return (
                      <tr key={rIdx} className={href ? 'clickable-row' : ''}>
                        {activeCols.map((col, cIdx) => {
                          const isFirstCol = cIdx === 0
                          const cellVal = col.render ? col.render(row) : row[col.key]

                          return (
                            <td
                              key={String(col.key)}
                              className={`${isFirstCol ? 'sticky-first-col' : ''} ${
                                col.numeric ? 'cell-numeric' : ''
                              }`}
                            >
                              {href && isFirstCol ? (
                                <Link href={href} className="drill-link">
                                  {cellVal}
                                </Link>
                              ) : (
                                cellVal
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              ))
            ) : paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={activeCols.length} className="empty-cell">
                  لا توجد نتائج مطابقة لشروط البحث
                </td>
              </tr>
            ) : (
              // Standard Flat Render
              paginatedRows.map((row, rIdx) => {
                const href = rowHrefKey ? row[rowHrefKey] : null
                return (
                  <tr key={rIdx} className={href ? 'clickable-row' : ''}>
                    {activeCols.map((col, cIdx) => {
                      const isFirstCol = cIdx === 0
                      const cellVal = col.render ? col.render(row) : row[col.key]

                      return (
                        <td
                          key={String(col.key)}
                          className={`${isFirstCol ? 'sticky-first-col' : ''} ${
                            col.numeric ? 'cell-numeric' : ''
                          }`}
                        >
                          {href && isFirstCol ? (
                            <Link href={href} className="drill-link">
                              {cellVal}
                            </Link>
                          ) : (
                            cellVal
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {!groupedData && (
        <div className="table-pagination-footer">
          <div className="pagination-info">
            عرض <strong>{Math.min(totalItems, (currentPage - 1) * pageSize + 1)}</strong> إلى{' '}
            <strong>{Math.min(totalItems, currentPage * pageSize)}</strong> من أصل{' '}
            <strong>{totalItems}</strong> صف
          </div>

          <div className="pagination-controls">
            <div className="page-size-selector">
              <span>لكل صفحة:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={500}>500</option>
              </select>
            </div>

            <div className="page-buttons">
              <button
                type="button"
                className="page-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                className="page-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <span className="page-current">
                صفحة {currentPage} من {totalPages}
              </span>
              <button
                type="button"
                className="page-btn"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                className="page-btn"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
