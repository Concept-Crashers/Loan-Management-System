import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, ChevronLeft, ChevronRight, Download, Ellipsis, Eye, EyeOff, List, Search, SlidersHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { toast } from 'sonner'
import { useSelector } from 'react-redux'
import { formatDate, formatUGX } from '../lib/format'
import type { TableRow } from '../lib/types'
import type { PageColumn, PageDefinition } from '../app/page-registry'
import { Avatar, Button, Card, Field, Input, Select, StatusBadge, Textarea } from './ui/primitives'
import type { RootState } from '../store/store'
import { Dialog, DialogContent } from './ui/dialog'
import { PhoneNumberInput } from './ui/PhoneNumberInput'
import { api } from '../lib/services'
import { getRecordDetail } from '../lib/api'

function displayValue(row: TableRow, column: PageColumn) {
  const value = row[column.key]
  if (value === undefined || value === null || value === '') return '—'
  if (column.format === 'money' && typeof value === 'number') return formatUGX(value)
  if (column.format === 'date' && typeof value === 'string') return formatDate(value)
  return String(value)
}

function recordViewLabel(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bId\b/g, 'ID')
    .replace(/\bUgx\b/g, 'UGX')
}

function recordViewValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? value.map((item) => recordViewValue(key, item)).join(', ') : '—'
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>
    const direct = item.name ?? item.fullName ?? item.reference ?? item.customerNumber ?? item.label
    if (direct !== undefined) return recordViewValue(key, direct)
    return Object.keys(item).length ? 'Additional details' : '—'
  }
  if (typeof value === 'number') {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
    if (normalized.endsWith('minor')) return formatUGX(value / 100)
    if (/(amount|outstanding|overdue|expected|paid|income|balance|principal|fees|interest)$/.test(normalized)) return formatUGX(value)
  }
  if (typeof value === 'string' && /(date|due|submitted|registered|created|updated)/i.test(key) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatDate(value)
  }
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
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}.csv`; anchor.click(); URL.revokeObjectURL(url)
  toast.success('Export downloaded')
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
  return <Card className="schedule-calendar-card"><div className="calendar-toolbar"><div><h2>Repayment calendar</h2><p>Calendar dates reflect scheduled loan installments.</p></div><div className="calendar-month-controls"><Button variant="outline" size="sm" className="lf-button-icon" aria-label="Previous month" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}><ChevronLeft size={15} /></Button><strong>{month.toLocaleString('en-UG', { month: 'long', year: 'numeric' })}</strong><Button variant="outline" size="sm" className="lf-button-icon" aria-label="Next month" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}><ChevronRight size={15} /></Button></div></div><div className="calendar-grid" role="grid" aria-label="Repayment schedule calendar">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day} className="calendar-weekday" role="columnheader">{day}</div>)}{days.map((day) => {
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    const events = rowsByDay.get(key) ?? []
    return <div key={key} className={`calendar-day ${day.getMonth() !== monthIndex ? 'calendar-day-other' : ''} ${key === today ? 'calendar-day-today' : ''}`} role="gridcell"><span className="calendar-day-number">{day.getDate()}</span>{events.slice(0, 2).map((row) => <button key={String(row.id)} className={`calendar-event ${String(row.status).toLowerCase().includes('overdue') ? 'calendar-event-overdue' : String(row.status).toLowerCase().includes('paid') ? 'calendar-event-paid' : ''}`} title={`${String(row.customer)} · ${formatUGX(Number(row.expected ?? 0))}`} onClick={() => onOpen(row)}><strong>{String(row.customer ?? 'Customer')}</strong><small>{formatUGX(Number(row.expected ?? 0))}</small></button>)}{events.length > 2 && <span className="calendar-more">+{events.length - 2} more</span>}</div>
  })}</div><div className="calendar-legend"><span><i className="calendar-legend-blue" /> Upcoming / due soon</span><span><i className="calendar-legend-amber" /> Overdue</span><span><i className="calendar-legend-green" /> Paid</span></div></Card>
}

export function OperationalPage({ definition, path }: { definition: PageDefinition; path: string }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState<TableRow | null>(null)
  const [decisionRequest, setDecisionRequest] = useState<{ row: TableRow; decision: 'approve' | 'reject' } | null>(null)
  const [decisionNotes, setDecisionNotes] = useState('')
  const [decisionSubmitting, setDecisionSubmitting] = useState(false)
  const [branchModal, setBranchModal] = useState(false)
  const [branchForm, setBranchForm] = useState({ code: '', name: '', district: '', managerId: '' })
  const [branchSaving, setBranchSaving] = useState(false)
  const [editBranch, setEditBranch] = useState<TableRow | null>(null)
  const [staffOptions, setStaffOptions] = useState<Array<{ id: string; name: string }>>([])
  const [staffModal, setStaffModal] = useState(false)
  const [staffForm, setStaffForm] = useState({ name: '', email: '', password: '', phone: '', roles: 'loan_officer' })
  const [staffSaving, setStaffSaving] = useState(false)
  const [staffShowPassword, setStaffShowPassword] = useState(false)
  const [editStaff, setEditStaff] = useState<TableRow | null>(null)
  const [editStaffForm, setEditStaffForm] = useState({ name: '', email: '', phone: '', roles: 'loan_officer' })
  const [editStaffSaving, setEditStaffSaving] = useState(false)
  const [followupNote, setFollowupNote] = useState('')
  const [scheduleView, setScheduleView] = useState<'list' | 'calendar'>('list')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null)
  const [remoteRows, setRemoteRows] = useState<TableRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const role = useSelector((state: RootState) => state.session.role)
  const roles = useSelector((state: RootState) => state.session.user?.roles ?? [])
  const permissions = useSelector((state: RootState) => state.session.user?.permissions ?? [])
  const isSuperAdmin = roles.some((r) => ['super_admin','super-admin','superadmin','admin'].includes(String(r).toLowerCase().replace(/[\s-]+/g, '_')))
  const canReview = isSuperAdmin || ['Super Admin', 'Admin', 'Manager', 'Approver'].includes(role) || permissions.includes('loans.applications.approve')
  const navigate = useNavigate()

  const loadData = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      if (path === '/customers') {
        const rows = await api.listCustomers()
        setRemoteRows(rows.map((item) => ({ id: item.id, name: item.name, phone: item.phone, district: item.district, loans: item.loans, outstanding: item.outstanding, status: item.status, registered: item.registered })))
      } else if (path === '/products') {
        const rows = await api.listProducts()
        setRemoteRows(rows.map((item) => ({ id: item.id, name: item.name, range: `${formatUGX(item.minAmount)} – ${formatUGX(item.maxAmount)}`, rate: `${item.interestRate}%`, duration: `${item.duration} months`, frequency: item.frequency, state: item.active ? 'Active' : 'Inactive' })))
      } else if (path === '/applications') {
        const rows = await api.listApplications()
        setRemoteRows(rows.map((item) => ({ id: item.id, customer: item.customer, customerId: item.customerId, product: item.product, amount: item.amount, duration: `${item.duration} months`, officer: item.officer, submitted: item.submitted, status: item.status, version: item.version })))
      } else if (path === '/approvals') {
        const rows = await api.listApplications()
        const visible = rows.filter((item) => ['submitted', 'under review', 'assessment required', 'approval pending'].includes(String(item.status).toLowerCase()))
        setRemoteRows(visible.map((item) => ({ id: item.id, customer: item.customer, customerId: item.customerId, product: item.product, amount: item.amount, income: item.income, officer: item.officer, submitted: item.submitted, status: item.status, version: item.version })))
      } else if (path === '/loans') {
        const rows = await api.listLoans()
        setRemoteRows(rows.map((item) => ({ ref: item.ref, customer: item.customer, customerId: item.customerId, product: item.product, principal: item.principal, outstanding: item.outstanding, nextDue: item.nextDue, status: item.status })))
      } else if (path === '/disbursements') {
        const rows = await api.listLoans()
        const pending = rows.filter((item) => item.status === 'Pending Disbursement')
        setRemoteRows(pending.map((item) => ({ ref: item.ref, customer: item.customer, product: item.product, amount: item.principal, branch: item.branchId || 'Primary Branch', submitted: item.start, state: 'Pending Disbursement' })))
      } else if (path === '/repayments') {
        const rows = await api.listRepayments()
        setRemoteRows(rows.map((item) => ({ id: item.id, recordId: (item as any).recordId ?? item.id, customer: item.customer, customerId: item.customerId, loan: item.loan, amount: item.amount, method: item.method, date: item.date, receivedBy: item.receivedBy, status: item.status })))
      } else if (path === '/schedules') {
        const rows = await api.listSchedules()
        setRemoteRows(rows.map((item) => ({ id: item.id, due: item.due, customer: item.customer, loan: item.loan, expected: item.expected, paid: item.paid, officer: item.officer, status: item.status })))
      } else if (path === '/collections') {
        const rows = await api.listCollections()
        setRemoteRows(rows.map((item) => ({ id: item.id, customer: item.customer, loan: item.loan, outstanding: item.outstanding, overdue: item.overdue, lastPayment: item.lastPayment, followUp: item.followUp, officer: item.officer, status: item.status, note: item.note, phone: item.phone })))
      } else if (path === '/transactions') {
        const rows = await api.listTransactions()
        setRemoteRows(rows.map((item) => ({ id: item.id, type: item.type, reference: item.reference, customer: item.customer, amount: item.amount, method: item.method, date: item.date, status: item.status, recordedBy: item.recordedBy })))
      } else if (path === '/staff') {
        const rows = await api.listStaff()
        setRemoteRows(rows.map((item) => ({ id: item.id, name: item.name, email: item.email, phone: item.phone, role: item.role, branch: item.branch, lastActive: item.lastActive, status: item.status })))
      } else if (path === '/branches') {
        const rows = await api.listBranches()
        setRemoteRows(rows.map((item) => ({ id: item.id, name: item.name, district: item.district, manager: item.manager, staff: item.staff, activeLoans: item.activeLoans, status: item.status })))
      } else if (path === '/audit-logs') {
        const rows = await api.listAuditLogs()
        setRemoteRows(rows.map((item) => ({ id: item.id, action: item.action, description: item.description, actor: item.actor, record: item.record, branch: item.branch, date: item.date })) as any)
      } else {
        setRemoteRows([])
      }
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Records could not be loaded from server.')
      setRemoteRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  useEffect(() => {
    if (!branchModal && !editBranch) return
    if (staffOptions.length) return
    void api.listStaff().then((rows) => setStaffOptions(rows.map((r) => ({ id: r.id, name: r.name })))).catch(() => {})
  }, [branchModal, editBranch, staffOptions.length])

  const allRows = remoteRows ?? []
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

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)
  const visiblePageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1).slice(Math.max(0, page - 2), Math.min(pageCount, page + 1))

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  function openRow(row: TableRow) {
    if (path === '/staff' && isSuperAdmin) {
      setEditStaff(row)
      setEditStaffForm({ name: String(row.name ?? ''), email: String(row.email ?? ''), phone: String(row.phone ?? ''), roles: String(row.role ?? 'loan_officer').split(',')[0]?.trim() || 'loan_officer' })
      return
    }
    const key = definition.detailKey ? row[definition.detailKey] : undefined
    if (definition.detailBase && key) navigate(`${definition.detailBase}/${encodeURIComponent(String(key))}`)
    else if (path === '/approvals' && row.id) navigate(`/applications/${encodeURIComponent(String(row.id))}`)
    else setSelected(row)
  }

  async function requestDecision(row: TableRow, decision: 'approve' | 'reject') {
    if (!canReview) {
      toast.error('You do not have permission to decide applications.', { description: 'Only an authorized approver can record an underwriting decision.' })
      return
    }
    setDecisionNotes('')
    try {
      const fresh = await getRecordDetail('applications', String(row.id)) as any
      const merged = { ...row, version: Number(fresh?.version ?? row.version ?? 1), status: String(fresh?.status ?? row.status ?? '') }
      setDecisionRequest({ row: merged, decision })
    } catch {
      setDecisionRequest({ row, decision })
      toast.info('Could not refresh application version; using the current row.')
    }
  }

  async function confirmDecision() {
    if (!decisionRequest || decisionSubmitting) return
    const { row, decision } = decisionRequest
    setDecisionSubmitting(true)
    try {
      await api.decideApplication(
        String(row.id),
        decision === 'approve' ? 'approved' : 'rejected',
        decisionNotes.trim() || `Decision: ${decision}`,
        Number(row.version ?? 1)
      )
      toast.success(`Application ${decision === 'approve' ? 'approved' : 'rejected'} successfully`)
      setDecisionRequest(null)
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Decision could not be recorded.')
    } finally {
      setDecisionSubmitting(false)
    }
  }

  async function saveFollowup() {
    if (!selected) return
    try {
      await api.updateCollectionFollowup(String(selected.id), followupNote.trim(), 'contacted')
      toast.success('Follow-up record saved')
      setSelected(null)
      void loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update follow-up.')
    }
  }

  async function saveBranch() {
    if (!branchForm.name.trim() || !branchForm.district.trim()) { toast.error('Enter branch name and district.'); return }
    if (!editBranch && !branchForm.code.trim()) { toast.error('Enter branch code, name, and district.'); return }
    setBranchSaving(true)
    try {
      if (editBranch) {
        await api.updateBranch(String(editBranch.id), { name: branchForm.name.trim(), district: branchForm.district.trim(), managerId: branchForm.managerId || null })
        toast.success('Branch updated')
        setEditBranch(null)
      } else {
        await api.createBranch({ code: branchForm.code.trim(), name: branchForm.name.trim(), district: branchForm.district.trim(), managerId: branchForm.managerId || undefined })
        toast.success('Branch created')
        setBranchModal(false)
      }
      setBranchForm({ code: '', name: '', district: '', managerId: '' }); await loadData()
    } catch (e) { toast.error(e instanceof Error ? e.message : (editBranch ? 'Branch could not be updated.' : 'Branch could not be created.')) } finally { setBranchSaving(false) }
  }

  async function saveStaff() {
    if (!staffForm.name.trim() || !staffForm.email.trim() || staffForm.password.length < 12) { toast.error('Enter name, valid email, and a password with at least 12 characters.'); return }
    setStaffSaving(true)
    try {
      await api.createStaffUser({ name: staffForm.name.trim(), email: staffForm.email.trim(), password: staffForm.password, phone: staffForm.phone.trim() || undefined, roles: [staffForm.roles] })
      toast.success('Staff user created')
      setStaffModal(false); setStaffForm({ name: '', email: '', password: '', phone: '', roles: 'loan_officer' }); await loadData()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Staff user could not be created.') } finally { setStaffSaving(false) }
  }

  async function saveEditStaff() {
    if (!editStaff) return
    setEditStaffSaving(true)
    try {
      await api.updateStaffUser(String(editStaff.id), { name: editStaffForm.name.trim() || undefined, email: editStaffForm.email.trim() || undefined, phone: editStaffForm.phone.trim() || undefined, roles: [editStaffForm.roles] })
      toast.success('Staff user updated')
      setEditStaff(null); await loadData()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Staff user could not be updated.') } finally { setEditStaffSaving(false) }
  }

  const headingAction = definition.newTo
    ? <Button onClick={() => navigate(definition.newTo!)}>{definition.newLabel ?? 'Add new'} <span>+</span></Button>
    : definition.newLabel
      ? <Button onClick={() => path === '/branches' ? (setEditBranch(null), setBranchForm({ code: '', name: '', district: '', managerId: '' }), setBranchModal(true)) : path === '/staff' ? setStaffModal(true) : navigate('/settings')}>+ {definition.newLabel}</Button>
      : path === '/approvals'
        ? <span className="role-notice">Role: <strong>{role || 'Operations'}</strong></span>
        : null

  return (
    <div className="operational-page">
      {loadError && <div className="form-error" role="alert">{loadError}</div>}
      <div className="page-heading">
        <div>
          <div className="eyebrow">LENDING OPERATIONS <span className="eyebrow-separator">/</span> LIVE DATABASE</div>
          <h1>{definition.title}</h1>
          <p>{definition.subtitle}</p>
        </div>
        <div className="heading-actions">{headingAction}</div>
      </div>

      <Card className="data-table-card">
        <div className="table-card-top">
          <div>
            <h2>{path === '/customers' ? 'All customers' : path === '/approvals' ? 'Review queue' : path === '/loans' ? 'Loan accounts' : path === '/collections' ? 'Follow-up queue' : `All ${definition.title.toLowerCase()}`}</h2>
            <p>{loading ? 'Loading records…' : `${filteredRows.length} record${filteredRows.length === 1 ? '' : 's'}`}</p>
          </div>
          <Button variant="outline" size="sm" icon={Download} onClick={() => exportRows(filteredRows, definition.title)}>Export</Button>
        </div>

        <div className="table-toolbar">
          <div className="table-search">
            <Search size={16} />
            <Input placeholder={`Search ${definition.title.toLowerCase()}...`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} aria-label={`Search ${definition.title}`} />
          </div>
          <div className="table-tools">
            {filterKey && (
              <Select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1) }} aria-label={definition.filterLabel ?? 'Filter records'}>
                <option value="All">{definition.filterLabel ? `All ${definition.filterLabel.toLowerCase()}s` : 'All statuses'}</option>
                {filterOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            )}
            {path === '/schedules' && (
              <div className="view-switch" role="group" aria-label="Repayment schedule view">
                <button className={scheduleView === 'list' ? 'view-switch-active' : ''} onClick={() => setScheduleView('list')} aria-pressed={scheduleView === 'list'}><List size={13} />List</button>
                <button className={scheduleView === 'calendar' ? 'view-switch-active' : ''} onClick={() => setScheduleView('calendar')} aria-pressed={scheduleView === 'calendar'}><CalendarDays size={13} />Calendar</button>
              </div>
            )}
            <Button variant="outline" size="sm" icon={SlidersHorizontal} onClick={() => void loadData()}>Refresh</Button>
          </div>
        </div>

        {path === '/schedules' && scheduleView === 'calendar' ? (
          <ScheduleCalendar rows={filteredRows} onOpen={openRow} month={calendarMonth} setMonth={setCalendarMonth} />
        ) : (
          <>
            <div className="table-scroll">
              <table className="lf-table">
                <thead>
                  <tr>
                    {definition.columns.map((column) => (
                      <th key={column.key}>
                        <button className="sort-button" onClick={() => setSort((current) => current?.key === column.key ? { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key: column.key, direction: 'asc' })}>
                          {column.label}
                          {sort?.key === column.key ? sort.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={12} />}
                        </button>
                      </th>
                    ))}
                    <th className="actions-header"> </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, index) => (
                    <tr key={String(row.id ?? row.ref ?? index)} onClick={() => openRow(row)} className="data-row">
                      {definition.columns.map((column) => (
                        <td key={column.key}>
                          {column.format === 'person' ? (
                            <span className="table-person"><Avatar name={String(row[column.key] ?? '—')} size="sm" /><strong>{String(row[column.key] ?? '—')}</strong></span>
                          ) : column.format === 'status' ? (
                            <StatusBadge status={String(row[column.key] ?? 'Unknown')} />
                          ) : column.format === 'mono' ? (
                            <span className="mono-text">{String(row[column.key] ?? '—')}</span>
                          ) : column.format === 'tag' ? (
                            <span className="soft-tag">{String(row[column.key] ?? '—')}</span>
                          ) : (
                            <span className={column.format === 'money' ? 'money-cell' : ''}>{displayValue(row, column)}</span>
                          )}
                        </td>
                      ))}
                      <td onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button className="row-more" aria-label="Record actions"><Ellipsis size={18} /></button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content className="dropdown-content" align="end" sideOffset={4}>
                              <DropdownMenu.Item className="dropdown-item" onSelect={() => openRow(row)}>
                                <Eye size={15} /> View details
                              </DropdownMenu.Item>
                              {path === '/customers' && (
                                <DropdownMenu.Item className="dropdown-item" onSelect={async () => { try { const active = String(row.status ?? '').toLowerCase() === 'active'; const fresh: any = await getRecordDetail('customers', String(row.recordId ?? row.id)).catch(() => null); await api.updateCustomerStatus(String(row.recordId ?? row.id), active ? 'inactive' : 'active', Number(fresh?.version ?? row.version ?? 1)); toast.success(active ? 'Customer deactivated' : 'Customer activated'); void loadData() } catch (e) { toast.error(e instanceof Error ? e.message : 'Customer status could not be updated.') } }}>{String(row.status ?? '').toLowerCase() === 'active' ? 'Deactivate' : 'Activate'}</DropdownMenu.Item>
                              )}
                              {path === '/products' && (
                                <DropdownMenu.Item className="dropdown-item" onSelect={async () => { try { const next = String(row.state ?? '') === 'Active' ? 'inactive' : 'active'; await api.updateProductStatus(String(row.id), next); toast.success(`Loan product ${next === 'active' ? 'activated' : 'deactivated'}`); void loadData() } catch (e) { toast.error(e instanceof Error ? e.message : 'Product status could not be updated.') } }}>
                                  {String(row.state ?? '') === 'Active' ? 'Deactivate' : 'Activate'}
                                </DropdownMenu.Item>
                              )}
                              {path === '/staff' && (
                                <>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => { setEditStaff(row); setEditStaffForm({ name: String(row.name ?? ''), email: String(row.email ?? ''), phone: String(row.phone ?? ''), roles: String(row.role ?? 'loan_officer').split(',')[0]?.trim() || 'loan_officer' }) }}>Edit staff</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={async () => { try { const active = String(row.status ?? '').toLowerCase() === 'active'; await api.updateStaffUser(String(row.id), { status: active ? 'suspended' : 'active' }); toast.success(active ? 'Staff deactivated' : 'Staff activated'); void loadData() } catch (e) { toast.error(e instanceof Error ? e.message : 'Staff status could not be updated.') } }}>{String(row.status ?? '').toLowerCase() === 'active' ? 'Deactivate' : 'Activate'}</DropdownMenu.Item>
                                </>
                              )}
                              {path === '/branches' && (
                                <>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => { setEditBranch(row); setBranchForm({ code: String((row as any).code ?? row.id ?? ''), name: String(row.name ?? ''), district: String(row.district ?? ''), managerId: String((row as any).managerId ?? '') }); setBranchModal(true) }}>Edit branch</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={async () => { try { const active = String(row.status ?? '').toLowerCase() === 'active'; await api.updateBranch(String(row.id), { status: active ? 'suspended' : 'active' }); toast.success(active ? 'Branch deactivated' : 'Branch activated'); void loadData() } catch (e) { toast.error(e instanceof Error ? e.message : 'Branch status could not be updated.') } }}>{String(row.status ?? '').toLowerCase() === 'active' ? 'Deactivate' : 'Activate'}</DropdownMenu.Item>
                                </>
                              )}
                              {path === '/repayments' && String(row.status ?? '') === 'Pending review' && (
                                <DropdownMenu.Item className="dropdown-item" onSelect={async () => { try { await api.confirmRepayment(String(row.recordId ?? row.id)); toast.success('Repayment confirmed'); void loadData() } catch (e) { toast.error(e instanceof Error ? e.message : 'Repayment could not be confirmed.') } }}>Confirm payment</DropdownMenu.Item>
                              )}
                              {path === '/approvals' && canReview && (
                                <>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => void requestDecision(row, 'approve')}>✓ Approve</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item dropdown-danger" onSelect={() => void requestDecision(row, 'reject')}>× Reject</DropdownMenu.Item>
                                </>
                              )}
                              {path === '/collections' && (
                                <DropdownMenu.Item className="dropdown-item" onSelect={() => { setFollowupNote(String(row.note ?? '')); setSelected(row) }}>Log follow-up</DropdownMenu.Item>
                              )}
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </td>
                    </tr>
                  ))}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={definition.columns.length + 1}>
                        <div className="table-empty">
                          <span><Search size={21} /></span>
                          <strong>No records found</strong>
                          <p>{search ? 'Try adjusting your search criteria.' : 'No data recorded in the database yet.'}</p>
                          {search && <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFilter('All') }}>Clear search</Button>}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-pagination">
              <span>Showing <strong>{filteredRows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredRows.length)}</strong> of <strong>{filteredRows.length}</strong></span>
              <div className="pagination-controls">
                <label>Rows <select className="pagination-size" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }} aria-label="Rows per page"><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label>
                <div className="pagination-buttons">
                  <button disabled={page <= 1} onClick={() => setPage(1)} aria-label="First page">«</button>
                  <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} aria-label="Previous page"><ChevronLeft size={16} /></button>
                  {visiblePageNumbers.map((pageNumber) => <button key={pageNumber} className={pageNumber === page ? 'pagination-current' : ''} onClick={() => setPage(pageNumber)} aria-label={`Go to page ${pageNumber}`} aria-current={pageNumber === page ? 'page' : undefined}>{pageNumber}</button>)}
                  <button disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} aria-label="Next page"><ChevronRight size={16} /></button>
                  <button disabled={page >= pageCount} onClick={() => setPage(pageCount)} aria-label="Last page">»</button>
                </div>
              </div>
            </div>
          </>
        )}
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent
          title={path === '/collections' ? 'Collection follow-up' : 'Record details'}
          description={path === '/collections' ? 'Review the record and document the next customer interaction.' : 'A read-only snapshot of the selected record.'}
          className={`record-dialog record-view-dialog ${path === '/collections' ? 'record-followup-dialog' : ''}`}
        >
          {selected && (() => {
            const summaryOnly = new Set(['note', 'version', 'id', 'recordid', 'name', 'customer', 'product', 'loan', 'reference', 'ref', 'receiptnumber', 'accountnumber', 'status', 'state'])
            const fields = Object.entries(selected).filter(([key]) => !summaryOnly.has(key.replace(/[^a-z0-9]/gi, '').toLowerCase()))
            const metrics = Object.entries(selected).filter(([key, value]) => typeof value === 'number' && /^(amount|outstanding|overdue|expected|paid|balance|principal)$/i.test(key)).slice(0, 3)
            const heading = recordViewValue('name', selected.name ?? selected.customer ?? selected.product ?? selected.loan ?? 'Record')
            const reference = recordViewValue('reference', selected.reference ?? selected.ref ?? selected.receiptNumber ?? selected.accountNumber ?? selected.id ?? selected.recordId ?? 'Reference unavailable')
            const status = selected.status ?? selected.state
            return <>
              <div className="record-view-summary">
                <span className="record-view-symbol"><Eye size={19} aria-hidden="true" /></span>
                <div className="record-view-identity">
                  <span className="record-view-eyebrow">{definition.title} record</span>
                  <strong>{heading}</strong>
                  <small><span>Reference</span><code>{reference}</code></small>
                </div>
                <div className="record-view-status">{status ? <StatusBadge status={String(status)} /> : <span className="record-view-type">{definition.title}</span>}</div>
              </div>
              {metrics.length > 0 && <div className="record-view-metrics">{metrics.map(([key, value]) => <div className="record-view-metric" key={key}><span>{recordViewLabel(key)}</span><strong>{recordViewValue(key, value)}</strong></div>)}</div>}
              <div className="record-view-fields-heading"><h3>Record information</h3><span>{fields.length} {fields.length === 1 ? 'field' : 'fields'}</span></div>
              {fields.length ? <div className="record-detail-grid">
                {fields.map(([key, value]) => <div className="record-field" key={key}>
                  <span>{recordViewLabel(key)}</span>
                  <strong>{recordViewValue(key, value)}</strong>
                </div>)}
              </div> : <div className="record-view-empty">No additional record fields are available.</div>}
            </>
          })()}
          {path === '/collections' && (
            <div className="followup-note">
              <span>Previous note</span>
              <p>{String(selected?.note ?? 'No notes recorded yet.')}</p>
              <span>New interaction note</span>
              <Input value={followupNote} placeholder="Record interaction details…" onChange={(event) => setFollowupNote(event.target.value)} maxLength={500} />
            </div>
          )}
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
            {path === '/collections' && <Button onClick={saveFollowup}>Save follow-up</Button>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!decisionRequest} onOpenChange={(open) => !open && setDecisionRequest(null)}>
        <DialogContent title={`${decisionRequest?.decision === 'approve' ? 'Approve' : 'Reject'} application`} description="Submit an underwriting decision to the server." className="record-dialog">
          <div className="followup-note">
            <span>Application</span>
            <p>{String(decisionRequest?.row.id ?? '—')} · {String(decisionRequest?.row.customer ?? 'Applicant')} · status: {String(decisionRequest?.row.status ?? '—')} · v{String(decisionRequest?.row.version ?? 1)}</p>
            <span>Decision notes</span>
            <Textarea rows={4} value={decisionNotes} placeholder="Reason or underwriting conditions..." onChange={(event) => setDecisionNotes(event.target.value)} maxLength={500} />
          </div>
          <div className="dialog-actions">
            <Button variant="outline" disabled={decisionSubmitting} onClick={() => setDecisionRequest(null)}>Cancel</Button>
            <Button variant={decisionRequest?.decision === 'reject' ? 'danger' : 'primary'} loading={decisionSubmitting} onClick={() => void confirmDecision()}>
              Confirm {decisionRequest?.decision}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={branchModal} onOpenChange={(open) => { setBranchModal(open); if (!open) { setEditBranch(null); setBranchForm({ code: '', name: '', district: '', managerId: '' }) } }}>
        <DialogContent title={editBranch ? 'Edit branch' : 'Add branch'} description={editBranch ? 'Update branch details and branch manager assignment.' : 'Create a branch and optionally assign a branch manager from staff.'} className="record-dialog">
          <div className="form-grid" style={{ marginTop: 8 }}>
            <Field label="Branch code" required={!editBranch}><Input value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })} placeholder="e.g. KLA-01" disabled={!!editBranch} /></Field>
            <Field label="Branch name" required><Input value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} placeholder="e.g. Kampala Main" /></Field>
            <Field label="District" required><Input value={branchForm.district} onChange={(e) => setBranchForm({ ...branchForm, district: e.target.value })} placeholder="e.g. Kampala" /></Field>
            <Field label="Branch manager">
              <Select value={branchForm.managerId} onChange={(e) => setBranchForm({ ...branchForm, managerId: e.target.value })}>
                <option value="">{editBranch ? 'Keep/change manager (select staff to set)' : 'No manager assigned'}</option>
                {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="dialog-actions">
            <Button variant="outline" disabled={branchSaving} onClick={() => { setBranchModal(false); setEditBranch(null) }}>Cancel</Button>
            <Button loading={branchSaving} onClick={() => void saveBranch()}>{editBranch ? 'Save changes' : 'Create branch'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={staffModal} onOpenChange={setStaffModal}>
        <DialogContent title="Invite staff" description="Create a staff account. Admin/super_admin have full operational rights; roles are stored for workflow/assignment." className="record-dialog">
          <div className="form-grid" style={{ marginTop: 8 }}>
            <Field label="Full name" required><Input value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} placeholder="Staff name" /></Field>
            <Field label="Email" required><Input type="email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} placeholder="staff@example.com" /></Field>
            <Field label="Temporary password" required className="field-span-2">
              <div style={{ position: 'relative' }}>
                <Input type={staffShowPassword ? 'text' : 'password'} value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} placeholder="Min 12 chars, upper/lower/number" style={{ paddingRight: 34 }} />
                <button type="button" onClick={() => setStaffShowPassword((v) => !v)} aria-label={staffShowPassword ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', color: '#7f8da0', display: 'grid', placeItems: 'center', padding: 2, cursor: 'pointer' }}>
                  {staffShowPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>
            <Field label="Phone" hint="Select a country calling code (default +256) and enter the local number."><PhoneNumberInput value={staffForm.phone} onChange={(phone) => setStaffForm({ ...staffForm, phone })} /></Field>
            <Field label="Role">
              <Select value={staffForm.roles} onChange={(e) => setStaffForm({ ...staffForm, roles: e.target.value })}>
                <option value="loan_officer">Loan officer</option>
                <option value="approver">Approver</option>
                <option value="manager">Manager</option>
                <option value="finance">Finance / accounting</option>
                <option value="collections">Collections</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
          </div>
          <div className="dialog-actions">
            <Button variant="outline" disabled={staffSaving} onClick={() => setStaffModal(false)}>Cancel</Button>
            <Button loading={staffSaving} onClick={() => void saveStaff()}>Create staff</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editStaff} onOpenChange={(open) => !open && setEditStaff(null)}>
        <DialogContent title="Edit staff" description="Update staff details and role. To assign a branch manager, create/edit a branch and select this staff member." className="record-dialog">
          <div className="form-grid" style={{ marginTop: 8 }}>
            <Field label="Full name"><Input value={editStaffForm.name} onChange={(e) => setEditStaffForm({ ...editStaffForm, name: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={editStaffForm.email} onChange={(e) => setEditStaffForm({ ...editStaffForm, email: e.target.value })} /></Field>
            <Field label="Phone" hint="Select a country calling code and enter the local number."><PhoneNumberInput value={editStaffForm.phone} onChange={(phone) => setEditStaffForm({ ...editStaffForm, phone })} /></Field>
            <Field label="Role">
              <Select value={editStaffForm.roles} onChange={(e) => setEditStaffForm({ ...editStaffForm, roles: e.target.value })}>
                <option value="loan_officer">Loan officer</option>
                <option value="approver">Approver</option>
                <option value="manager">Manager</option>
                <option value="finance">Finance / accounting</option>
                <option value="collections">Collections</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
          </div>
          <div className="dialog-actions">
            <Button variant="outline" disabled={editStaffSaving} onClick={() => setEditStaff(null)}>Cancel</Button>
            <Button loading={editStaffSaving} onClick={() => void saveEditStaff()}>Save changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
