import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Input, Skeleton, StatusBadge } from '../../components/ui/primitives'
import { listAuditEvents, shareBlob, type AuditEvent, type PagedResult } from '../../lib/api'
import { exportReportExcel, type OrgInfo } from '../../lib/exportDocs'
import type { RootState } from '../../store/store'

const emptyResult = (): PagedResult<AuditEvent> => ({ data: [], meta: { page: 1, pageSize: 25, total: 0, pageCount: 1 } })

function AuditTableSkeleton() {
  return <div className="table-scroll" aria-label="Loading audit events" aria-busy="true">
    <table className="lf-table audit-table">
      <thead><tr>{['User', 'Action', 'Details', 'Entity', 'Date'].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
      <tbody>{Array.from({ length: 7 }, (_, index) => <tr key={index}>
        <td><Skeleton className="skeleton-line skeleton-user" /></td>
        <td><Skeleton className="skeleton-pill" /></td>
        <td><Skeleton className="skeleton-line skeleton-detail" /></td>
        <td><Skeleton className="skeleton-line skeleton-entity" /></td>
        <td><Skeleton className="skeleton-line skeleton-date" /></td>
      </tr>)}</tbody>
    </table>
  </div>
}

export function AuditLogsPage() {
  const branding = useSelector((state: RootState) => state.branding)
  const org: OrgInfo = { companyName: branding.companyName || 'Trust Loans', tagline: branding.tagline || 'Loan operations', country: branding.country || 'Uganda', currency: branding.currency || 'UGX', logoDataUrl: branding.logoDataUrl || null, signatureDataUrl: branding.signatureDataUrl || null }
  const [result, setResult] = useState<PagedResult<AuditEvent>>(emptyResult)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [entityType, setEntityType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const pageCount = Math.max(1, result.meta?.pageCount ?? 1)
  const total = result.meta?.total ?? 0
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  const visiblePages = Array.from({ length: pageCount }, (_, index) => index + 1)
    .slice(Math.max(0, page - 3), Math.min(pageCount, page + 2))

  async function load() {
    const request = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const response = await listAuditEvents(page, { ...(entityType.trim() ? { entityType: entityType.trim() } : {}), pageSize })
      if (request === requestId.current) setResult(Array.isArray(response)
        ? { data: response, meta: { page, pageSize: response.length || pageSize, total: response.length, pageCount: 1 } }
        : response)
    } catch (reason) {
      if (request === requestId.current) {
        const message = reason instanceof Error ? reason.message : 'Audit logs could not be loaded.'
        setError(message)
        toast.error(message)
      }
    } finally {
      if (request === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    return () => { requestId.current += 1 }
  }, [page, pageSize, entityType])

  async function exportRows() {
    if (!result.data.length) { toast.info('There are no audit events on this page to export.'); return }
    const rows = result.data.map((event) => ({ actor: event.actorName ?? event.actorId, action: event.action, detail: event.detail ?? '', entity_type: event.entityType, entity_id: event.entityId, created_at: event.createdAt }))
    try { await exportReportExcel({ reportLabel: 'Audit logs', reportKey: 'audit-logs', rows, fromDate: '', toDate: '', org }); toast.success('Audit logs exported') }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Audit logs export failed.') }
  }

  async function shareRows() {
    if (!result.data.length) { toast.info('There are no audit events on this page to share.'); return }
    const rows = result.data.map((event) => ({ actor: event.actorName ?? event.actorId, action: event.action, detail: event.detail ?? '', entity_type: event.entityType, entity_id: event.entityId, created_at: event.createdAt }))
    try {
      const blob = await exportReportExcel({ reportLabel: 'Audit logs', reportKey: 'audit-logs', rows, fromDate: '', toDate: '', org, save: false })
      if (!(blob instanceof Blob)) throw new Error('Audit logs export could not be prepared.')
      const shared = await shareBlob(blob, 'audit-logs.xlsx', 'Audit logs export', `Audit logs export from ${org.companyName}.`)
      if (shared !== 'cancelled') toast.success(shared === 'shared' ? 'Audit logs shared' : 'Audit logs downloaded for WhatsApp sharing')
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Audit logs could not be shared.') }
  }

  return <div className="settings-page">
    <div className="page-heading">
      <div><div className="eyebrow">MANAGEMENT <span className="eyebrow-separator">/</span> AUDIT</div><h1>Audit logs</h1><p>Review server-recorded decisions and access events.</p></div>
      <div className="heading-actions">
        <Button variant="outline" icon={RefreshCw} loading={loading} onClick={() => void load()}>Refresh</Button>
        <Button variant="outline" icon={Download} disabled={loading || !result.data.length} onClick={() => void exportRows()}>Export page</Button>
        <Button variant="outline" icon={MessageCircle} disabled={loading || !result.data.length} onClick={() => void shareRows()}>Share page</Button>
      </div>
    </div>
    <Card className="settings-panel">
      <div className="settings-panel-header">
        <div className="settings-panel-icon"><ShieldCheck size={18} /></div>
        <div><h2>Audit events</h2><p>{loading && !result.data.length ? 'Loading events…' : `${total.toLocaleString()} events available to your permissions.`}</p></div>
      </div>
      <div className="table-toolbar audit-toolbar">
        <Input placeholder="Filter by entity type" value={entityType} onChange={(event) => { setEntityType(event.target.value); setPage(1) }} aria-label="Filter audit logs by entity type" />
        <label className="audit-page-size">Rows per page
          <select className="pagination-size" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>
            <option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option>
          </select>
        </label>
      </div>
      {error && <div className="audit-error" role="alert"><span>{error}</span><Button variant="outline" size="sm" loading={loading} onClick={() => void load()}>Retry</Button></div>}
      {loading ? <AuditTableSkeleton /> : error ? null : result.data.length ? <div className="table-scroll">
        <table className="lf-table audit-table">
          <thead><tr><th>User</th><th>Action</th><th>Details</th><th>Entity</th><th>Date</th></tr></thead>
          <tbody>{result.data.map((event) => <tr key={event._id}>
            <td><strong>{event.actorName ?? 'System'}</strong></td>
            <td><StatusBadge status={event.action} /></td>
            <td>{event.detail ?? event.action.replace(/[._]/g, ' ')}</td>
            <td>{event.entityType}{event.entityId ? ` · ${String(event.entityId).slice(0, 8)}` : ''}</td>
            <td>{new Date(event.createdAt).toLocaleString()}</td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="table-empty audit-empty"><strong>{entityType ? 'No matching audit events' : 'No audit events yet'}</strong><p>{entityType ? 'Try another entity type or clear the filter.' : 'Recorded decisions and access events will appear here.'}</p></div>}
      <div className="table-pagination audit-pagination">
        <span>Showing <strong>{start}–{end}</strong> of <strong>{total.toLocaleString()}</strong></span>
        <div className="pagination-controls">
          <div className="pagination-buttons">
            <button disabled={loading || page <= 1} onClick={() => setPage(1)} aria-label="First page"><ChevronsLeft size={15} /></button>
            <button disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous page"><ChevronLeft size={15} /></button>
            {visiblePages.map((pageNumber) => <button key={pageNumber} className={pageNumber === page ? 'pagination-current' : ''} disabled={loading} onClick={() => setPage(pageNumber)} aria-label={`Go to page ${pageNumber}`} aria-current={pageNumber === page ? 'page' : undefined}>{pageNumber}</button>)}
            <button disabled={loading || page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} aria-label="Next page"><ChevronRight size={15} /></button>
            <button disabled={loading || page >= pageCount} onClick={() => setPage(pageCount)} aria-label="Last page"><ChevronsRight size={15} /></button>
          </div>
        </div>
      </div>
    </Card>
  </div>
}
