import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Ban, CalendarClock, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardCheck, ClipboardList, Download, Ellipsis, ExternalLink, Eye, EyeOff, FilePenLine, FileSearch, FileText, HandCoins, KeyRound, List, Plus, Printer, RefreshCw, Replace, Save, Search, Send, ShieldAlert, SlidersHorizontal, StickyNote, Undo2, UserCheck, UserCog, UserMinus, UserPlus, Wallet, X, XCircle } from 'lucide-react'
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
import { getRecordDetail, getLatestCreditAssessment, calculateCreditScore, type CreditAssessment } from '../lib/api'

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
  const [decisionCredit, setDecisionCredit] = useState<CreditAssessment | null>(null)
  const [decisionCreditLoading, setDecisionCreditLoading] = useState(false)
  const [actionDialog, setActionDialog] = useState<{ title: string; description: string; reasonLabel: string; confirmLabel: string; danger?: boolean; defaultReason?: string; extra?: ReactNode; run: (reason: string) => Promise<void> } | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [branchModal, setBranchModal] = useState(false)
  const [editApplication, setEditApplication] = useState<Record<string, unknown> | null>(null)
  const [editApplicationForm, setEditApplicationForm] = useState({ amount: '', duration: '', purpose: '', income: '', obligations: '', version: 1 })
  const [editApplicationSaving, setEditApplicationSaving] = useState(false)
  const [branchForm, setBranchForm] = useState({ branchId: '', code: '', name: '', district: '', managerId: '', status: 'active', createdAt: '', updatedAt: '' })
  const [branchSaving, setBranchSaving] = useState(false)
  const [editBranch, setEditBranch] = useState<TableRow | null>(null)
  const [staffOptions, setStaffOptions] = useState<Array<{ id: string; name: string }>>([])
  const [staffModal, setStaffModal] = useState(false)
  const [staffForm, setStaffForm] = useState({ name: '', email: '', password: '', phone: '', roles: 'loan_officer', branchIds: [] as string[] })
  const [staffSaving, setStaffSaving] = useState(false)
  const [staffShowPassword, setStaffShowPassword] = useState(false)
  const [branchOptions, setBranchOptions] = useState<Array<{ id: string; name: string }>>([])
  const [editStaff, setEditStaff] = useState<TableRow | null>(null)
  const [editStaffForm, setEditStaffForm] = useState({ name: '', email: '', phone: '', roles: 'loan_officer', branchIds: [] as string[] })
  const [editStaffSaving, setEditStaffSaving] = useState(false)
  const [followupNote, setFollowupNote] = useState('')
  const [followupStatus, setFollowupStatus] = useState<'contacted' | 'promise_to_pay' | 'escalated' | 'resolved' | 'open'>('contacted')
  const [followupAssignedTo, setFollowupAssignedTo] = useState('')
  const [followupPromiseDate, setFollowupPromiseDate] = useState('')
  const [followupPromiseAmount, setFollowupPromiseAmount] = useState('')
  const [scheduleView, setScheduleView] = useState<'list' | 'calendar'>('list')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null)
  const [remoteRows, setRemoteRows] = useState<TableRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const role = useSelector((state: RootState) => state.session.role)
  const roles = useSelector((state: RootState) => state.session.user?.roles ?? [])
  const permissions = useSelector((state: RootState) => state.session.user?.permissions ?? [])
  const isSuperAdmin = roles.some((r) => ['super_admin','super-admin','superadmin'].includes(String(r).toLowerCase().replace(/[\s-]+/g, '_')))
  const canReview = isSuperAdmin || permissions.includes('*') || ['Admin', 'Manager', 'Approver'].includes(role) || permissions.includes('loans.applications.approve')
  const canManageLoans = isSuperAdmin || permissions.includes('*') || permissions.includes('loans.accounts.manage')
  const canReverseRepayments = isSuperAdmin || permissions.includes('*') || permissions.includes('repayments.reverse')
  const canManageUsers = isSuperAdmin || permissions.includes('*') || permissions.includes('identity.users.update')
  const canManageBranches = isSuperAdmin || permissions.includes('*') || permissions.includes('branches.manage')
  const canCreateStaff = isSuperAdmin || permissions.includes('*') || permissions.includes('identity.users.create')
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
        setRemoteRows(rows.map((item) => ({ id: item.id, name: item.name, range: `${formatUGX(item.minAmount)} – ${formatUGX(item.maxAmount)}`, rate: item.rateLabel || `${item.interestRate}% ${(item as any).interestBasis === 'term' ? 'per term' : (item as any).interestBasis === 'monthly' ? 'per month' : 'p.a.'}`, duration: `${item.duration} months`, frequency: item.frequency, state: item.active ? 'Active' : 'Inactive' })))
      } else if (path === '/applications') {
        const rows = await api.listApplications()
        setRemoteRows(rows.map((item) => ({ id: item.id, customer: item.customer, customerId: item.customerId, product: item.product, amount: item.amount, duration: `${item.duration} months`, officer: item.officer, submitted: item.submitted, status: item.status, version: item.version })))
      } else if (path === '/approvals') {
        const rows = await api.listApplications()
        const visible = rows.filter((item) => ['submitted', 'under review', 'assessment required', 'approval pending'].includes(String(item.status).toLowerCase()))
        setRemoteRows(visible.map((item) => ({ id: item.id, customer: item.customer, customerId: item.customerId, product: item.product, amount: item.amount, income: item.income, officer: item.officer, submitted: item.submitted, status: item.status, version: item.version })))
      } else if (path === '/loans') {
        const rows = await api.listLoans()
        setRemoteRows(rows.map((item) => ({ id: (item as any).id ?? item.ref, ref: item.ref, customer: item.customer, customerId: item.customerId, product: item.product, principal: item.principal, outstanding: item.outstanding, nextDue: item.nextDue, status: item.status })))
      } else if (path === '/disbursements') {
        try {
          const rows = await api.listDisbursements()
          setRemoteRows(rows.map((item: any) => ({ id: item.id, loan: item.loan, applicationId: item.applicationId, customer: item.customer, amount: item.amount, branch: item.branch || 'Primary Branch', method: item.method || '—', reference: item.reference || '—', submitted: item.created, authorizedAt: item.authorizedAt || item.created, completedAt: item.completedAt || '', authorizedBy: item.authorizedBy || '—', completedBy: item.completedBy || '', state: item.state || item.status, status: item.status, notes: item.notes || '' })))
        } catch {
          const rows = await api.listLoans()
          const pending = rows.filter((item) => item.status === 'Pending Disbursement')
          setRemoteRows(pending.map((item) => ({ id: (item as any).id ?? item.ref, ref: item.ref, loan: item.ref, applicationId: item.applicationId, branchId: item.branchId, customer: item.customer, product: item.product, amount: item.principal, branch: item.branchId || 'Primary Branch', submitted: item.start, state: 'Pending Disbursement', status: 'pending_loan' })))
        }
      } else if (path === '/repayments') {
        const rows = await api.listRepayments()
        setRemoteRows(rows.map((item) => ({ id: item.id, recordId: (item as any).recordId ?? item.id, customer: item.customer, customerId: item.customerId, loan: item.loan, amount: item.amount, method: item.method, date: item.date, receivedBy: item.receivedBy, status: item.status })))
      } else if (path === '/schedules') {
        const rows = await api.listSchedules()
        setRemoteRows(rows.map((item) => ({ id: item.id, due: item.due, customer: item.customer, loan: item.loan, expected: item.expected, paid: item.paid, officer: item.officer, status: item.status })))
      } else if (path === '/collections') {
        const rows = await api.listCollections()
        setRemoteRows(rows.map((item: any) => ({ id: item.id, customer: item.customer, loan: item.loan, outstanding: item.outstanding, overdue: item.overdue, promiseAmount: item.promiseAmount ?? 0, promiseDueAt: item.promiseDueAt ?? '', lastPayment: item.lastPayment, followUp: item.followUp, officer: item.assignedTo || item.officer, assignedTo: item.assignedTo || item.officer, status: item.status, note: item.note, phone: item.phone })))
      } else if (path === '/transactions') {
        const rows = await api.listTransactions()
        setRemoteRows(rows.map((item) => ({ id: item.id, type: item.type, reference: item.reference, customer: item.customer, amount: item.amount, method: item.method, date: item.date, status: item.status, recordedBy: item.recordedBy })))
      } else if (path === '/staff') {
        const rows = await api.listStaff()
        setRemoteRows(rows.map((item) => ({ id: item.id, name: item.name, email: item.email, phone: item.phone, role: item.role, branch: item.branch, branchIds: (item as any).branchIds ?? [], lastActive: item.lastActive, status: item.status })))
      } else if (path === '/branches') {
        const rows = await api.listBranches()
        setRemoteRows(rows.map((item) => ({ id: item.id, branchId: item.branchId ?? item.id, code: item.code ?? '', name: item.name, district: item.district, managerId: item.managerId ?? '', manager: item.manager, staff: item.staff, activeLoans: item.activeLoans, status: item.status, createdAt: item.createdAt ?? '', updatedAt: item.updatedAt ?? '' })))
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
    if (!branchModal && !editBranch && !staffModal && !editStaff) return
    if (!staffOptions.length) void api.listStaff().then((rows) => setStaffOptions(rows.map((r) => ({ id: r.id, name: r.name })))).catch(() => {})
    if (!branchOptions.length) void api.listBranches().then((rows) => setBranchOptions(rows.map((r) => ({ id: String((r as any).branchId ?? r.id), name: String(r.name ?? r.id) })))).catch(() => {})
  }, [branchModal, editBranch, staffModal, editStaff, staffOptions.length, branchOptions.length])

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
      setEditStaffForm({ name: String(row.name ?? ''), email: String(row.email ?? ''), phone: String(row.phone ?? ''), roles: String(row.role ?? 'loan_officer').split(',')[0]?.trim() || 'loan_officer', branchIds: Array.isArray((row as any).branchIds) ? (row as any).branchIds.map(String) : [] })
      return
    }
    const key = definition.detailKey ? row[definition.detailKey] : undefined
    if (definition.detailBase && key) navigate(`${definition.detailBase}/${encodeURIComponent(String(key))}`)
    else if (path === '/approvals' && row.id) navigate(`/applications/${encodeURIComponent(String(row.id))}`)
    else setSelected(row)
  }

  async function requestDecision(row: TableRow, decision: 'approve' | 'reject') {
    if (!canReview) { toast.error('Loan approval is not permitted for this account.'); return }
    setDecisionCredit(null)
    const detail = await getRecordDetail('applications', String(row.id)).catch((error) => { toast.error(error instanceof Error ? error.message : 'Application details could not be loaded before decision.'); return null })
    if (!detail) return
    const status = String(detail.status ?? row.status ?? '').toLowerCase()
    if (status === 'approved' || status === 'rejected' || status === 'cancelled') { toast.error(`This application is already ${status}.`); return }
    setDecisionNotes('')
    setDecisionRequest({ row: { ...row, status, version: Number(detail.version ?? row.version ?? 1) }, decision })
    setDecisionCreditLoading(true)
    getLatestCreditAssessment({ applicationId: String(row.id) }).then((c) => setDecisionCredit(c)).catch(() => setDecisionCredit(null)).finally(() => setDecisionCreditLoading(false))
  }

  async function confirmDecision() {
    if (!decisionRequest || decisionSubmitting) return
    const { row, decision } = decisionRequest
    const version = Number(row.version ?? 1)
    const reason = decisionNotes.trim() || (decision === 'approve' ? 'Approved after review.' : 'Rejected after review.')
    setDecisionSubmitting(true)
    try {
      const result = await api.decideApplication(String(row.id), decision === 'approve' ? 'approved' : 'rejected', reason, version)
      toast.success((result as any)?.message || (decision === 'approve' ? 'Application approved successfully.' : 'Application rejected.'))
      setDecisionRequest(null); setDecisionNotes(''); setDecisionCredit(null)
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Decision could not be submitted.')
      await loadData()
    } finally { setDecisionSubmitting(false) }
  }

  function openReasonAction(config: NonNullable<typeof actionDialog>) { setActionReason(config.defaultReason ?? ''); setActionDialog(config) }
  async function runActionDialog() {
    if (!actionDialog || actionBusy) return
    const reason = actionReason.trim()
    if (reason.length < 3) { toast.error('Please provide a reason (at least 3 characters).'); return }
    setActionBusy(true)
    try { await actionDialog.run(reason); setActionDialog(null); setActionReason(''); await loadData() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Action could not be completed.') }
    finally { setActionBusy(false) }
  }

  async function saveFollowup() {
    if (!selected) return
    try {
      await api.updateCollection(String(selected.id), { status: followupStatus, notes: [followupAssignedTo.trim() ? `Assigned officer: ${followupAssignedTo.trim()}` : '', followupNote.trim()].filter(Boolean).join('\n'), ...(followupPromiseDate ? { promiseDueAt: followupPromiseDate, followUpAt: followupPromiseDate } : {}), ...(followupPromiseAmount ? { promiseAmountMinor: Math.round(Number(followupPromiseAmount) * 100) } : {}) })
      toast.success('Collection case updated')
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
        await api.updateBranch(String(editBranch.id), { name: branchForm.name.trim(), district: branchForm.district.trim(), managerId: branchForm.managerId || null, status: branchForm.status as 'active' | 'suspended' })
        toast.success('Branch updated')
        setEditBranch(null)
      } else {
        await api.createBranch({ code: branchForm.code.trim(), name: branchForm.name.trim(), district: branchForm.district.trim(), managerId: branchForm.managerId || undefined })
        toast.success('Branch created')
        setBranchModal(false)
      }
      setBranchForm({ branchId: '', code: '', name: '', district: '', managerId: '', status: 'active', createdAt: '', updatedAt: '' }); await loadData()
    } catch (e) { toast.error(e instanceof Error ? e.message : (editBranch ? 'Branch could not be updated.' : 'Branch could not be created.')) } finally { setBranchSaving(false) }
  }

  async function saveStaff() {
    if (!staffForm.name.trim() || !staffForm.email.trim() || staffForm.password.length < 8) { toast.error('Enter name, valid email, and a password with at least 8 characters.'); return }
    setStaffSaving(true)
    try {
      await api.createStaffUser({ name: staffForm.name.trim(), email: staffForm.email.trim(), password: staffForm.password, phone: staffForm.phone.trim() || undefined, roles: [staffForm.roles], branchIds: staffForm.branchIds.length ? staffForm.branchIds : undefined })
      toast.success('Staff user created')
      setStaffModal(false); setStaffForm({ name: '', email: '', password: '', phone: '', roles: 'loan_officer', branchIds: [] }); await loadData()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Staff user could not be created. Check identity.users.create permission and branch access.') } finally { setStaffSaving(false) }
  }

  async function saveEditStaff() {
    if (!editStaff) return
    setEditStaffSaving(true)
    try {
      await api.updateStaffUser(String(editStaff.id), { name: editStaffForm.name.trim() || undefined, email: editStaffForm.email.trim() || undefined, phone: editStaffForm.phone.trim() || undefined, roles: [editStaffForm.roles], branchIds: editStaffForm.branchIds })
      toast.success('Staff user updated')
      setEditStaff(null); await loadData()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Staff user could not be updated. Check identity.users.update permission and branch access.') } finally { setEditStaffSaving(false) }
  }

  const headingAction = definition.newTo
    ? <Button onClick={() => navigate(definition.newTo!)}>{definition.newLabel ?? 'Add new'} <span>+</span></Button>
    : definition.newLabel
      ? <Button onClick={() => {
          if (path === '/branches') {
            if (!canManageBranches) { toast.error('You need `branches.manage` permission to add or edit branches.'); return }
            setEditBranch(null); setBranchForm({ branchId: '', code: '', name: '', district: '', managerId: '', status: 'active', createdAt: '', updatedAt: '' }); setBranchModal(true)
          } else if (path === '/staff') {
            if (!canCreateStaff) { toast.error('You need `identity.users.create` permission to add staff.'); return }
            setStaffModal(true)
          } else navigate('/settings')
        }}>+ {definition.newLabel}</Button>
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
                                <DropdownMenu.Item className="dropdown-item" onSelect={async () => { try { const active = String(row.status ?? '').toLowerCase() === 'active'; const fresh: any = await getRecordDetail('customers', String(row.recordId ?? row.id)).catch(() => null); await api.updateCustomerStatus(String(row.recordId ?? row.id), active ? 'inactive' : 'active', Number(fresh?.version ?? row.version ?? 1)); toast.success(active ? 'Customer deactivated' : 'Customer activated'); void loadData() } catch (e) { toast.error(e instanceof Error ? e.message : 'Customer status could not be updated.') } }}>{String(row.status ?? '').toLowerCase() === 'active' ? <><UserMinus size={15} /> Deactivate</> : <><UserPlus size={15} /> Activate</>}</DropdownMenu.Item>
                              )}
                              {path === '/products' && (
                                <>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => navigate(`/products/${encodeURIComponent(String(row.id))}`)}><ExternalLink size={15} /> Open product</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={async () => { try { const next = String(row.state ?? '') === 'Active' ? 'inactive' : 'active'; await api.updateProductStatus(String(row.id), next); toast.success(`Loan product ${next === 'active' ? 'activated' : 'deactivated'}`); void loadData() } catch (e) { toast.error(e instanceof Error ? e.message : 'Product status could not be updated.') } }}>{String(row.state ?? '') === 'Active' ? <><UserMinus size={15} /> Deactivate</> : <><UserPlus size={15} /> Activate</>}</DropdownMenu.Item>
                                </>
                              )}
                              {path === '/staff' && (
                                <>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => { setEditStaff(row); setEditStaffForm({ name: String(row.name ?? ''), email: String(row.email ?? ''), phone: String(row.phone ?? ''), roles: String(row.role ?? 'loan_officer').split(',')[0]?.trim() || 'loan_officer', branchIds: Array.isArray((row as any).branchIds) ? (row as any).branchIds.map(String) : [] }) }}><UserCog size={15} /> Edit staff</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={async () => { try { const active = String(row.status ?? '').toLowerCase() === 'active'; await api.updateStaffUser(String(row.id), { status: active ? 'suspended' : 'active' }); toast.success(active ? 'Staff deactivated' : 'Staff activated'); void loadData() } catch (e) { toast.error(e instanceof Error ? e.message : 'Staff status could not be updated.') } }}>{String(row.status ?? '').toLowerCase() === 'active' ? <><UserMinus size={15} /> Deactivate</> : <><UserPlus size={15} /> Activate</>}</DropdownMenu.Item>
                                  {canManageUsers && <DropdownMenu.Item className="dropdown-item" onSelect={async () => { try { const out = await api.resetStaffPassword(String(row.id)); toast.success(out?.resetToken ? `Password reset created. Token: ${String(out.resetToken).slice(0, 10)}…` : 'Password reset initiated') } catch (e) { toast.error(e instanceof Error ? e.message : 'Password reset could not be initiated.') } }}><KeyRound size={15} /> Reset password</DropdownMenu.Item>}
                                </>
                              )}
                              {path === '/branches' && (
                                <>
                                <DropdownMenu.Item className="dropdown-item" onSelect={() => {
                                    if (!canManageBranches) { toast.error('You need `branches.manage` permission to edit branches.'); return }
                                    setEditBranch(row); setBranchForm({ branchId: String((row as any).branchId ?? row.id ?? ''), code: String((row as any).code ?? ''), name: String(row.name ?? ''), district: String(row.district ?? ''), managerId: String((row as any).managerId ?? ''), status: String((row as any).status ?? 'Active').toLowerCase() === 'active' ? 'active' : 'suspended', createdAt: String((row as any).createdAt ?? ''), updatedAt: String((row as any).updatedAt ?? '') }); setBranchModal(true)
                                  }}><FilePenLine size={15} /> Edit branch</DropdownMenu.Item>
                                <DropdownMenu.Item className="dropdown-item" onSelect={() => navigate(`/branches/${encodeURIComponent(String((row as any).branchId ?? row.id))}`)}><Eye size={15} /> View branch</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={async () => { try { const active = String(row.status ?? '').toLowerCase() === 'active'; await api.updateBranch(String(row.id), { status: active ? 'suspended' : 'active' }); toast.success(active ? 'Branch deactivated' : 'Branch activated'); void loadData() } catch (e) { toast.error(e instanceof Error ? e.message : 'Branch status could not be updated.') } }}>{String(row.status ?? '').toLowerCase() === 'active' ? <><UserMinus size={15} /> Deactivate</> : <><UserPlus size={15} /> Activate</>}</DropdownMenu.Item>
                                </>
                              )}
                              {path === '/applications' && (
                                <>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => navigate(`/applications/${encodeURIComponent(String(row.id))}`)}><ExternalLink size={15} /> Open application</DropdownMenu.Item>
                                  {!['approved','rejected','cancelled','withdrawn'].includes(String(row.status ?? '').toLowerCase()) && (
                                    <>
                                      <DropdownMenu.Item className="dropdown-item" onSelect={async () => {
                                        try {
                                          const fresh: any = await getRecordDetail('applications', String(row.id)).catch(() => row)
                                          const status = String(fresh?.status ?? row.status ?? '').toLowerCase()
                                          if (['approved','rejected','cancelled','withdrawn'].includes(status)) { toast.error('Approved, rejected, cancelled, or withdrawn applications cannot be edited.'); return }
                                          const amountMinor = Number(fresh?.amountMinor ?? 0)
                                          const amountMajor = amountMinor > 0 ? (amountMinor >= 1000 ? amountMinor / 100 : amountMinor) : Number(row.amount ?? 0)
                                          setEditApplicationForm({ amount: amountMajor ? String(Math.round(amountMajor)) : '', duration: String(fresh?.tenureMonths ?? fresh?.duration ?? row.tenure ?? '').replace(/[^\d]/g, ''), purpose: String(fresh?.purpose ?? row.purpose ?? ''), income: '', obligations: '', version: Number(fresh?.version ?? row.version ?? 1) })
                                          setEditApplication(fresh && typeof fresh === 'object' ? { ...fresh, id: String(fresh._id ?? fresh.id ?? row.id) } : row)
                                        } catch (e) { toast.error(e instanceof Error ? e.message : 'Application details could not be loaded for editing.') }
                                      }}><FilePenLine size={15} /> Edit application</DropdownMenu.Item>
                                      <DropdownMenu.Item className="dropdown-item" onSelect={() => openReasonAction({ title: 'Move to under review', description: `${String(row.customer ?? 'Applicant')} · ${String(row.id)}`, reasonLabel: 'Workflow reason', confirmLabel: 'Move status', run: async (reason) => { const fresh: any = await getRecordDetail('applications', String(row.id)).catch(() => null); await api.transitionApplication(String(row.id), 'under_review', reason, Number(fresh?.version ?? row.version ?? 1)); toast.success('Application moved to under review') } })}><FileSearch size={15} /> Move to under review</DropdownMenu.Item>
                                      <DropdownMenu.Item className="dropdown-item" onSelect={() => openReasonAction({ title: 'Request more information', description: `${String(row.customer ?? 'Applicant')} · ${String(row.id)}`, reasonLabel: 'What information is needed?', confirmLabel: 'Request info', run: async (reason) => { const fresh: any = await getRecordDetail('applications', String(row.id)).catch(() => null); await api.transitionApplication(String(row.id), 'info_requested', reason, Number(fresh?.version ?? row.version ?? 1)); toast.success('Application marked info requested') } })}><Send size={15} /> Request information</DropdownMenu.Item>
                                      <DropdownMenu.Item className="dropdown-item" onSelect={() => openReasonAction({ title: 'Withdraw application', description: `${String(row.customer ?? 'Applicant')} · ${String(row.id)}. Withdrawal is applicant/staff initiated and audited.`, reasonLabel: 'Withdrawal reason', confirmLabel: 'Withdraw application', danger: true, run: async (reason) => { const fresh: any = await getRecordDetail('applications', String(row.id)).catch(() => null); await api.withdrawApplication(String(row.id), reason, Number(fresh?.version ?? row.version ?? 1)); toast.success('Application withdrawn') } })}><Undo2 size={15} /> Withdraw</DropdownMenu.Item>
                                      <DropdownMenu.Item className="dropdown-item dropdown-danger" onSelect={() => openReasonAction({ title: 'Cancel application', description: `${String(row.customer ?? 'Applicant')} · ${String(row.id)}. Cancellation is an administrative stop and cannot be undone.`, reasonLabel: 'Cancellation reason', confirmLabel: 'Cancel application', danger: true, run: async (reason) => { const fresh: any = await getRecordDetail('applications', String(row.id)).catch(() => null); await api.cancelApplication(String(row.id), reason, Number(fresh?.version ?? row.version ?? 1)); toast.success('Application cancelled') } })}><Ban size={15} /> Cancel</DropdownMenu.Item>
                                    </>
                                  )}
                                </>
                              )}
                              {path === '/repayments' && (
                                <>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={async () => { try { const { exportPaymentReceipt } = await import('../lib/api'); await exportPaymentReceipt(String(row.recordId ?? row.id)); } catch (e) { toast.error(e instanceof Error ? e.message : 'Receipt could not be opened.') } }}><Printer size={15} /> Print / receipt</DropdownMenu.Item>
                                  {String(row.status ?? '') === 'Pending review' && (
                                    <DropdownMenu.Item className="dropdown-item" onSelect={async () => { try { await api.confirmRepayment(String(row.recordId ?? row.id)); toast.success('Repayment confirmed'); void loadData() } catch (e) { toast.error(e instanceof Error ? e.message : 'Repayment could not be confirmed. Check permission repayments.confirm.') } }}><ClipboardCheck size={15} /> Confirm payment</DropdownMenu.Item>
                                  )}
                                  {String(row.status ?? '') === 'Successful' && canReverseRepayments && (
                                    <DropdownMenu.Item className="dropdown-item dropdown-danger" onSelect={() => openReasonAction({ title: 'Reverse repayment', description: `${String(row.customer ?? 'Customer')} · ${formatUGX(Number(row.amount ?? 0))}. Reversal creates accounting reversal entries and is irreversible.`, reasonLabel: 'Reversal reason', confirmLabel: 'Reverse repayment', danger: true, run: async (reason) => { await api.reverseRepayment(String(row.recordId ?? row.id), reason); toast.success('Repayment reversed') } })}><Undo2 size={15} /> Reverse payment</DropdownMenu.Item>
                                  )}
                                  {String(row.status ?? '') === 'Successful' && !canReverseRepayments && (
                                    <DropdownMenu.Item className="dropdown-item" disabled><Undo2 size={15} /> Reverse payment (requires repayments.reverse)</DropdownMenu.Item>
                                  )}
                                </>
                              )}
                              {path === '/approvals' && canReview && (
                                <>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={async () => { setDecisionCreditLoading(true); try { const c = await calculateCreditScore({ applicationId: String(row.id) }); setDecisionCredit(c); toast.success(`Credit score ${c.score ?? '—'} (${c.grade ?? c.riskLevel ?? 'calculated'})`) } catch (e) { toast.error(e instanceof Error ? e.message : 'Credit score could not be calculated.') } finally { setDecisionCreditLoading(false) } }}><ShieldAlert size={15} /> Calculate credit score</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => void requestDecision(row, 'approve')}><Check size={15} /> Approve</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item dropdown-danger" onSelect={() => void requestDecision(row, 'reject')}><XCircle size={15} /> Reject</DropdownMenu.Item>
                                </>
                              )}
                              {path === '/loans' && canManageLoans && (
                                <>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => openReasonAction({ title: 'Restructure loan', description: `${String(row.ref ?? row.id)} · ${String(row.customer ?? '')}`, reasonLabel: 'Restructure reason', confirmLabel: 'Restructure', run: async (reason) => { await api.loanLifecycle(String(row.id ?? row.ref), 'restructure', reason); toast.success('Loan restructured') } })}><RefreshCw size={15} /> Restructure</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => openReasonAction({ title: 'Refinance loan', description: `${String(row.ref ?? row.id)} · ${String(row.customer ?? '')}`, reasonLabel: 'Refinance reason', confirmLabel: 'Refinance', run: async (reason) => { await api.loanLifecycle(String(row.id ?? row.ref), 'refinance', reason); toast.success('Loan refinanced') } })}><Replace size={15} /> Refinance</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => openReasonAction({ title: 'Apply penalty', description: `${String(row.ref ?? row.id)} · ${String(row.customer ?? '')}`, reasonLabel: 'Penalty reason', confirmLabel: 'Apply penalty', run: async (reason) => { await api.loanLifecycle(String(row.id ?? row.ref), 'penalty', reason); toast.success('Penalty applied') } })}><CircleDollarSign size={15} /> Apply penalty</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => openReasonAction({ title: 'Settle loan', description: `${String(row.ref ?? row.id)} · ${String(row.customer ?? '')}`, reasonLabel: 'Settlement reason', confirmLabel: 'Settle loan', run: async (reason) => { await api.loanLifecycle(String(row.id ?? row.ref), 'settle', reason); toast.success('Loan settled') } })}><HandCoins size={15} /> Settle loan</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => openReasonAction({ title: 'Request reschedule', description: `${String(row.ref ?? row.id)} · ${String(row.customer ?? '')}`, reasonLabel: 'Reschedule reason/request', confirmLabel: 'Record request', run: async (reason) => { await api.requestLoanPlan(String(row.id ?? row.ref), 'reschedule_request', reason); toast.success('Reschedule request recorded') } })}><CalendarPlus size={15} /> Request reschedule</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => openReasonAction({ title: 'Apply reschedule', description: `${String(row.ref ?? row.id)} · ${String(row.customer ?? '')}. This mutates pending schedule due dates and is audited.`, reasonLabel: 'Reason (include count, e.g. "7 days" or "1 month")', confirmLabel: 'Apply reschedule', danger: true, defaultReason: 'Shift pending installments by 7 days due to approved arrangement.', run: async (reason) => { const day = reason.match(/(\d+)\s*day/i); const month = reason.match(/(\d+)\s*month/i); const unit = day ? 'day' : 'month'; const count = Number((day||month||[])[1] || 1); await api.applyLoanPlan(String(row.id ?? row.ref), 'reschedule', reason, count, unit as any); toast.success(`Schedule rescheduled by ${count} ${unit}${count===1?'':'s'}`) } })}><CalendarClock size={15} /> Apply reschedule (days/months)</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => openReasonAction({ title: 'Apply payment plan', description: `${String(row.ref ?? row.id)} · ${String(row.customer ?? '')}. This replaces pending installments and is audited.`, reasonLabel: 'Reason (include installment count and unit, e.g. "30 daily installments" or "3 months")', confirmLabel: 'Apply payment plan', danger: true, defaultReason: 'Apply 30 daily installments for pending balance.', run: async (reason) => { const day = reason.match(/(\d+)\s*daily|(\d+)\s*day/i); const month = reason.match(/(\d+)\s*month/i); const unit = month ? 'month' : 'day'; const count = Number((month||day||[]).slice(1).find(Boolean) || (month ? 3 : 30)); await api.applyLoanPlan(String(row.id ?? row.ref), 'payment_plan', reason, count, unit as any); toast.success(`Payment plan applied: ${count} ${unit}${count===1?'':'s'}`) } })}><CalendarDays size={15} /> Apply payment plan (daily/monthly)</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onClick={undefined as any} onSelect={() => openReasonAction({ title: 'Request payment plan', description: `${String(row.ref ?? row.id)} · ${String(row.customer ?? '')}`, reasonLabel: 'Payment plan request', confirmLabel: 'Record request', run: async (reason) => { await api.requestLoanPlan(String(row.id ?? row.ref), 'payment_plan_request', reason); toast.success('Payment plan request recorded') } })}><CalendarPlus size={15} /> Request payment plan</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item dropdown-danger" onSelect={() => openReasonAction({ title: 'Write off loan', description: `${String(row.ref ?? row.id)} · ${String(row.customer ?? '')}`, reasonLabel: 'Write-off reason', confirmLabel: 'Write off loan', danger: true, run: async (reason) => { await api.loanLifecycle(String(row.id ?? row.ref), 'write_off', reason); toast.success('Loan written off') } })}><Ban size={15} /> Write off</DropdownMenu.Item>
                                </>
                              )}
                              {path === '/disbursements' && (
                                <>
                                  {String(row.status ?? '') === 'pending_loan' && <DropdownMenu.Item className="dropdown-item" onSelect={() => navigate(`/disbursements/new?mode=authorize&loan=${encodeURIComponent(String(row.ref ?? row.loan ?? row.id ?? ''))}`)}><ShieldAlert size={15} /> Authorize disbursement</DropdownMenu.Item>}
                                  {String(row.status ?? '') === 'authorized' && <DropdownMenu.Item className="dropdown-item" onSelect={async () => { if (!window.confirm(`Execute disbursement ${String(row.id)} for ${formatUGX(Number(row.amount ?? 0))}? This posts accounting/loan state and is audited.`)) return; try { await api.executeDisbursementRecord(String(row.id)); toast.success('Disbursement executed/completed'); void loadData() } catch (e) { toast.error(e instanceof Error ? e.message : 'Disbursement could not be completed. Check permission loans.disburse.execute and state.') } }}><Wallet size={15} /> Execute authorized disbursement</DropdownMenu.Item>}
                                  {String(row.status ?? '') === 'authorized' && <DropdownMenu.Item className="dropdown-item dropdown-danger" onSelect={() => openReasonAction({ title: 'Cancel authorized disbursement', description: `${String(row.customer ?? 'Borrower')} · ${formatUGX(Number(row.amount ?? 0))}. Cancellation is irreversible and audited.`, reasonLabel: 'Cancellation reason', confirmLabel: 'Cancel disbursement', danger: true, run: async (reason) => { await api.cancelDisbursementRecord(String(row.id), reason); toast.success('Disbursement cancelled') } })}><Ban size={15} /> Cancel disbursement</DropdownMenu.Item>}
                                </>
                              )}
                              {path === '/schedules' && (
                                <>
                                  <DropdownMenu.Item className="dropdown-item" onClick={undefined as any} onSelect={() => { const loan = String(row.loan ?? ''); if (!loan) { toast.info('Loan reference is unavailable for this schedule.'); return } navigate(`/loans/${encodeURIComponent(loan)}`) }}><ExternalLink size={15} /> Open loan</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => { setFollowupNote(`Schedule follow-up for ${String(row.customer ?? 'customer')} due ${String(row.due ?? '')}`); setFollowupStatus('contacted'); setFollowupAssignedTo(String(row.officer ?? '')); setFollowupPromiseDate(''); setFollowupPromiseAmount(''); setSelected(row) }}><StickyNote size={15} /> Record follow-up note</DropdownMenu.Item>
                                </>
                              )}
                              {path === '/collections' && (
                                <>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => { setFollowupNote(String(row.note ?? '')); setFollowupStatus((String(row.status ?? '').toLowerCase().includes('resolved') ? 'resolved' : String(row.status ?? '').toLowerCase().includes('escalat') ? 'escalated' : String(row.status ?? '').toLowerCase().includes('arrangement') || String(row.status ?? '').toLowerCase().includes('promise') ? 'promise_to_pay' : 'contacted') as any); setFollowupAssignedTo(String(row.assignedTo ?? row.officer ?? '')); setFollowupPromiseDate(String(row.promiseDueAt ?? '')); setFollowupPromiseAmount(row.promiseAmount ? String(row.promiseAmount) : ''); setSelected(row) }}><FileText size={15} /> Log follow-up</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => openReasonAction({ title: 'Record promise to pay', description: `${String(row.customer ?? 'Customer')} · ${String(row.loan ?? '')}. Include amount/date in notes if needed.`, reasonLabel: 'Promise details (amount, due date, notes)', confirmLabel: 'Save promise', defaultReason: String(row.note ?? 'Promise to pay recorded'), run: async (reason) => { await api.updateCollection(String(row.id), { status: 'promise_to_pay', notes: reason, followUpAt: new Date(Date.now()+7*86400000).toISOString() }); toast.success('Promise to pay recorded') } })}><ClipboardList size={15} /> Promise to pay</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => openReasonAction({ title: 'Assign collection officer', description: `${String(row.customer ?? 'Customer')} · ${String(row.loan ?? '')}. Enter user ID (structured) or name.`, reasonLabel: 'Assigned officer user ID or name', confirmLabel: 'Save assignment', defaultReason: String(row.assignedTo ?? row.officer ?? ''), run: async (reason) => { const looksId = /^[a-f0-9]{24}$/i.test(reason.trim()) || reason.trim().startsWith('usr'); await api.updateCollection(String(row.id), { ...(looksId ? { assignedTo: reason.trim() } : { assignedToName: reason.trim(), notes: `Assigned officer: ${reason.trim()}` + (row.note ? `
${row.note}` : '') }), status: String(row.status ?? '').includes('Resolved') ? 'resolved' : 'contacted' }); toast.success('Collection assignment saved') } })}><UserCheck size={15} /> Assign officer</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => openReasonAction({ title: 'Escalate collection', description: `${String(row.customer ?? 'Customer')} · ${String(row.loan ?? '')}`, reasonLabel: 'Escalation notes', confirmLabel: 'Escalate case', defaultReason: String(row.note ?? 'Escalated for follow-up'), run: async (reason) => { await api.updateCollection(String(row.id), { status: 'escalated', notes: reason }); toast.success('Collection escalated') } })}><ShieldAlert size={15} /> Escalate</DropdownMenu.Item>
                                  <DropdownMenu.Item className="dropdown-item" onSelect={() => openReasonAction({ title: 'Resolve collection', description: `${String(row.customer ?? 'Customer')} · ${String(row.loan ?? '')}`, reasonLabel: 'Resolution notes', confirmLabel: 'Resolve case', defaultReason: String(row.note ?? 'Collection resolved'), run: async (reason) => { await api.updateCollection(String(row.id), { status: 'resolved', notes: reason }); toast.success('Collection resolved') } })}><ClipboardCheck size={15} /> Resolve case</DropdownMenu.Item>
                                </>
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
              <span>Status / action</span>
              <Select value={followupStatus} onChange={(e) => setFollowupStatus(e.target.value as any)}>
                <option value="contacted">Contacted</option><option value="promise_to_pay">Promise to pay</option><option value="escalated">Escalated</option><option value="resolved">Resolved</option><option value="open">Open / awaiting response</option>
              </Select>
              <span>Assigned officer</span>
              <Input value={followupAssignedTo} placeholder="Officer name or user ID" onChange={(event) => setFollowupAssignedTo(event.target.value)} maxLength={120} />
              <span>Promise amount (UGX)</span>
              <Input type="number" min="0" step="1" inputMode="numeric" value={followupPromiseAmount} onChange={(event) => setFollowupPromiseAmount(event.target.value)} placeholder="Optional promise amount" />
              <span>Promise / follow-up date</span>
              <Input type="date" value={followupPromiseDate} onChange={(event) => setFollowupPromiseDate(event.target.value)} />
              <span>Interaction / promise details</span>
              <Textarea rows={4} value={followupNote} placeholder="Record interaction details, promise amount/date, and next steps…" onChange={(event) => setFollowupNote(event.target.value)} maxLength={1000} />
            </div>
          )}
          <div className="dialog-actions">
            <Button variant="outline" icon={X} onClick={() => setSelected(null)}>Close</Button>
            {path === '/collections' && <Button icon={Save} onClick={saveFollowup}>Save follow-up</Button>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!decisionRequest} onOpenChange={(open) => { if (!open) { setDecisionRequest(null); setDecisionCredit(null) } }}>
        <DialogContent title={`${decisionRequest?.decision === 'approve' ? 'Approve' : 'Reject'} application`} description="Submit an underwriting decision to the server." className="record-dialog">
          <div className="followup-note">
            <span>Application</span>
            <p>{String(decisionRequest?.row.id ?? '—')} · {String(decisionRequest?.row.customer ?? 'Applicant')} · status: {String(decisionRequest?.row.status ?? '—')} · v{String(decisionRequest?.row.version ?? 1)}</p>
            <span>Credit score</span>
            <p>{decisionCreditLoading ? 'Loading credit score…' : decisionCredit ? `Score ${decisionCredit.score ?? '—'} · ${String(decisionCredit.grade ?? '—')} · ${String(decisionCredit.riskLevel ?? '—').replaceAll('_', ' ')} · ${String(decisionCredit.recommendation ?? '—').replaceAll('_', ' ')}` : 'No saved credit score. Use “Calculate credit score” from the approvals row menu, then reopen this decision if needed.'}</p>
            <span>Decision notes</span>
            <Textarea rows={4} value={decisionNotes} placeholder="Reason or underwriting conditions..." onChange={(event) => setDecisionNotes(event.target.value)} maxLength={500} />
          </div>
          <div className="dialog-actions">
            <Button variant="outline" icon={X} disabled={decisionSubmitting} onClick={() => { setDecisionRequest(null); setDecisionCredit(null) }}>Cancel</Button>
            <Button variant={decisionRequest?.decision === 'reject' ? 'danger' : 'primary'} icon={Check} loading={decisionSubmitting} onClick={() => void confirmDecision()}>
              Confirm {decisionRequest?.decision}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!actionDialog} onOpenChange={(open) => !open && setActionDialog(null)}>
        <DialogContent title={actionDialog?.title ?? 'Action'} description={actionDialog?.description ?? ''} className="record-dialog">
          <div className="followup-note">
            {actionDialog?.extra}
            <span>{actionDialog?.reasonLabel ?? 'Reason'}</span>
            <Textarea rows={4} value={actionReason} placeholder="Provide a clear reason for audit and operations..." onChange={(event) => setActionReason(event.target.value)} maxLength={500} />
          </div>
          <div className="dialog-actions">
            <Button variant="outline" icon={X} disabled={actionBusy} onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button variant={actionDialog?.danger ? 'danger' : 'primary'} icon={Check} loading={actionBusy} onClick={() => void runActionDialog()}>{actionDialog?.confirmLabel ?? 'Confirm'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={branchModal} onOpenChange={(open) => { setBranchModal(open); if (!open) { setEditBranch(null); setBranchForm({ branchId: '', code: '', name: '', district: '', managerId: '', status: 'active', createdAt: '', updatedAt: '' }) } }}>
        <DialogContent title={editBranch ? 'Edit branch' : 'Add branch'} description={editBranch ? 'View and update all branch fields. Branch ID and timestamps are system-managed.' : 'Create a branch and optionally assign a branch manager from staff.'} className="record-dialog">
          <div className="form-grid" style={{ marginTop: 8 }}>
            {editBranch && <Field label="Branch ID (system record)" hint="MongoDB/Object ID for this branch"><Input value={branchForm.branchId} readOnly className="mono-text" /></Field>}
            <Field label="Branch code" required={!editBranch} hint={editBranch ? 'Code is read-only after creation.' : 'Unique branch code, e.g. KLA-01'}><Input value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })} placeholder="e.g. KLA-01" disabled={!!editBranch} /></Field>
            <Field label="Branch name" required><Input value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} placeholder="e.g. Kampala Main" /></Field>
            <Field label="District" required><Input value={branchForm.district} onChange={(e) => setBranchForm({ ...branchForm, district: e.target.value })} placeholder="e.g. Kampala" /></Field>
            <Field label="Status">
              <select className="lf-input" value={branchForm.status} onChange={(e) => setBranchForm({ ...branchForm, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </Field>
            <Field label="Branch manager">
              <select className="lf-input" value={branchForm.managerId} onChange={(e) => setBranchForm({ ...branchForm, managerId: e.target.value })}>
                <option value="">No manager assigned</option>
                {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            {editBranch && <Field label="Created"><Input value={branchForm.createdAt ? new Date(branchForm.createdAt).toLocaleString() : '—'} readOnly /></Field>}
            {editBranch && <Field label="Last updated"><Input value={branchForm.updatedAt ? new Date(branchForm.updatedAt).toLocaleString() : '—'} readOnly /></Field>}
          </div>
          <div className="dialog-actions">
            <Button variant="outline" icon={X} disabled={branchSaving} onClick={() => { setBranchModal(false); setEditBranch(null) }}>Cancel</Button>
            <Button icon={editBranch ? Save : Plus} loading={branchSaving} onClick={() => void saveBranch()}>{editBranch ? 'Save changes' : 'Create branch'}</Button>
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
                <Input type={staffShowPassword ? 'text' : 'password'} value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} placeholder="Min 8 characters (upper, lower, number)" style={{ paddingRight: 34 }} />
                <button type="button" onClick={() => setStaffShowPassword((v) => !v)} aria-label={staffShowPassword ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', color: '#7f8da0', display: 'grid', placeItems: 'center', padding: 2, cursor: 'pointer' }}>
                  {staffShowPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>
            <Field label="Phone" hint="Select a country calling code (default +256) and enter the local number."><PhoneNumberInput value={staffForm.phone} onChange={(phone) => setStaffForm({ ...staffForm, phone })} /></Field>
            <Field label="Role">
              <select className="lf-input" value={staffForm.roles} onChange={(e) => setStaffForm({ ...staffForm, roles: e.target.value })}>
                <option value="loan_officer">Loan officer</option>
                <option value="approver">Approver</option>
                <option value="manager">Manager</option>
                <option value="finance">Finance / accounting</option>
                <option value="collections">Collections</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <Field label="Branch assignment" hint="Select a branch for scoped users. Leave unassigned only if the role/workflow allows tenant-wide access.">
              <select className="lf-input" value={staffForm.branchIds[0] ?? ''} onChange={(e) => setStaffForm({ ...staffForm, branchIds: e.target.value ? [e.target.value] : [] })}>
                <option value="">No branch assigned</option>
                {branchOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="dialog-actions">
            <Button variant="outline" icon={X} disabled={staffSaving} onClick={() => setStaffModal(false)}>Cancel</Button>
            <Button icon={Plus} loading={staffSaving} onClick={() => void saveStaff()}>Create staff</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editStaff} onOpenChange={(open) => !open && setEditStaff(null)}>
        <DialogContent title="Edit staff" description="Update staff details, role, and branch assignment. Branch assignment controls which branch-scoped records the user can access." className="record-dialog">
          <div className="form-grid" style={{ marginTop: 8 }}>
            <Field label="Full name"><Input value={editStaffForm.name} onChange={(e) => setEditStaffForm({ ...editStaffForm, name: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={editStaffForm.email} onChange={(e) => setEditStaffForm({ ...editStaffForm, email: e.target.value })} /></Field>
            <Field label="Phone" hint="Select a country calling code and enter the local number."><PhoneNumberInput value={editStaffForm.phone} onChange={(phone) => setEditStaffForm({ ...editStaffForm, phone })} /></Field>
            <Field label="Role">
              <select className="lf-input" value={editStaffForm.roles} onChange={(e) => setEditStaffForm({ ...editStaffForm, roles: e.target.value })}>
                <option value="loan_officer">Loan officer</option>
                <option value="approver">Approver</option>
                <option value="manager">Manager</option>
                <option value="finance">Finance / accounting</option>
                <option value="collections">Collections</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <Field label="Branch assignment" hint="Assign a branch so scoped users can access branch data without BRANCH_FORBIDDEN errors.">
              <select className="lf-input" value={editStaffForm.branchIds[0] ?? ''} onChange={(e) => setEditStaffForm({ ...editStaffForm, branchIds: e.target.value ? [e.target.value] : [] })}>
                <option value="">No branch assigned</option>
                {branchOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="dialog-actions">
            <Button variant="outline" icon={X} disabled={editStaffSaving} onClick={() => setEditStaff(null)}>Cancel</Button>
            <Button icon={Save} loading={editStaffSaving} onClick={() => void saveEditStaff()}>Save changes</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editApplication} onOpenChange={(open) => !open && setEditApplication(null)}>
        <DialogContent title="Edit application" description="Update editable application details before final underwriting outcome. Approved, rejected, cancelled, or withdrawn applications cannot be edited." className="record-dialog">
          <div className="form-grid" style={{ marginTop: 8 }}>
            <Field label="Requested amount (UGX)"><Input type="number" min="1" step="1" inputMode="numeric" value={editApplicationForm.amount} onChange={(e) => setEditApplicationForm({ ...editApplicationForm, amount: e.target.value })} /></Field>
            <Field label="Duration (months)"><Input type="number" min="1" step="1" inputMode="numeric" value={editApplicationForm.duration} onChange={(e) => setEditApplicationForm({ ...editApplicationForm, duration: e.target.value })} /></Field>
            <Field label="Monthly income (UGX)"><Input type="number" min="0" step="1" inputMode="numeric" value={editApplicationForm.income} onChange={(e) => setEditApplicationForm({ ...editApplicationForm, income: e.target.value })} /></Field>
            <Field label="Existing obligations (UGX)"><Input type="number" min="0" step="1" inputMode="numeric" value={editApplicationForm.obligations} onChange={(e) => setEditApplicationForm({ ...editApplicationForm, obligations: e.target.value })} /></Field>
            <Field label="Purpose" className="field-span-2"><Textarea rows={3} value={editApplicationForm.purpose} onChange={(e) => setEditApplicationForm({ ...editApplicationForm, purpose: e.target.value })} /></Field>
          </div>
          <div className="dialog-actions">
            <Button variant="outline" icon={X} disabled={editApplicationSaving} onClick={() => setEditApplication(null)}>Cancel</Button>
            <Button icon={Save} loading={editApplicationSaving} onClick={async () => {
              if (!editApplication || editApplicationSaving) return
              setEditApplicationSaving(true)
              try {
                await api.updateApplication(String(editApplication.id ?? ''), {
                  amount: editApplicationForm.amount ? Number(editApplicationForm.amount) : undefined,
                  duration: editApplicationForm.duration ? Number(editApplicationForm.duration) : undefined,
                  income: editApplicationForm.income ? Number(editApplicationForm.income) : undefined,
                  obligations: editApplicationForm.obligations ? Number(editApplicationForm.obligations) : undefined,
                  purpose: editApplicationForm.purpose.trim() || undefined,
                  version: Number(editApplicationForm.version || 1),
                })
                toast.success('Application updated')
                setEditApplication(null)
                await loadData()
              } catch (e) { toast.error(e instanceof Error ? e.message : 'Application could not be updated.') }
              finally { setEditApplicationSaving(false) }
            }}>Save changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
