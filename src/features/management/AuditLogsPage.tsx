import { useEffect, useState } from 'react'
import { Download, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Input, StatusBadge } from '../../components/ui/primitives'
import { listAuditEvents, type AuditEvent, type PagedResult } from '../../lib/api'

export function AuditLogsPage() {
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
  function exportRows() {
    const csv = ['action,entityType,entityId,actorId,createdAt', ...(result.data ?? []).map((event) => [event.action, event.entityType, event.entityId, event.actorId, event.createdAt].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'audit-logs.csv'; anchor.click(); URL.revokeObjectURL(url)
  }
  return <div className="settings-page"><div className="page-heading"><div><div className="eyebrow">MANAGEMENT <span className="eyebrow-separator">/</span> AUDIT</div><h1>Audit logs</h1><p>Review server-recorded decisions and access events.</p></div><div className="heading-actions"><Button variant="outline" icon={RefreshCw} onClick={() => void load()}>Refresh</Button><Button variant="outline" icon={Download} onClick={exportRows}>Export</Button></div></div><Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><ShieldCheck size={18} /></div><div><h2>Audit events</h2><p>{(result.meta?.total ?? 0)} events available to your permissions.</p></div></div><div className="table-toolbar"><Input placeholder="Filter by entity type" value={entityType} onChange={(event) => { setEntityType(event.target.value); setPage(1) }} /></div>{loading ? <div className="page-loading">Loading audit events…</div> : <div className="table-scroll"><table className="lf-table"><thead><tr><th>Action</th><th>Entity</th><th>Record</th><th>Actor</th><th>Date</th></tr></thead><tbody>{(result.data ?? []).map((event) => <tr key={event._id}><td><StatusBadge status={event.action} /></td><td>{event.entityType}</td><td className="mono-text">{event.entityId}</td><td className="mono-text">{event.actorId}</td><td>{new Date(event.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}<div className="table-pagination"><span>Page {result.meta.page} of {result.meta.pageCount}</span><div className="pagination-buttons"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>‹</button><button disabled={page >= result.meta.pageCount} onClick={() => setPage((value) => value + 1)}>›</button></div></div></Card></div>
}
