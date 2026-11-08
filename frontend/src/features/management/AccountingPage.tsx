import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { BookOpen, Check, Download, MessageCircle, Plus, RefreshCw, Scale, WalletCards } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Input, Select, StatusBadge } from '../../components/ui/primitives'
import { closeAccountingPeriod, createChartAccount, exportPortfolioSummary, getTrialBalance, listAccountingPeriods, listChartAccounts, listLedger, openAccountingPeriod, shareBlob, type AccountingPeriod, type ChartAccount, type JournalEntry, type PagedResult } from '../../lib/api'
import { exportReportExcel, type OrgInfo } from '../../lib/exportDocs'
import { api } from '../../lib/services'
import { formatUGX } from '../../lib/format'
import type { RootState } from '../../store/store'

type Tab = 'accounts' | 'periods' | 'ledger' | 'trial-balance'
const money = (value: number) => formatUGX(value)
const emptyPage = <T,>(): PagedResult<T> => ({ data: [], meta: { page: 1, pageSize: 25, total: 0, pageCount: 1 } })

export function AccountingPage() {
  const branding = useSelector((state: RootState) => state.branding)
  const org: OrgInfo = { companyName: branding.companyName || 'Trust Loans', tagline: branding.tagline || 'Loan operations', country: branding.country || 'Uganda', currency: branding.currency || 'UGX', logoDataUrl: branding.logoDataUrl || null }
  const [tab, setTab] = useState<Tab>('accounts')
  const [accounts, setAccounts] = useState(emptyPage<ChartAccount>())
  const [periods, setPeriods] = useState(emptyPage<AccountingPeriod>())
  const [ledger, setLedger] = useState(emptyPage<JournalEntry>())
  const [trial, setTrial] = useState<Array<{ account: string; debitMinor: number; creditMinor: number; balanceMinor: number }>>([])
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [periodId, setPeriodId] = useState('')
  const [loading, setLoading] = useState(false)
  const [accountForm, setAccountForm] = useState({ code: '', name: '', type: 'asset' })
  const [periodForm, setPeriodForm] = useState({ branchId: '', periodStart: '', periodEnd: '' })

  async function load() {
    setLoading(true)
    try {
      if (tab === 'ledger' || tab === 'trial-balance') setPeriods(await listAccountingPeriods(1))
      if (tab === 'accounts') { const r = await listChartAccounts(page, search); setAccounts(Array.isArray(r) ? { data: r, meta: { page, pageSize: r.length, total: r.length, pageCount: 1 } } : r) }
      if (tab === 'periods') { const r = await listAccountingPeriods(page); setPeriods(Array.isArray(r) ? { data: r, meta: { page, pageSize: r.length, total: r.length, pageCount: 1 } } : r) }
      if (tab === 'ledger') { const r = await listLedger(page, { periodId, account: search }); setLedger(Array.isArray(r) ? { data: r, meta: { page, pageSize: r.length, total: r.length, pageCount: 1 } } : r) }
      if (tab === 'trial-balance') setTrial(await getTrialBalance({ periodId }))
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Accounting data could not be loaded.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [tab, page, periodId, search])

  async function addAccount(event: React.FormEvent) {
    event.preventDefault()
    try { await createChartAccount(accountForm); setAccountForm({ code: '', name: '', type: 'asset' }); toast.success('Chart account created'); await load() }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Chart account could not be created.') }
  }
  async function addPeriod(event: React.FormEvent) {
    event.preventDefault()
    try { await openAccountingPeriod(periodForm); setPeriodForm({ branchId: '', periodStart: '', periodEnd: '' }); toast.success('Accounting period opened'); await load() }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Accounting period could not be opened.') }
  }
  async function closePeriod(period: AccountingPeriod) {
    try {
      const result = await closeAccountingPeriod(period._id)
      const closing = result.closingEntry?.lines.length ? ' Retained earnings closing entry posted.' : ' No income or expense balance required closing.'
      toast.success(`Period closed.${closing}`)
      await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Accounting period could not be closed.') }
  }
const rows = tab === 'accounts' ? (accounts?.data ?? []) : tab === 'periods' ? (periods?.data ?? []) : (ledger?.data ?? [])
const meta = tab === 'accounts' ? (accounts?.meta ?? { page: 1, pageSize: 25, total: 0, pageCount: 1 }) : tab === 'periods' ? (periods?.meta ?? { page: 1, pageSize: 25, total: 0, pageCount: 1 }) : (ledger?.meta ?? { page: 1, pageSize: 25, total: 0, pageCount: 1 })
  const ledgerRows = (ledger.data ?? []).flatMap((entry) => entry.lines.map((line, index) => ({ posted: entry.postedAt?.slice(0, 10) ?? '—', source: entry.sourceType, account: line.account, debit_ugx: line.debitMinor ?? 0, credit_ugx: line.creditMinor ?? 0, entry_id: `${entry._id}-${index}` })))
  async function exportLedgerExcel() {
    await exportReportExcel({ reportLabel: 'General ledger', reportKey: 'general-ledger', rows: ledgerRows as Record<string, unknown>[], fromDate: '', toDate: '', org })
  }
  async function shareLedgerExcel() {
    const blob = await exportReportExcel({ reportLabel: 'General ledger', reportKey: 'general-ledger', rows: ledgerRows as Record<string, unknown>[], fromDate: '', toDate: '', org, save: false })
    if (!(blob instanceof Blob)) throw new Error('Ledger export could not be prepared.')
    const r = await shareBlob(blob, 'general-ledger.xlsx', 'General ledger export', `General ledger export from ${org.companyName}.`)
    if (r !== 'cancelled') toast.success(r === 'shared' ? 'Ledger shared' : 'Ledger downloaded for WhatsApp sharing')
  }

  return <div className="settings-page">
    <div className="page-heading"><div><div className="eyebrow">FINANCE <span className="eyebrow-separator">/</span> ACCOUNTING</div><h1>Accounting & reporting</h1><p>Manage the chart of accounts, periods, ledger and financial exports.</p></div><div className="heading-actions"><Button variant="outline" icon={RefreshCw} onClick={() => void load()}>Refresh</Button><Button variant="outline" icon={Download} onClick={() => void exportPortfolioSummary().then(() => toast.success('Portfolio summary exported')).catch((error) => toast.error(error instanceof Error ? error.message : 'Export failed.'))}>Portfolio export</Button></div></div>
    <div className="operations-tabs" role="tablist">{([{ key: 'accounts', label: 'Chart of accounts', icon: BookOpen }, { key: 'periods', label: 'Accounting periods', icon: WalletCards }, { key: 'ledger', label: 'General ledger', icon: BookOpen }, { key: 'trial-balance', label: 'Trial balance', icon: Scale }] as const).map(({ key, label, icon: Icon }) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'operations-tab operations-tab-active' : 'operations-tab'} onClick={() => { setTab(key); setPage(1) }}><Icon size={15} />{label}</button>)}</div>
    {tab === 'accounts' && <Card className="settings-panel"><div className="settings-panel-header"><div><h2>Chart of accounts</h2><p>Active accounts used by balanced journal postings.</p></div></div><form className="settings-form-grid" onSubmit={(event) => void addAccount(event)}><Input aria-label="Account code" placeholder="Account code" value={accountForm.code} onChange={(event) => setAccountForm({ ...accountForm, code: event.target.value })} /><Input aria-label="Account name" placeholder="Account name" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} /><Select aria-label="Account type" value={accountForm.type} onChange={(event) => setAccountForm({ ...accountForm, type: event.target.value })}><option value="asset">Asset</option><option value="liability">Liability</option><option value="equity">Equity</option><option value="income">Income</option><option value="expense">Expense</option></Select><Button type="submit" icon={Plus}>Add account</Button></form><div className="table-scroll"><table className="lf-table"><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Status</th><th>Action</th></tr></thead><tbody>{(accounts.data ?? []).map((account) => <tr key={account._id}><td className="mono-text">{account.code}</td><td>{account.name}</td><td>{account.type}</td><td><StatusBadge status={account.active ? 'Active' : 'Inactive'} /></td><td><Button size="sm" variant="outline" onClick={() => void api.updateChartAccount(account._id, { active: !account.active }).then(() => { toast.success(account.active ? 'Account deactivated' : 'Account activated'); void load() }).catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Account status could not be updated.'))}>{account.active ? 'Deactivate' : 'Activate'}</Button></td></tr>)}</tbody></table></div></Card>}
    {tab === 'periods' && <Card className="settings-panel"><div className="settings-panel-header"><div><h2>Accounting periods</h2><p>Open periods receive financial postings; close them after settlement.</p></div></div><form className="settings-form-grid" onSubmit={(event) => void addPeriod(event)}><Input aria-label="Branch ID" placeholder="Branch ID" value={periodForm.branchId} onChange={(event) => setPeriodForm({ ...periodForm, branchId: event.target.value })} /><Input aria-label="Period start" type="date" value={periodForm.periodStart} onChange={(event) => setPeriodForm({ ...periodForm, periodStart: event.target.value })} /><Input aria-label="Period end" type="date" value={periodForm.periodEnd} onChange={(event) => setPeriodForm({ ...periodForm, periodEnd: event.target.value })} /><Button type="submit" icon={Plus}>Open period</Button></form><div className="table-scroll"><table className="lf-table"><thead><tr><th>Branch</th><th>Start</th><th>End</th><th>Status</th><th>Action</th></tr></thead><tbody>{(periods.data ?? []).map((period) => <tr key={period._id}><td>{period.branchId}</td><td>{period.periodStart.slice(0, 10)}</td><td>{period.periodEnd.slice(0, 10)}</td><td><StatusBadge status={period.status} /></td><td>{period.status === 'open' && <Button size="sm" icon={Check} onClick={() => void closePeriod(period)}>Close period</Button>}</td></tr>)}</tbody></table></div></Card>}
    {tab === 'ledger' && <Card className="settings-panel"><div className="settings-panel-header"><div><h2>General ledger</h2><p>Immutable posted entries with period and account filters.</p></div><div className="heading-actions"><Button variant="outline" icon={Download} onClick={() => void exportLedgerExcel().then(() => toast.success('Ledger exported')).catch((error) => toast.error(error instanceof Error ? error.message : 'Export failed.'))}>Export Excel</Button><Button variant="outline" icon={MessageCircle} onClick={() => void shareLedgerExcel().catch((error) => toast.error(error instanceof Error ? error.message : 'Share failed.'))}>Share via WhatsApp</Button></div></div><div className="table-toolbar"><Input aria-label="Filter ledger account" placeholder="Filter by account code" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /><Select aria-label="Ledger period" value={periodId} onChange={(event) => { setPeriodId(event.target.value); setPage(1) }}><option value="">All periods</option>{(periods.data ?? []).map((period) => <option key={period._id} value={period._id}>{period.periodStart.slice(0, 10)} – {period.periodEnd.slice(0, 10)}</option>)}</Select></div><div className="table-scroll"><table className="lf-table"><thead><tr><th>Posted</th><th>Source</th><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{(ledger.data ?? []).flatMap((entry) => entry.lines.map((line, index) => <tr key={`${entry._id}-${index}`}><td>{entry.postedAt?.slice(0, 10)}</td><td>{entry.sourceType}</td><td className="mono-text">{line.account}</td><td>{money(line.debitMinor ?? 0)}</td><td>{money(line.creditMinor ?? 0)}</td></tr>))}</tbody></table></div></Card>}
    {tab === 'trial-balance' && <Card className="settings-panel"><div className="settings-panel-header"><div><h2>Trial balance</h2><p>Debit and credit totals by account.</p></div></div><div className="table-scroll"><table className="lf-table"><thead><tr><th>Account</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>{trial.map((row) => <tr key={row.account}><td className="mono-text">{row.account}</td><td>{money(row.debitMinor)}</td><td>{money(row.creditMinor)}</td><td>{money(row.balanceMinor)}</td></tr>)}</tbody></table></div></Card>}
    {tab !== 'trial-balance' && <div className="table-pagination"><span>Showing <strong>{rows.length}</strong> of <strong>{meta.total}</strong></span><div className="pagination-buttons"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>‹</button><span>{page} / {meta.pageCount}</span><button disabled={page >= meta.pageCount} onClick={() => setPage((value) => value + 1)}>›</button></div></div>}
    {loading && <div className="page-loading">Loading accounting records…</div>}
  </div>
}
