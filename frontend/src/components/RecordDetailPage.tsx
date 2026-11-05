import { useEffect, useState } from 'react'
import { ArrowLeft, Download, FileText, RefreshCw, ShieldCheck } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, Card, StatusBadge } from './ui/primitives'
import { getRecordDetail, listEntityAudit, type AuditEvent } from '../lib/api'

const labels: Record<string, { endpoint: 'customers' | 'products' | 'applications' | 'loans' | 'payments'; entity: string; back: string; title: string }> = {
  customers: { endpoint: 'customers', entity: 'customer', back: '/customers', title: 'Customer' },
  products: { endpoint: 'products', entity: 'loan_product', back: '/products', title: 'Loan product' },
  applications: { endpoint: 'applications', entity: 'loan_application', back: '/applications', title: 'Loan application' },
  loans: { endpoint: 'loans', entity: 'loan_account', back: '/loans', title: 'Loan account' },
  repayments: { endpoint: 'payments', entity: 'repayment', back: '/repayments', title: 'Repayment' },
}

function display(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function RecordDetailPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const segment = location.pathname.split('/')[1] ?? ''
  const config = labels[segment]
  const [record, setRecord] = useState<Record<string, unknown> | null>(null)
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  async function load() {
    if (!config) return
    setLoading(true); setError(null)
    try {
      const detail = await getRecordDetail(config.endpoint, decodeURIComponent(id))
      const history = await listEntityAudit(config.entity, String(detail._id ?? id))
      setRecord(detail); setAudit(history.data)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Record could not be loaded.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [id, segment])
  if (!config) return <div className="not-found-card"><h1>Record type not found</h1><Button onClick={() => navigate(-1)}>Go back</Button></div>
  if (loading) return <div className="page-loading">Loading {config.title.toLowerCase()}…</div>
  if (error || !record) return <div className="not-found-card"><span><FileText size={22} /></span><h1>Record unavailable</h1><p>{error ?? 'The record was not found or you do not have access.'}</p><Button variant="outline" onClick={() => navigate(config.back)}>Go back</Button></div>
  const entries = Object.entries(record).filter(([key]) => !['_id', '__v'].includes(key))
  const title = display(record.name ?? record.customer ?? record.reference ?? record.customerNumber ?? record._id)
  return <div className="detail-page"><div className="page-heading detail-page-heading"><div><div className="eyebrow"><Link to={config.back}><ArrowLeft size={13} /> {config.title.toUpperCase()}</Link><span className="eyebrow-separator">/</span> RECORD DETAIL</div><h1>{title}</h1><p>Server-backed {config.title.toLowerCase()} record and audit history.</p></div><div className="heading-actions"><Button variant="outline" icon={RefreshCw} onClick={() => void load()}>Refresh</Button><Button variant="outline" icon={Download} onClick={() => toast.info('Use the available report export for structured downloads.')}>Export</Button></div></div>
    <Card className="detail-info-card"><div className="detail-card-head"><h2>Record details</h2><StatusBadge status={display(record.status ?? record.state ?? 'Active')} /></div><div className="info-grid">{entries.map(([key, value]) => <div key={key}><span>{key}</span><strong className={key.toLowerCase().includes('id') || key === 'reference' ? 'mono-text' : ''}>{display(value)}</strong></div>)}</div></Card>
    <Card className="detail-info-card"><div className="detail-card-head"><h2><ShieldCheck size={16} /> Audit history</h2></div>{audit.length ? <div className="activity-list">{audit.map((event) => <div className="activity-row" key={event._id}><span className="activity-icon activity-info"><ShieldCheck size={15} /></span><span><strong>{event.action}</strong><small>{event.entityType} · {event.entityId} · by {event.actorId}</small></span><time>{new Date(event.createdAt).toLocaleString()}</time></div>)}</div> : <div className="table-empty"><strong>No audit events recorded</strong><p>History will appear after a server-side action.</p></div>}</Card>
  </div>
}
