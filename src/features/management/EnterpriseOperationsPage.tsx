import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Download, RefreshCw, WalletCards } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Input, StatusBadge } from '../../components/ui/primitives'
import { listCashbook, listDeadLetterDeliveries, listSyncConflicts, resolveSyncConflict, retryNotificationDelivery, settleCashbookEntry } from '../../lib/api'

type RecordRow = Record<string, unknown>
type Tab = 'cashbook' | 'conflicts' | 'deliveries'

function exportRows(rows: RecordRow[], name: string) {
  if (!rows.length) { toast.info('There are no records to export.'); return }
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [keys.map(quote).join(','), ...rows.map((row) => keys.map((key) => quote(row[key])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${name}.csv`; anchor.click(); URL.revokeObjectURL(url)
  toast.success('Export downloaded')
}

export function EnterpriseOperationsPage() {
  const [tab, setTab] = useState<Tab>('cashbook')
  const [rows, setRows] = useState<RecordRow[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [loading, setLoading] = useState(true)

  async function load(nextTab = tab) {
    setLoading(true)
    try {
      setRows(nextTab === 'cashbook' ? await listCashbook() : nextTab === 'conflicts' ? await listSyncConflicts() : await listDeadLetterDeliveries())
      setPage(1)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enterprise operations could not be loaded.')
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [tab])

  const filtered = useMemo(() => rows.filter((row) => !search.trim() || Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(search.toLowerCase().trim()))), [rows, search])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const id = (row: RecordRow) => String(row._id ?? row.id ?? '')

  async function action(row: RecordRow) {
    try {
      if (tab === 'cashbook') await settleCashbookEntry(id(row))
      else if (tab === 'conflicts') await resolveSyncConflict(id(row), 'accept_server')
      else await retryNotificationDelivery(id(row))
      toast.success(tab === 'cashbook' ? 'Cashbook entry settled' : tab === 'conflicts' ? 'Conflict resolved using server state' : 'Delivery queued for retry')
      await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Action could not be completed.') }
  }

  const title = tab === 'cashbook' ? 'Cashbook settlement' : tab === 'conflicts' ? 'Offline sync conflicts' : 'Notification dead letters'
  return <div className="settings-page">
    <div className="page-heading"><div><div className="eyebrow">OPERATIONS <span className="eyebrow-separator">/</span> CONTROL CENTRE</div><h1>Enterprise operations</h1><p>Review exceptions and complete controlled operational actions.</p></div><Button variant="outline" icon={RefreshCw} onClick={() => void load()}>Refresh</Button></div>
    <div className="operations-tabs" role="tablist">{([{ key: 'cashbook', label: 'Cashbook' }, { key: 'conflicts', label: 'Sync conflicts' }, { key: 'deliveries', label: 'Notification retries' }] as const).map((item) => <button key={item.key} role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'operations-tab operations-tab-active' : 'operations-tab'} onClick={() => setTab(item.key)}>{item.label}</button>)}</div>
    <Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><WalletCards size={18} /></div><div><h2>{title}</h2><p>{filtered.length} records available to your permissions.</p></div><Button variant="outline" size="sm" icon={Download} onClick={() => exportRows(filtered, tab)}>Export</Button></div>
      <div className="table-toolbar"><div className="table-search"><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder={`Search ${title.toLowerCase()}...`} /></div><span className="settings-save-note"><span className="online-dot" /> Server-backed records</span></div>
      {loading ? <div className="page-loading">Loading control records…</div> : <div className="table-scroll"><table className="lf-table"><thead><tr><th>Reference</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>{visible.map((row) => <tr key={id(row)}><td className="mono-text">{String(row.reference ?? row.operationId ?? row.notificationId ?? id(row))}</td><td><StatusBadge status={String(row.status ?? 'open')} /></td><td>{String(row.createdAt ?? row.updatedAt ?? '—')}</td><td><Button size="sm" icon={tab === 'conflicts' ? AlertTriangle : Check} onClick={() => void action(row)}>{tab === 'cashbook' ? 'Settle' : tab === 'conflicts' ? 'Resolve' : 'Retry'}</Button></td></tr>)}{!visible.length && <tr><td colSpan={4}><div className="table-empty"><strong>No matching records</strong><p>Try another search or refresh the workspace.</p></div></td></tr>}</tbody></table></div>}
      <div className="table-pagination"><span>Showing <strong>{filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)}</strong> of <strong>{filtered.length}</strong></span><div className="pagination-buttons"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} aria-label="Previous page">‹</button><span>{page} / {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} aria-label="Next page">›</button></div></div>
    </Card>
  </div>
}
