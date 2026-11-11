import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { Download, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Input, StatusBadge } from '../../components/ui/primitives'
import { listAuditEvents, shareBlob, type AuditEvent, type PagedResult } from '../../lib/api'
import { exportReportExcel, type OrgInfo } from '../../lib/exportDocs'
import type { RootState } from '../../store/store'

export function AuditLogsPage() {
  const branding = useSelector((state: RootState) => state.branding)
  const org: OrgInfo = { companyName: branding.companyName || 'Trust Loans', tagline: branding.tagline || 'Loan operations', country: branding.country || 'Uganda', currency: branding.currency || 'UGX', logoDataUrl: branding.logoDataUrl || null, signatureDataUrl: branding.signatureDataUrl || null }
  const [result, setResult] = useState<PagedResult<AuditEvent>>({ data: [], meta: { page: 1, pageSize: 25, total: 0, pageCount: 1 } })
  const [page, setPage] = useState(1)
  const [entityType, setEntityType] = useState('')
  const [loading, setLoading] = useState(false)
  async function load() {
    setLoading(true)
    try { const r = await listAuditEvents(page, entityType ? { entityType } : {}); setResult(Array.isArray(r) ? { data: r, meta: { page, pageSize: r.length, total: r.length, pageCount: 1 } } : (r ?? { data: [], meta: { page: 1, pageSize: 25, total: 0, pageCount: 1 } })) }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Audit logs could not be loaded.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [page, entityType])
  async function exportRows() {
    if (!result.data?.length) { toast.info('There are no audit events to export.'); return }
    const rows = (result.data ?? []).map((event) => ({ actor: event.actorName ?? event.actorId, action: event.action, detail: event.detail ?? '', entity_type: event.entityType, entity_id: event.entityId, created_at: event.createdAt }))
    try { await exportReportExcel({ reportLabel: 'Audit logs', reportKey: 'audit-logs', rows, fromDate: '', toDate: '', org }); toast.success('Audit logs exported') }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Audit logs export failed.') }
  }
  async function shareRows() {
    if (!result.data?.length) { toast.info('There are no audit events to share.'); return }
    const rows = (result.data ?? []).map((event) => ({ actor: event.actorName ?? event.actorId, action: event.action, detail: event.detail ?? '', entity_type: event.entityType, entity_id: event.entityId, created_at: event.createdAt }))
    try {
      const blob = await exportReportExcel({ reportLabel: 'Audit logs', reportKey: 'audit-logs', rows, fromDate: '', toDate: '', org, save: false })
      if (!(blob instanceof Blob)) throw new Error('Audit logs export could not be prepared.')
      const resultShare = await shareBlob(blob, 'audit-logs.xlsx', 'Audit logs export', `Audit logs export from ${org.companyName}.`)
      if (resultShare !== 'cancelled') toast.success(resultShare === 'shared' ? 'Audit logs shared' : 'Audit logs downloaded for WhatsApp sharing')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Audit logs could not be shared.') }
  }
  return <div className="settings-page"><div className="page-heading"><div><div className="eyebrow">MANAGEMENT <span className="eyebrow-separator">/</span> AUDIT</div><h1>Audit logs</h1><p>Review server-recorded decisions and access events.</p></div><div className="heading-actions"><Button variant="outline" icon={RefreshCw} onClick={() => void load()}>Refresh</Button><Button variant="outline" icon={Download} onClick={exportRows}>Export</Button><Button variant="outline" icon={MessageCircle} onClick={() => void shareRows()}>Share via WhatsApp</Button></div></div><Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><ShieldCheck size={18} /></div><div><h2>Audit events</h2><p>{(result.meta?.total ?? 0)} events available to your permissions.</p></div></div><div className="table-toolbar"><Input placeholder="Filter by entity type" value={entityType} onChange={(event) => { setEntityType(event.target.value); setPage(1) }} /></div>{loading ? <div className="page-loading">Loading audit events…</div> : <div className="table-scroll"><table className="lf-table"><thead><tr><th>User</th><th>Action</th><th>Details</th><th>Entity</th><th>Date</th></tr></thead><tbody>{(result.data ?? []).map((event) => <tr key={event._id}><td><strong>{event.actorName ?? 'System'}</strong></td><td><StatusBadge status={event.action} /></td><td>{event.detail ?? event.action.replace(/[._]/g, ' ')}</td><td>{event.entityType}{event.entityId ? ` · ${String(event.entityId).slice(0, 8)}` : ''}</td><td>{new Date(event.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}<div className="table-pagination"><span>Page {result.meta.page} of {result.meta.pageCount}</span><div className="pagination-buttons"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>‹</button><button disabled={page >= result.meta.pageCount} onClick={() => setPage((value) => value + 1)}>›</button></div></div></Card></div>
}
