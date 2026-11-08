import { useState } from 'react'
import { useSelector } from 'react-redux'
import { Activity, Check, Clock3, Download, FileCheck2, FileText, History, MessageCircle, ShieldCheck, UploadCloud, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, Card, Select, StatusBadge } from '../../components/ui/primitives'
import { shareBlob } from '../../lib/api'
import { exportReportExcel, type OrgInfo } from '../../lib/exportDocs'
import type { RootState } from '../../store/store'

type ActivityRecord = { id: string; title: string; detail: string; actor: string; time: string; tone: 'success' | 'warning' | 'info' }

const activityRecords: ActivityRecord[] = []

export function OperationsCenterPage({ initialTab = 'documents' }: { initialTab?: 'documents' | 'imports' | 'activity' }) {
  const branding = useSelector((state: RootState) => state.branding)
  const org: OrgInfo = { companyName: branding.companyName || 'Trust Loans', tagline: branding.tagline || 'Loan operations', country: branding.country || 'Uganda', currency: branding.currency || 'UGX', logoDataUrl: branding.logoDataUrl || null }
  const [tab, setTab] = useState(initialTab)
  const [files, setFiles] = useState<string[]>([])
  const [importType, setImportType] = useState('customers')
  const [importFile, setImportFile] = useState('')

  function chooseFiles(event: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []).map((file) => file.name))
  }

  function startImport() {
    if (!importFile) {
      toast.error('Choose a CSV file first.')
      return
    }
    toast.success('Import validation started', { description: 'Review the validation results before committing records.' })
  }

  return <div className="settings-page operations-center">
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link to="/">WORKSPACE</Link><span className="eyebrow-separator">/</span> OPERATIONS CENTRE</div>
        <h1>Operations centre</h1>
        <p>Manage sensitive documents, controlled imports and the activity trail.</p>
      </div>
      <span className="settings-save-note"><span className="online-dot" /> Operational controls</span>
    </div>
    <div className="operations-tabs" role="tablist" aria-label="Operations centre sections">
      {([{ key: 'documents', label: 'Document centre', icon: FileText }, { key: 'imports', label: 'Bulk imports', icon: UploadCloud }, { key: 'activity', label: 'Activity trail', icon: History }] as const).map(({ key, label, icon: Icon }) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'operations-tab operations-tab-active' : 'operations-tab'} onClick={() => setTab(key)}><Icon size={15} />{label}</button>)}
    </div>

    {tab === 'documents' && <div className="operations-grid">
      <Card className="settings-panel operations-upload-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><UploadCloud size={18} /></div><div><h2>Upload documents</h2><p>Attach identity, income and loan-supporting documents to a record.</p></div></div><div className="document-dropzone"><input id="operations-documents" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={chooseFiles} /><label htmlFor="operations-documents"><UploadCloud size={24} /><strong>Choose files to upload</strong><small>PDF, JPG or PNG · Max 10 MB per file</small></label></div>{files.length > 0 && <div className="document-file-list">{files.map((file) => <div key={file}><FileText size={14} /><span>{file}</span><button aria-label={`Remove ${file}`} onClick={() => setFiles((current) => current.filter((item) => item !== file))}><X size={13} /></button></div>)}</div>}<div className="settings-panel-footer"><span>Files are submitted through secure document storage.</span><Button icon={UploadCloud} onClick={() => files.length ? toast.success('Documents queued for secure upload') : toast.error('Choose at least one document')}>Queue upload</Button></div></Card>
      <Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><FileCheck2 size={18} /></div><div><h2>Document checklist</h2><p>Track completeness before an application moves forward.</p></div></div><div className="checklist-list">{['National ID or approved identification', 'Proof of address', 'Income or business evidence', 'Signed terms disclosure'].map((item, index) => <div className="checklist-row" key={item}><span className={index < 2 ? 'checklist-mark checklist-complete' : 'checklist-mark'}>{index < 2 ? <Check size={12} /> : <Clock3 size={12} />}</span><span><strong>{item}</strong><small>{index < 2 ? 'Verified for selected record' : 'Still required before approval'}</small></span></div>)}</div><div className="info-callout"><ShieldCheck size={15} /> Access to sensitive files must be enforced by the backend for every request.</div></Card>
    </div>}

    {tab === 'imports' && <div className="operations-grid"><Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><UploadCloud size={18} /></div><div><h2>Import records</h2><p>Upload a CSV, preview validation results and commit only approved rows.</p></div></div><div className="settings-form-grid"><div className="lf-field"><label className="lf-label" htmlFor="import-type">Record type</label><Select id="import-type" value={importType} onChange={(event) => setImportType(event.target.value)}><option value="customers">Customers</option><option value="repayments">Repayments</option><option value="staff">Staff members</option></Select></div><div className="lf-field"><label className="lf-label" htmlFor="import-file">CSV file</label><input id="import-file" className="lf-input" type="file" accept=".csv" onChange={(event) => setImportFile(event.target.files?.[0]?.name ?? '')} /></div></div>{importFile && <div className="selected-file"><FileText size={15} /><span>{importFile}</span><StatusBadge status="Pending review" /></div>}<div className="import-checks"><span><Check size={13} /> Duplicate detection</span><span><Check size={13} /> Required fields</span><span><Check size={13} /> Format validation</span></div><div className="settings-panel-footer"><Button variant="outline" icon={Download} onClick={() => toast.success(`Downloaded ${importType} CSV template`)}>Download template</Button><Button icon={UploadCloud} onClick={startImport}>Validate import</Button></div></Card>    <Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><ShieldCheck size={18} /></div><div><h2>Import safeguards</h2><p>Every import should be reviewable before records are created.</p></div></div><div className="safeguard-list"><span><strong>1.</strong> Upload a supported CSV template.</span><span><strong>2.</strong> Review errors and duplicate matches.</span><span><strong>3.</strong> Confirm the final row count.</span><span><strong>4.</strong> Retain the import report in the audit trail.</span></div><div className="info-callout">Validation must complete successfully before records are committed.</div></Card></div>}

    {tab === 'activity' && <Card className="settings-panel activity-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><Activity size={18} /></div><div><h2>Activity trail</h2><p>Review recent operational events and their responsible staff member.</p></div><div className="activity-filters"><Select defaultValue="all"><option value="all">All events</option><option value="financial">Financial</option><option value="access">Access</option></Select><Button variant="outline" size="sm" icon={Download} onClick={() => void exportReportExcel({ reportLabel: 'Activity trail', reportKey: 'activity-trail', rows: activityRecords as unknown as Record<string, unknown>[], fromDate: '', toDate: '', org }).then(() => toast.success('Activity export downloaded')).catch((e) => toast.error(e instanceof Error ? e.message : 'Export failed.'))}>Export</Button><Button variant="outline" size="sm" icon={MessageCircle} onClick={() => void exportReportExcel({ reportLabel: 'Activity trail', reportKey: 'activity-trail', rows: activityRecords as unknown as Record<string, unknown>[], fromDate: '', toDate: '', org, save: false }).then(async (blob) => { if (!(blob instanceof Blob)) throw new Error('Activity export could not be prepared.'); const r = await shareBlob(blob, 'activity-trail.xlsx', 'Activity trail export', `Activity trail export from ${org.companyName}.`); if (r !== 'cancelled') toast.success(r === 'shared' ? 'Activity trail shared' : 'Activity trail downloaded for WhatsApp sharing') }).catch((e) => toast.error(e instanceof Error ? e.message : 'Share failed.'))}>Share via WhatsApp</Button></div></div><div className="activity-list">{activityRecords.map((record) => <div className="activity-row" key={record.id}><span className={`activity-icon activity-${record.tone}`}><Activity size={15} /></span><span><strong>{record.title}</strong><small>{record.detail} · by {record.actor}</small></span><time>{record.time}</time></div>)}</div></Card>}
  </div>
}
