import { useEffect, useState } from 'react'
import { ArrowLeft, Download, FileText, LockKeyhole, Pencil, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { formatDate, formatUGX } from '../lib/format'
import { Button, Card, Field, Input, StatusBadge, Textarea } from './ui/primitives'
import { getRecordDetail, listEntityAudit, calculateCreditScore, getLatestCreditAssessment, exportPaymentReceipt, exportLoanStatementCsv, type AuditEvent, type CreditAssessment } from '../lib/api'
import { api } from '../lib/services'
import type { RootState } from '../store/store'

const labels: Record<string, { endpoint: 'customers' | 'products' | 'applications' | 'loans' | 'payments'; entity: string; back: string; title: string; editPath?: (id: string) => string }> = {
  customers: { endpoint: 'customers', entity: 'customer', back: '/customers', title: 'Customer', editPath: (id) => `/customers/${id}/edit` },
  products: { endpoint: 'products', entity: 'loan_product', back: '/products', title: 'Loan product', editPath: (id) => `/products/${id}/edit` },
  applications: { endpoint: 'applications', entity: 'loan_application', back: '/applications', title: 'Loan application' },
  loans: { endpoint: 'loans', entity: 'loan_account', back: '/loans', title: 'Loan account' },
  repayments: { endpoint: 'payments', entity: 'repayment', back: '/repayments', title: 'Repayment' },
}

const sensitiveFields = new Set([
  'nationalid', 'nationalidnumber', 'idnumber', 'identificationreference',
  'monthlyincome', 'income', 'salary', 'outstanding', 'outstandingbalance', 'balance',
])

function humanizeFieldLabel(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bId\b/g, 'ID')
    .replace(/\bUgx\b/g, 'UGX')
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.length ? value.map(display).join(', ') : '—'
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    if (o.name) return display(o.name)
    if (o.customerNumber) return display(o.customerNumber)
    if (o._id) return String(o._id)
    return Object.keys(o).length ? 'Additional details' : '—'
  }
  return String(value)
}

function isSensitiveField(key: string) {
  return sensitiveFields.has(key.replace(/[_\s-]/g, '').toLowerCase())
}

const ugx = (m: unknown) => typeof m === 'number' ? formatUGX(m / 100) : '—'
function displayRecordField(key: string, value: unknown) {
  if (typeof value === 'number' && /minor$/i.test(key)) return ugx(value)
  if (typeof value === 'string' && /(date|due|submitted|registered|created|updated)/i.test(key) && /^\d{4}-\d{2}-\d{2}/.test(value)) return formatDate(value)
  return display(value)
}
export function RecordDetailPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const role = useSelector((state: RootState) => state.session.role)
  const segment = location.pathname.split('/')[1] ?? ''
  const config = labels[segment]
  const [record, setRecord] = useState<Record<string, unknown> | null>(null)
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [edit, setEdit] = useState({ amount: '', duration: '', purpose: '', income: '', obligations: '' })
  const [statement, setStatement] = useState<Record<string, any> | null>(null)
  const [credit, setCredit] = useState<CreditAssessment | null>(null)
  const [creditLoading, setCreditLoading] = useState(false)
  const [action, setAction] = useState<{ title: string; desc: string; label: string; danger?: boolean; run: (reason: string) => Promise<void> } | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const normalizedRole = role.replace(/\s/g, '').toLowerCase()
  const canViewSensitive = !['cashier', 'collectionsofficer'].includes(normalizedRole)
  const canAssessCredit = ['superadmin','admin','manager','approver','creditofficer','loanofficer'].includes(normalizedRole) || normalizedRole.includes('admin')

  async function load() {
    if (!config) return
    setLoading(true)
    setError(null)
    try {
      const detail = await getRecordDetail(config.endpoint, decodeURIComponent(id))
      const history = await listEntityAudit(config.entity, String(detail._id ?? id)).catch(() => ({ data: [] as AuditEvent[] }))
      setRecord(detail)
      setAudit(history.data ?? [])
      const minor = (k: string) => { const v = detail[k]; return typeof v === 'number' ? String(v / 100) : '' }
      setEdit({ amount: minor('amountMinor'), duration: String(detail.tenureMonths ?? ''), purpose: String(detail.purpose ?? ''), income: minor('incomeMinor'), obligations: minor('obligationsMinor') })
      if (config.endpoint === 'loans') { try { const { getLoanStatement } = await import('../lib/api'); setStatement(await getLoanStatement(String(detail._id ?? id))) } catch { setStatement(null) } } else setStatement(null)
      try {
        if (segment === 'applications') setCredit(await getLatestCreditAssessment({ applicationId: String(detail._id ?? id) }))
        else if (segment === 'customers') setCredit(await getLatestCreditAssessment({ customerId: String(detail._id ?? id) }))
        else setCredit(null)
      } catch { setCredit(null) }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Record could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [id, segment])

  if (!config) return <div className="not-found-card"><h1>Record type not found</h1><Button onClick={() => navigate(-1)}>Go back</Button></div>
  if (loading) return <div className="page-loading">Loading {config.title.toLowerCase()}…</div>
  if (error || !record) return <div className="not-found-card"><span><FileText size={22} /></span><h1>Record unavailable</h1><p>{error ?? 'The record was not found or you do not have access.'}</p><div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}><Button variant="outline" onClick={() => void load()}>Retry</Button><Button variant="outline" onClick={() => navigate(config.back)}>Go back</Button></div></div>

  const entries = Object.entries(record).filter(([key]) => !['_id', '__v'].includes(key))
  const title = display(record.name ?? record.customer ?? record.reference ?? record.customerNumber ?? record._id)
  const editTo = config.editPath?.(id)
  const canEditApplication = segment === 'applications' && !!record && ['draft','submitted','under_review','assessment_required','approval_pending'].includes(String(record.status ?? ''))


  async function runCreditScore() {
    if (!record) return
    setCreditLoading(true)
    try {
      const input = segment === 'applications'
        ? { applicationId: String(record._id ?? id) }
        : { customerId: String(record._id ?? id) }
      const result = await calculateCreditScore(input)
      setCredit(result)
      toast.success(`Credit score calculated: ${result.score ?? '—'}/100 (${result.grade ?? '—'})`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Credit score could not be calculated.') }
    finally { setCreditLoading(false) }
  }

  async function saveApplication() {
    if (!record) return
    setSaving(true)
    try {
      await api.updateApplication(String(record._id ?? id), { amount: Number(edit.amount || 0), duration: Number(edit.duration || 0), purpose: edit.purpose, income: Number(edit.income || 0), obligations: Number(edit.obligations || 0), version: Number(record.version ?? 1) })
      toast.success('Application updated'); setEditing(false); await load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Application could not be updated.') } finally { setSaving(false) }
  }

  return <div className="detail-page">
    <div className="page-heading detail-page-heading">
      <div>
        <div className="eyebrow"><Link to={config.back}><ArrowLeft size={13} /> {config.title.toUpperCase()}</Link><span className="eyebrow-separator">/</span> RECORD DETAIL</div>
        <h1>{title}</h1>
        <p>Server-backed {config.title.toLowerCase()} record and audit history.</p>
      </div>
      <div className="heading-actions">
        <Button variant="outline" icon={RefreshCw} onClick={() => void load()}>Refresh</Button>
        {editTo ? <Button icon={Pencil} onClick={() => navigate(editTo)}>Edit</Button> : null}
        {canEditApplication ? <Button icon={Pencil} variant={editing ? 'outline' : 'primary'} onClick={() => setEditing((v) => !v)}>{editing ? 'Cancel edit' : 'Edit application'}</Button> : null}
        {segment === 'applications' && canAssessCredit ? <Button variant="outline" icon={TrendingUp} loading={creditLoading} onClick={() => void runCreditScore()}>Calculate credit score</Button> : null}
        {segment === 'applications' && record && !['approved','rejected','cancelled','withdrawn'].includes(String(record.status ?? '')) ? <>
          <Button variant="outline" onClick={() => setAction({ title: 'Move application status', desc: 'Move to under review / info requested workflow state with an audited reason.', label: 'Move to under review', run: async (reason) => { await api.transitionApplication(String(record._id ?? id), 'under_review', reason, Number(record.version ?? 1)); toast.success('Application moved to under review'); await load() } })}>Under review</Button>
          <Button variant="outline" onClick={() => setAction({ title: 'Request more information', desc: 'Ask the applicant/officer for missing information. State transition is audited.', label: 'Request info', run: async (reason) => { await api.transitionApplication(String(record._id ?? id), 'info_requested', reason, Number(record.version ?? 1)); toast.success('Application marked info requested'); await load() } })}>Request info</Button>
          <Button variant="outline" onClick={() => setAction({ title: 'Add review comment', desc: 'Add an internal review comment. This does not change approval state.', label: 'Add comment', run: async (reason) => { await api.addApplicationComment(String(record._id ?? id), reason, 'review'); toast.success('Comment added'); await load() } })}>Add comment</Button>
          <Button variant="outline" onClick={() => setAction({ title: 'Withdraw application', desc: 'Withdraw is applicant/staff initiated and audited; use when the application should stop without administrative cancellation.', label: 'Withdraw', danger: true, run: async (reason) => { await api.withdrawApplication(String(record._id ?? id), reason, Number(record.version ?? 1)); toast.success('Application withdrawn'); await load() } })}>Withdraw</Button>
          <Button variant="danger" onClick={() => setAction({ title: 'Cancel application', desc: 'Cancellation is an administrative stop. This action is irreversible and audited.', label: 'Cancel application', danger: true, run: async (reason) => { await api.cancelApplication(String(record._id ?? id), reason, Number(record.version ?? 1)); toast.success('Application cancelled'); await load() } })}>Cancel</Button>
        </> : null}
        {segment === 'repayments' && String(record?.status ?? '') === 'pending_verification' ? <Button onClick={async () => { try { await api.confirmRepayment(String(record?._id ?? id)); toast.success('Repayment confirmed'); await load() } catch (e) { toast.error(e instanceof Error ? e.message : 'Repayment could not be confirmed. Check repayments.confirm permission.') } }}>Confirm payment</Button> : null}
        {segment === 'repayments' ? <Button variant="outline" onClick={async () => { try { await exportPaymentReceipt(String(record?._id ?? id)) } catch (e) { toast.error(e instanceof Error ? e.message : 'Receipt could not be opened.') } }}>Receipt</Button> : null}
        {segment === 'repayments' && String(record?.status ?? '') === 'confirmed' ? <Button variant="danger" onClick={() => setAction({ title: 'Reverse repayment', desc: 'Reversal posts accounting reversal entries and is irreversible. Provide a clear audit reason.', label: 'Reverse payment', danger: true, run: async (reason) => { await api.reverseRepayment(String(record?._id ?? id), reason); toast.success('Repayment reversed'); await load() } })}>Reverse payment</Button> : null}
        {segment === 'loans' && String(record?.status ?? '') === 'pending_disbursement' ? <Button onClick={() => navigate(`/disbursements/new?mode=authorize&loan=${encodeURIComponent(String(record?._id ?? id))}`)}>Authorize disbursement</Button> : null}
        {segment === 'loans' ? <Button variant="outline" onClick={async () => { try { await exportLoanStatementCsv(String(record?._id ?? id)) } catch (e) { toast.error(e instanceof Error ? e.message : 'Statement export failed.') } }}>Statement CSV</Button> : null}
        <Button variant="outline" icon={Download} onClick={() => {
          if (segment === 'loans') { void exportLoanStatementCsv(String(record?._id ?? id)).catch(() => toast.error('Statement export failed.')); return }
          const rows = [Object.fromEntries(Object.entries(record ?? {}).filter(([,v]) => typeof v !== 'object' || v === null))]; const headers = Object.keys(rows[0] ?? {}); const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => `"${String((r as any)[h] ?? '').replaceAll('"','""')}"`).join(','))].join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'})); a.download = `${segment}-${String(record?._id ?? id)}.csv`; a.click(); URL.revokeObjectURL(a.href)
        }}>Export</Button>
        <Button variant="outline" onClick={() => window.print()}>Print / receipt</Button>
      </div>
    </div>
    <Card className="detail-info-card">
      <div className="detail-card-head"><h2>Record details</h2><StatusBadge status={display(record.status ?? record.state ?? 'Active')} /></div>
      <div className="info-grid">
        {entries.map(([key, value]) => {
          const restricted = !canViewSensitive && isSensitiveField(key)
          return <div key={key}><span>{humanizeFieldLabel(key)}</span><strong className={key.toLowerCase().includes('id') || key === 'reference' ? 'mono-text' : ''}>{restricted ? 'Restricted' : displayRecordField(key, value)}</strong></div>
        })}
      </div>
      {!canViewSensitive && <div className="access-warning"><LockKeyhole size={15} /> Sensitive financial and identification values are masked for the {role} demo role. The backend must enforce authorization on every request.</div>}
    </Card>
    {(segment === 'applications' || segment === 'customers') && <Card className="detail-info-card"><div className="detail-card-head"><h2><TrendingUp size={16} /> Credit score</h2>{canAssessCredit && <Button size="sm" variant="outline" loading={creditLoading} onClick={() => void runCreditScore()}>{credit ? 'Recalculate' : 'Calculate score'}</Button>}</div>
      {credit ? <><div className="info-grid">{[['Score', `${credit.score ?? '—'} / 100`], ['Grade', credit.grade ?? '—'], ['Risk level', String(credit.riskLevel ?? '—').replaceAll('_', ' ')], ['Recommendation', String(credit.recommendation ?? '—').replaceAll('_', ' ')], ['Model', `${credit.source ?? 'internal'} ${credit.modelVersion ?? ''}`.trim()], ['Calculated', credit.calculatedAt ? new Date(credit.calculatedAt).toLocaleString() : credit.createdAt ? new Date(credit.createdAt).toLocaleString() : '—']].map(([k,v]) => <div key={String(k)}><span>{k}</span><strong>{v}</strong></div>)}</div>
      {!!credit.riskIndicators?.length && <div style={{marginTop:10}}><span style={{fontSize:12,color:'#64748b'}}>Risk indicators</span><p style={{margin:'4px 0 0'}}>{credit.riskIndicators.join(' · ')}</p></div>}
      {!!credit.factors?.length && <div className="table-scroll" style={{marginTop:10}}><table className="lf-table"><thead><tr><th>Factor</th><th>Impact</th><th>Points</th><th>Value</th></tr></thead><tbody>{credit.factors.map((f)=><tr key={f.code}><td>{f.label}</td><td><StatusBadge status={f.impact === 'positive' ? 'Active' : f.impact === 'negative' ? 'Overdue' : 'Pending review'} /></td><td>{f.points > 0 ? `+${f.points}` : f.points}</td><td className="mono-text">{f.value === undefined ? '—' : String(f.value)}</td></tr>)}</tbody></table></div>}</>
      : <div className="table-empty"><strong>No credit score yet</strong><p>{canAssessCredit ? 'Calculate an internal credit score from borrower, application, and repayment history.' : 'No credit assessment is available for this record.'}</p></div>}
    </Card>}
    {editing && canEditApplication && <Card className="detail-info-card"><div className="detail-card-head"><h2><Pencil size={16} /> Edit application</h2></div><div className="form-grid"><Field label="Requested amount (UGX)"><Input type="number" min="0" step="1" inputMode="numeric" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></Field><Field label="Duration (months)"><Input type="number" min="1" step="1" value={edit.duration} onChange={(e) => setEdit({ ...edit, duration: e.target.value })} /></Field><Field label="Monthly income (UGX)"><Input type="number" min="0" step="1" inputMode="numeric" value={edit.income} onChange={(e) => setEdit({ ...edit, income: e.target.value })} /></Field><Field label="Monthly obligations (UGX)"><Input type="number" min="0" step="1" inputMode="numeric" value={edit.obligations} onChange={(e) => setEdit({ ...edit, obligations: e.target.value })} /></Field><Field label="Purpose" className="field-span-2"><Textarea rows={3} value={edit.purpose} onChange={(e) => setEdit({ ...edit, purpose: e.target.value })} /></Field></div><div className="dialog-actions"><Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button><Button loading={saving} onClick={() => void saveApplication()}>Save changes</Button></div></Card>}

    {segment === 'loans' && record && <Card className="detail-info-card"><div className="detail-card-head"><h2>Loan actions</h2></div><div className="dialog-actions" style={{justifyContent:'flex-start',flexWrap:'wrap'}}>{String(record.status ?? '') === 'pending_disbursement' && <Button onClick={() => navigate(`/disbursements/new?loan=${encodeURIComponent(String(record._id ?? id))}`)}>Disburse loan</Button>}<Button variant="outline" onClick={() => setAction({ title: 'Restructure loan', desc: 'Record a restructure with an audit reason.', label: 'Restructure', run: async (reason) => { await api.loanLifecycle(String(record._id ?? id), 'restructure', reason); toast.success('Loan restructured'); await load() } })}>Restructure</Button><Button variant="outline" onClick={() => setAction({ title: 'Refinance loan', desc: 'Record refinancing with an audit reason.', label: 'Refinance', run: async (reason) => { await api.loanLifecycle(String(record._id ?? id), 'refinance', reason); toast.success('Loan refinanced'); await load() } })}>Refinance</Button><Button variant="outline" onClick={() => setAction({ title: 'Apply penalty', desc: 'Apply a penalty/lifecycle event with an audit reason.', label: 'Apply penalty', run: async (reason) => { await api.loanLifecycle(String(record._id ?? id), 'penalty', reason); toast.success('Penalty applied'); await load() } })}>Apply penalty</Button><Button variant="outline" onClick={() => setAction({ title: 'Settle loan', desc: 'Mark this loan as settled with an audit reason.', label: 'Settle loan', run: async (reason) => { await api.loanLifecycle(String(record._id ?? id), 'settle', reason); toast.success('Loan settled'); await load() } })}>Settle loan</Button><Button variant="danger" onClick={() => setAction({ title: 'Write off loan', desc: 'Write off this loan with an audit reason. This is a significant accounting action.', label: 'Write off loan', danger: true, run: async (reason) => { await api.loanLifecycle(String(record._id ?? id), 'write_off', reason); toast.success('Loan written off'); await load() } })}>Write off</Button></div></Card>}
    {segment === 'loans' && statement && <Card className="detail-info-card"><div className="detail-card-head"><h2><FileText size={16} /> Loan statement</h2></div>
      <div className="info-grid">{[['Principal', ugx((statement.summary as any)?.principalMinor)], ['Confirmed paid', ugx((statement.summary as any)?.confirmedPaidMinor)], ['Outstanding principal', ugx((statement.summary as any)?.outstandingPrincipalMinor)], ['Outstanding interest', ugx((statement.summary as any)?.outstandingInterestMinor)], ['Outstanding fees', ugx((statement.summary as any)?.outstandingFeesMinor)], ['Total outstanding', ugx((statement.summary as any)?.outstandingMinor)]].map(([k,v]) => <div key={String(k)}><span>{k}</span><strong>{v as string}</strong></div>)}</div>
      <div className="detail-card-head" style={{marginTop:12}}><h3>Repayment schedule</h3></div>
      <div className="table-scroll"><table className="lf-table"><thead><tr><th>#</th><th>Due date</th><th>Total</th><th>Status</th></tr></thead><tbody>{((statement.schedule as any[])||[]).map((r:any)=><tr key={r._id??r.installmentNumber}><td>{r.installmentNumber}</td><td>{String(r.dueDate??'').slice(0,10)}</td><td>{ugx(r.totalMinor)}</td><td><StatusBadge status={String(r.status??'pending')} /></td></tr>)}{!((statement.schedule as any[])||[]).length && <tr><td colSpan={4}>No schedule</td></tr>}</tbody></table></div>
      <div className="detail-card-head" style={{marginTop:12}}><h3>Payments (including partial/daily)</h3></div>
      <div className="table-scroll"><table className="lf-table"><thead><tr><th>Date</th><th>Reference</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>{((statement.payments as any[])||[]).map((p:any)=><tr key={p._id??p.reference}><td>{String(p.createdAt??'').slice(0,10)}</td><td className="mono-text">{p.reference}</td><td>{ugx(p.amountMinor)}</td><td>{p.method}</td><td><StatusBadge status={p.status==='confirmed'?'Successful':p.status==='pending_verification'?'Pending review':String(p.status)} /></td></tr>)}{!((statement.payments as any[])||[]).length && <tr><td colSpan={5}>No payments recorded</td></tr>}</tbody></table></div>
    </Card>}
    {segment === 'applications' && <Card className="detail-info-card"><div className="detail-card-head"><h2>Review comments & attachments</h2></div><div className="detail-card-head" style={{marginTop:0}}><h3>Comments</h3></div>{Array.isArray((record as any).reviewComments) && (record as any).reviewComments.length ? <div className="activity-list">{((record as any).reviewComments as any[]).slice().reverse().map((c,i)=><div className="activity-row" key={i}><span className="activity-icon activity-info"><ShieldCheck size={15} /></span><span><strong>{String(c.kind||'review')}</strong><small>{String(c.body||'')}</small></span><time>{c.at ? new Date(c.at).toLocaleString() : ''} · {String(c.actorName||c.actorId||'')}</time></div>)}</div> : <div className="table-empty"><strong>No review comments</strong></div>}<div className="detail-card-head" style={{marginTop:12}}><h3>Attachments (metadata)</h3></div>{Array.isArray((record as any).attachments) && (record as any).attachments.length ? <div className="table-scroll"><table className="lf-table"><thead><tr><th>Name</th><th>Kind</th><th>Reference</th><th>Added</th></tr></thead><tbody>{((record as any).attachments as any[]).map((a,i)=><tr key={i}><td>{String(a.name||'')}</td><td>{String(a.kind||'document')}</td><td className="mono-text">{String(a.reference||'')}</td><td>{a.addedAt ? new Date(a.addedAt).toLocaleString() : '—'}</td></tr>)}</tbody></table></div> : <div className="table-empty"><strong>No attachment metadata</strong><p>Use the customer/document upload flow for file storage; this section tracks application-level attachment references.</p></div>}</Card>}
    <Card className="detail-info-card">
      <div className="detail-card-head"><h2><ShieldCheck size={16} /> Audit history</h2></div>
      {audit.length ? <div className="activity-list">{audit.map((event) => <div className="activity-row" key={event._id}><span className="activity-icon activity-info"><ShieldCheck size={15} /></span><span><strong>{event.action}</strong><small>{event.entityType} · {event.entityId} · by {event.actorId}</small></span><time>{new Date(event.createdAt).toLocaleString()}</time></div>)}</div> : <div className="table-empty"><strong>No audit events recorded</strong><p>History will appear after a server-side action.</p></div>}
    </Card>
    {action && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card" style={{maxWidth:520}}><h3>{action.title}</h3><p>{action.desc}</p><Field label="Reason"><Textarea rows={4} value={actionReason} onChange={(e)=>setActionReason(e.target.value)} placeholder="Provide a clear reason for audit..." /></Field><div className="dialog-actions"><Button variant="outline" disabled={actionBusy} onClick={()=>{setAction(null);setActionReason('')}}>Cancel</Button><Button variant={action.danger?'danger':'primary'} loading={actionBusy} onClick={async ()=>{ if(actionReason.trim().length<3){toast.error('Please provide a reason (at least 3 characters).');return} setActionBusy(true); try{await action.run(actionReason.trim()); setAction(null); setActionReason('')}catch(e){toast.error(e instanceof Error?e.message:'Action failed.')}finally{setActionBusy(false)} }}>{action.label}</Button></div></div></div>}
  </div>
}
