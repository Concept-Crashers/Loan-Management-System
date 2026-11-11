import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Download, MessageCircle, RefreshCw, WalletCards } from 'lucide-react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { Button, Card, Input, Skeleton, StatusBadge } from '../../components/ui/primitives'
import { shareBlob } from '../../lib/api'
import { exportReportExcel, type OrgInfo } from '../../lib/exportDocs'
import { listCashbook, listDeadLetterDeliveries, listSyncConflicts, resolveSyncConflict, retryNotificationDelivery, settleCashbookEntry } from '../../lib/api'
import type { RootState } from '../../store/store'

type RecordRow = Record<string, unknown>
type Tab = 'cashbook' | 'conflicts' | 'deliveries'

function exportPayload(rows: RecordRow[], name: string, org: OrgInfo) {
  return exportReportExcel({
    reportLabel: name.replace(/[-_]+/g, ' '),
    reportKey: name,
    rows: rows as Record<string, unknown>[],
    fromDate: '',
    toDate: '',
    org,
  })
}

export function EnterpriseOperationsPage() {
  const branding = useSelector((state: RootState) => state.branding)
  const org: OrgInfo = { companyName: branding.companyName || 'Trust Loans', tagline: branding.tagline || 'Loan operations', country: branding.country || 'Uganda', currency: branding.currency || 'UGX', logoDataUrl: branding.logoDataUrl || null, signatureDataUrl: branding.signatureDataUrl || null }
  const [tab, setTab] = useState<Tab>('cashbook')
  const [rows, setRows] = useState<RecordRow[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)
  const requestId = useRef(0)

  async function load(nextTab = tab) {
    const request = ++requestId.current
    setLoading(true)
    setLoadError(null)
    try {
      const result = nextTab === 'cashbook' ? await listCashbook() : nextTab === 'conflicts' ? await listSyncConflicts() : await listDeadLetterDeliveries()
      if (request === requestId.current) { setRows(result); setPage(1) }
    } catch (error) {
      if (request === requestId.current) {
        const message = error instanceof Error ? error.message : 'Enterprise operations could not be loaded.'
        setLoadError(message)
        toast.error(message)
      }
    } finally { if (request === requestId.current) setLoading(false) }
  }
  useEffect(() => { void load(); return () => { requestId.current += 1 } }, [tab])

  const filtered = useMemo(() => rows.filter((row) => !search.trim() || Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(search.toLowerCase().trim()))), [rows, search])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const id = (row: RecordRow) => String(row._id ?? row.id ?? '')

  async function action(row: RecordRow) {
    const rowId = id(row)
    setActionId(rowId)
    try {
      if (tab === 'cashbook') await settleCashbookEntry(rowId)
      else if (tab === 'conflicts') await resolveSyncConflict(rowId, 'accept_server')
      else await retryNotificationDelivery(rowId)
      toast.success(tab === 'cashbook' ? 'Cashbook entry settled' : tab === 'conflicts' ? 'Conflict resolved using server state' : 'Delivery queued for retry')
      await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Action could not be completed.') }
    finally { setActionId(null) }
  }

  const title = tab === 'cashbook' ? 'Cashbook settlement' : tab === 'conflicts' ? 'Offline sync conflicts' : 'Notification dead letters'
  return <div className="settings-page">
    <div className="page-heading"><div><div className="eyebrow">OPERATIONS <span className="eyebrow-separator">/</span> CONTROL CENTRE</div><h1>Enterprise operations</h1><p>Review exceptions and complete controlled operational actions.</p></div><Button variant="outline" icon={RefreshCw} loading={loading} onClick={() => void load()}>Refresh</Button></div>
    <div className="operations-tabs" role="tablist">{([{ key: 'cashbook', label: 'Cashbook' }, { key: 'conflicts', label: 'Sync conflicts' }, { key: 'deliveries', label: 'Notification retries' }] as const).map((item) => <button key={item.key} role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'operations-tab operations-tab-active' : 'operations-tab'} onClick={() => setTab(item.key)}>{item.label}</button>)}</div>
    <Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><WalletCards size={18} /></div><div><h2>{title}</h2><p>{loading && !rows.length ? 'Loading control records…' : `${filtered.length} records available to your permissions.`}</p></div><div className="heading-actions"><Button variant="outline" size="sm" icon={Download} disabled={loading || !filtered.length} onClick={() => void exportPayload(filtered, tab, org).then(() => toast.success('Export downloaded')).catch((e) => toast.error(e instanceof Error ? e.message : 'Export failed.'))}>Export Excel</Button><Button variant="outline" size="sm" icon={MessageCircle} disabled={loading || !filtered.length} onClick={() => { if (!filtered.length) { toast.info('There are no records to share.'); return } void exportReportExcel({ reportLabel: tab, reportKey: tab, rows: filtered as Record<string, unknown>[], fromDate: '', toDate: '', org, save: false }).then(async (blob) => { if (!(blob instanceof Blob)) throw new Error('Export file could not be prepared.'); const r = await shareBlob(blob, `${tab}-report.xlsx`, `${title} export`, `${title} export from ${org.companyName}.`); if (r !== 'cancelled') toast.success(r === 'shared' ? 'Export shared' : 'Export downloaded for WhatsApp sharing') }).catch((e) => toast.error(e instanceof Error ? e.message : 'Share failed.')) }}>Share via WhatsApp</Button></div></div>
      <div className="table-toolbar"><div className="table-search"><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder={`Search ${title.toLowerCase()}...`} /></div><span className="settings-save-note"><span className="online-dot" /> Server-backed records</span></div>
      {loadError && <div className="audit-error" role="alert"><span>{loadError}</span><Button variant="outline" size="sm" loading={loading} onClick={() => void load()}>Retry</Button></div>}
      {loading ? <div className="table-scroll" aria-label="Loading control records" aria-busy="true"><table className="lf-table"><thead><tr><th>Reference</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>{Array.from({ length: 5 }, (_, index) => <tr key={index}>{Array.from({ length: 4 }, (_, column) => <td key={column}><Skeleton className="skeleton-line skeleton-detail" /></td>)}</tr>)}</tbody></table></div> : loadError ? null : <div className="table-scroll"><table className="lf-table"><thead><tr><th>Reference</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>{visible.map((row) => <tr key={id(row)}><td className="mono-text">{String(row.reference ?? row.operationId ?? row.notificationId ?? id(row))}</td><td><StatusBadge status={String(row.status ?? 'open')} /></td><td>{String(row.createdAt ?? row.updatedAt ?? '—')}</td><td><Button size="sm" icon={tab === 'conflicts' ? AlertTriangle : Check} loading={actionId === id(row)} disabled={!!actionId} onClick={() => void action(row)}>{tab === 'cashbook' ? 'Settle' : tab === 'conflicts' ? 'Resolve' : 'Retry'}</Button></td></tr>)}{!visible.length && <tr><td colSpan={4}><div className="table-empty"><strong>{rows.length ? 'No matching records' : 'No records yet'}</strong><p>{rows.length ? 'Try another search or clear the filter.' : 'New control records will appear here when the system has items to review.'}</p></div></td></tr>}</tbody></table></div>}
      <div className="table-pagination"><span>Showing <strong>{filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)}</strong> of <strong>{filtered.length}</strong></span><div className="pagination-buttons"><button disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)} aria-label="Previous page">‹</button><span>{page} / {pageCount}</span><button disabled={loading || page >= pageCount} onClick={() => setPage((value) => value + 1)} aria-label="Next page">›</button></div></div>
    </Card>
  </div>
}
