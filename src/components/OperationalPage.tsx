import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, ChevronLeft, ChevronRight, Download, Ellipsis, Eye, List, Search, SlidersHorizontal } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { toast } from 'sonner'
import { useSelector } from 'react-redux'
import { applications, collections } from '../data/mock-data'
import { formatDate, formatUGX } from '../lib/format'
import type { TableRow } from '../lib/types'
import type { PageColumn, PageDefinition } from '../app/page-registry'
import { Avatar, Button, Card, Input, Select, StatusBadge } from './ui/primitives'
import type { RootState } from '../store/store'
import { Dialog, DialogContent } from './ui/dialog'

function displayValue(row: TableRow, column: PageColumn) {
  const value = row[column.key]
  if (value === undefined || value === null || value === '') return '—'
  if (column.format === 'money' && typeof value === 'number') return formatUGX(value)
  if (column.format === 'date' && typeof value === 'string') return formatDate(value)
  return String(value)
}

function exportRows(rows: TableRow[], title: string) {
  if (!rows.length) { toast.info('There are no rows to export.'); return }
  const headers = Object.keys(rows[0])
  const safeCell = (value: unknown) => {
    const text = String(value ?? '')
    const protectedText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    return `"${protectedText.replaceAll('"', '""')}"`
  }
  const csv = [headers.map(safeCell).join(','), ...rows.map((row) => headers.map((key) => safeCell(row[key])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-demo.csv`; anchor.click(); URL.revokeObjectURL(url)
  toast.success('Demo export downloaded', { description: 'Connect the report API to export verified production records.' })
}

function ScheduleCalendar({ rows, onOpen, month, setMonth }: { rows: TableRow[]; onOpen: (row: TableRow) => void; month: Date; setMonth: (value: Date) => void }) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstDayOffset = (new Date(year, monthIndex, 1).getDay() + 6) % 7
  const days = Array.from({ length: 42 }, (_, index) => new Date(year, monthIndex, index - firstDayOffset + 1))
  const rowsByDay = new Map<string, TableRow[]>()
  for (const row of rows) {
    if (typeof row.due !== 'string') continue
    const bucket = rowsByDay.get(row.due) ?? []
    bucket.push(row)
    rowsByDay.set(row.due, bucket)
  }
  const today = new Date().toISOString().slice(0, 10)
  return <Card className="schedule-calendar-card"><div className="calendar-toolbar"><div><h2>Repayment calendar</h2><p>Calendar dates reflect the illustrative schedule records currently loaded.</p></div><div className="calendar-month-controls"><Button variant="outline" size="sm" className="lf-button-icon" aria-label="Previous month" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}><ChevronLeft size={15} /></Button><strong>{month.toLocaleString('en-UG', { month: 'long', year: 'numeric' })}</strong><Button variant="outline" size="sm" className="lf-button-icon" aria-label="Next month" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}><ChevronRight size={15} /></Button></div></div><div className="calendar-grid" role="grid" aria-label="Repayment schedule calendar">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day} className="calendar-weekday" role="columnheader">{day}</div>)}{days.map((day) => {
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    const events = rowsByDay.get(key) ?? []
    return <div key={key} className={`calendar-day ${day.getMonth() !== monthIndex ? 'calendar-day-other' : ''} ${key === today ? 'calendar-day-today' : ''}`} role="gridcell"><span className="calendar-day-number">{day.getDate()}</span>{events.slice(0, 2).map((row) => <button key={String(row.id)} className={`calendar-event ${String(row.status).toLowerCase().includes('overdue') ? 'calendar-event-overdue' : String(row.status).toLowerCase().includes('paid') ? 'calendar-event-paid' : ''}`} title={`${String(row.customer)} · ${formatUGX(Number(row.expected ?? 0))}`} onClick={() => onOpen(row)}><strong>{String(row.customer ?? 'Customer')}</strong><small>{formatUGX(Number(row.expected ?? 0))}</small></button>)}{events.length > 2 && <span className="calendar-more">+{events.length - 2} more</span>}</div>
  })}</div><div className="calendar-legend"><span><i className="calendar-legend-blue" /> Upcoming / due soon</span><span><i className="calendar-legend-amber" /> Overdue</span><span><i className="calendar-legend-green" /> Paid</span><small>Amounts must be confirmed by the lending service.</small></div></Card>
}

export function OperationalPage({ definition, path }: { definition: PageDefinition; path: string }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<TableRow | null>(null)
  const [followupNote, setFollowupNote] = useState('')
  const [scheduleView, setScheduleView] = useState<'list' | 'calendar'>('list')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(2026, 10, 1))
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null)
  const role = useSelector((state: RootState) => state.session.role)
  const canReview = ['Super Admin', 'Admin', 'Manager', 'Approver'].includes(role)
  const navigate = useNavigate()
  const allRows = definition.getRows()
  const filterKey = definition.filterKey
  const filterOptions = definition.filterOptions ?? (filterKey ? [...new Set(allRows.map((row) => String(row[filterKey] ?? '')).filter(Boolean))] : [])
  const filteredRows = useMemo(() => {
    const term = search.toLowerCase().trim()
    const matched = allRows.filter((row) => {
      const searchMatch = !term || Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(term))
      const filterMatch = !filterKey || filter === 'All' || String(row[filterKey] ?? '') === filter
      return searchMatch && filterMatch
    })
    if (!sort) return matched
    return matched.slice().sort((a, b) => {
      const first = String(a[sort.key] ?? '').toLowerCase(), second = String(b[sort.key] ?? '').toLowerCase()
      return (first < second ? -1 : first > second ? 1 : 0) * (sort.direction === 'asc' ? 1 : -1)
    })
  }, [allRows, filter, filterKey, search, sort])
  const pageSize = 7
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)

  function openRow(row: TableRow) {
    const key = definition.detailKey ? row[definition.detailKey] : undefined
    if (definition.detailBase && key) navigate(`${definition.detailBase}/${encodeURIComponent(String(key))}`)
    else if (path === '/approvals' && row.id) navigate(`/applications/${encodeURIComponent(String(row.id))}`)
    else setSelected(row)
  }

  async function decide(row: TableRow, decision: 'approve' | 'reject') {
    if (!canReview) { toast.error('This demo role cannot decide applications.', { description: 'Only an authorized approver role can submit a decision to the backend.' }); return }
    const result = await Swal.fire({
      title: `${decision === 'approve' ? 'Approve' : 'Reject'} this application?`,
      text: 'This is a local demo action. A connected backend must validate and record all application decisions.',
      input: 'textarea', inputLabel: 'Decision notes', inputPlaceholder: 'Add a clear, reviewable note…',
      icon: decision === 'approve' ? 'question' : 'warning', showCancelButton: true,
      confirmButtonText: `Confirm ${decision}`, confirmButtonColor: decision === 'approve' ? '#2563eb' : '#c14949', cancelButtonText: 'Go back',
    })
    if (!result.isConfirmed) return
    const application = applications.find((item) => item.id === row.id)
    if (application) application.status = decision === 'approve' ? 'Approved' : 'Rejected'
    toast.success(`Demo decision ${decision === 'approve' ? 'approved' : 'rejected'}`, { description: `Decision details on ${String(row.id)} are only held in local sample data.` })
    setFilter('All')
  }

  function saveFollowup() {
    if (!selected) return
    const record = collections.find((item) => item.id === selected.id)
    if (record) { record.note = followupNote.trim() || record.note; record.status = 'Contacted' }
    toast.success('Follow-up saved in local demo activity', { description: 'Production communication history needs backend persistence and access controls.' })
    setSelected(null)
  }

  const headingAction = definition.newTo
    ? <Button onClick={() => navigate(definition.newTo!)}>{definition.newLabel ?? 'Add new'} <span>+</span></Button>
    : definition.newLabel
      ? <Button onClick={() => toast.success('Invitation form ready', { description: 'User provisioning will be connected to the backend.' })}>+ {definition.newLabel}</Button>
      : path === '/approvals'
        ? <span className="role-notice">Viewing as <strong>{role}</strong></span>
        : null

  return <div className="operational-page">
    <div className="page-heading"><div><div className="eyebrow">LENDING OPERATIONS <span className="eyebrow-separator">/</span> RECORDS</div><h1>{definition.title}</h1><p>{definition.subtitle}</p></div><div className="heading-actions">{headingAction}</div></div>
    {definition.stats && <div className="module-stats-grid">{definition.stats.map((stat) => <Card className="module-stat" key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong><small>{stat.helper}</small></Card>)}</div>}
    {path === '/approvals' && <div className="info-callout"><span className="callout-icon">i</span><span>Application decisions should be recorded by an authorized approver. This prototype shows the workflow only; the backend must validate permissions and preserve the audit trail.</span><Link to="/staff">Manage roles</Link></div>}
    {path === '/collections' && <div className="info-callout collection-callout"><span className="callout-icon">i</span><span>Keep all customer communication respectful, lawful and transparent. Record only necessary follow-up details.</span><button onClick={() => toast.info('Complaint handling guidance is planned for the operational handbook.')}>View guidance</button></div>}
    <Card className="data-table-card"><div className="table-card-top"><div><h2>{path === '/customers' ? 'All customers' : path === '/approvals' ? 'Review queue' : path === '/loans' ? 'Loan accounts' : path === '/collections' ? 'Follow-up queue' : `All ${definition.title.toLowerCase()}`}</h2><p>{filteredRows.length} records <span>·</span> Updated moments ago <span className="demo-label">Demo dataset</span></p></div><Button variant="outline" size="sm" icon={Download} onClick={() => exportRows(filteredRows, definition.title)}>Export</Button></div>
      <div className="table-toolbar"><div className="table-search"><Search size={16} /><Input placeholder={`Search ${definition.title.toLowerCase()}...`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} aria-label={`Search ${definition.title}`} /></div><div className="table-tools">{filterKey && <Select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1) }} aria-label={definition.filterLabel ?? 'Filter records'}><option value="All">{definition.filterLabel ? `All ${definition.filterLabel.toLowerCase()}s` : 'All statuses'}</option>{filterOptions.map((option) => <option key={option} value={option}>{option}</option>)}</Select>}{path === '/schedules' && <div className="view-switch" role="group" aria-label="Repayment schedule view"><button className={scheduleView === 'list' ? 'view-switch-active' : ''} onClick={() => setScheduleView('list')} aria-pressed={scheduleView === 'list'}><List size={13} />List</button><button className={scheduleView === 'calendar' ? 'view-switch-active' : ''} onClick={() => setScheduleView('calendar')} aria-pressed={scheduleView === 'calendar'}><CalendarDays size={13} />Calendar</button></div>}<Button variant="outline" size="sm" icon={SlidersHorizontal} onClick={() => toast.info('Additional filters will connect to date, officer and branch API filters.')}>Filters</Button></div></div>
      {path === '/schedules' && scheduleView === 'calendar' ? <ScheduleCalendar rows={filteredRows} onOpen={openRow} month={calendarMonth} setMonth={setCalendarMonth} /> : <><div className="table-scroll"><table className="lf-table"><thead><tr>{definition.columns.map((column) => <th key={column.key}><button className="sort-button" onClick={() => setSort((current) => current?.key === column.key ? { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key: column.key, direction: 'asc' })}>{column.label}{sort?.key === column.key ? sort.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={12} />}</button></th>)}<th className="actions-header"> </th></tr></thead><tbody>
        {pageRows.map((row, index) => <tr key={String(row.id ?? row.ref ?? index)} onClick={() => openRow(row)} className="data-row">{definition.columns.map((column) => <td key={column.key}>{column.format === 'person' ? <span className="table-person"><Avatar name={String(row[column.key] ?? '—')} size="sm" /><strong>{String(row[column.key] ?? '—')}</strong></span> : column.format === 'status' ? <StatusBadge status={String(row[column.key] ?? 'Unknown')} /> : column.format === 'mono' ? <span className="mono-text">{String(row[column.key] ?? '—')}</span> : column.format === 'tag' ? <span className="soft-tag">{String(row[column.key] ?? '—')}</span> : <span className={column.format === 'money' ? 'money-cell' : ''}>{displayValue(row, column)}</span>}</td>)}<td onClick={(event) => event.stopPropagation()}><DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="row-more" aria-label="Record actions"><Ellipsis size={18} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" align="end" sideOffset={4}><DropdownMenu.Item className="dropdown-item" onSelect={() => openRow(row)}><Eye size={15} /> View details</DropdownMenu.Item>{path === '/approvals' && canReview && <><DropdownMenu.Item className="dropdown-item" onSelect={() => void decide(row, 'approve')}>✓ Approve demo</DropdownMenu.Item><DropdownMenu.Item className="dropdown-item dropdown-danger" onSelect={() => void decide(row, 'reject')}>× Reject demo</DropdownMenu.Item></>}{path === '/collections' && <DropdownMenu.Item className="dropdown-item" onSelect={() => { setFollowupNote(String(row.note ?? '')); setSelected(row) }}>Log follow-up</DropdownMenu.Item>}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></td></tr>)}
        {pageRows.length === 0 && <tr><td colSpan={definition.columns.length + 1}><div className="table-empty"><span><Search size={21} /></span><strong>No matching records</strong><p>Try changing your search or filters.</p><Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFilter('All') }}>Clear filters</Button></div></td></tr>}
      </tbody></table></div><div className="table-pagination"><span>Showing <strong>{filteredRows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredRows.length)}</strong> of <strong>{filteredRows.length}</strong> records</span><div className="pagination-buttons"><button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} aria-label="Previous page"><ChevronLeft size={16} /></button><span>Page <strong>{page}</strong> of {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} aria-label="Next page"><ChevronRight size={16} /></button></div></div></>}
    </Card>
    <div className="data-footnote">Sample records for interface demonstration. Financial values, approvals and payment status require a connected backend for production.</div>
    <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent title={path === '/collections' ? 'Collection follow-up' : 'Record details'} description={path === '/collections' ? 'Add a clear, respectful note to the local demo record.' : 'Illustrative record information from the demo dataset.'} className="record-dialog">{selected && <div className="record-detail-grid">{Object.entries(selected).filter(([key]) => !['note'].includes(key)).map(([key, value]) => <div className="record-field" key={key}><span>{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase())}</span><strong>{typeof value === 'number' && ['amount', 'outstanding', 'overdue', 'expected', 'paid', 'income'].includes(key) ? formatUGX(value) : String(value ?? '—')}</strong></div>)}</div>}{path === '/collections' && <div className="followup-note"><span>Previous note</span><p>{String(selected?.note ?? 'No notes on this record yet.')}</p><span>New communication note</span><Input value={followupNote} placeholder="Record a respectful, necessary interaction note…" onChange={(event) => setFollowupNote(event.target.value)} maxLength={500} /></div>}<div className="dialog-actions"><Button variant="outline" onClick={() => setSelected(null)}>Close</Button>{path === '/collections' && <Button onClick={saveFollowup}>Save follow-up</Button>}</div></DialogContent></Dialog>
  </div>
}
