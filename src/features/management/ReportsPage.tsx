import { useMemo, useState } from 'react'
import { Activity, ArrowDownToLine, ArrowRight, Banknote, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, FileBarChart2, Printer, Users, WalletCards } from 'lucide-react'
import { toast } from 'sonner'
import { Card, Input, Select } from '../../components/ui/primitives'
import { applications, collections, customers, loans, repayments, transactions } from '../../data/mock-data'

type ReportRow = Record<string, string | number>
type ReportOption = { key: string; label: string; description: string; icon: typeof WalletCards; count: number; dateKey?: string; data: () => ReportRow[] }

function sampleBranch(customer: string) {
  if (/david|grace/i.test(customer)) return 'Entebbe'
  if (/brian|josephine/i.test(customer)) return 'Gulu'
  if (/sarah|patrick/i.test(customer)) return 'Mbarara'
  return 'Kampala Central'
}
function loanProduct(ref: string) { return loans.find((item) => item.ref === ref)?.product ?? 'Not linked' }

const options: ReportOption[] = [
  { key: 'portfolio', label: 'Loan portfolio', description: 'Outstanding balances and account status across active loans.', icon: WalletCards, count: loans.length, data: () => loans.map(({ ref, customer, product, principal, outstanding, status, maturity }) => ({ loan_reference: ref, customer, product, principal_ugx: principal, outstanding_ugx: outstanding, status, branch: sampleBranch(customer), maturity_date: maturity })) },
  { key: 'disbursements', label: 'Disbursement report', description: 'Loans issued within the selected reporting period.', icon: ArrowDownToLine, count: loans.filter((item) => item.disbursed > 0).length, dateKey: 'disbursed_on', data: () => loans.filter((item) => item.disbursed > 0).map(({ ref, customer, product, disbursed, start, status }) => ({ loan_reference: ref, customer, product, amount_ugx: disbursed, disbursed_on: start, status, branch: sampleBranch(customer) })) },
  { key: 'repayments', label: 'Repayment report', description: 'Recorded receipts and payment channels.', icon: Banknote, count: repayments.length, dateKey: 'date', data: () => repayments.map(({ id, customer, loan, amount, method, date, receivedBy, status }) => ({ receipt_number: id, customer, loan_reference: loan, product: loanProduct(loan), amount_ugx: amount, payment_method: method, date, received_by: receivedBy, status, branch: sampleBranch(customer) })) },
  { key: 'outstanding', label: 'Outstanding loans', description: 'Remaining balances by borrower and loan product.', icon: ChartNoAxesCombined, count: loans.filter((item) => item.outstanding > 0).length, data: () => loans.filter((item) => item.outstanding > 0).map(({ ref, customer, product, principal, paid, outstanding, nextDue, status }) => ({ loan_reference: ref, customer, product, principal_ugx: principal, paid_ugx: paid, outstanding_ugx: outstanding, next_due: nextDue, status, branch: sampleBranch(customer) })) },
  { key: 'overdue', label: 'Overdue loans', description: 'Accounts requiring timely, respectful follow-up.', icon: Activity, count: loans.filter((item) => item.status === 'Overdue').length, data: () => loans.filter((item) => item.status === 'Overdue').map(({ ref, customer, product, outstanding, nextDue, status }) => ({ loan_reference: ref, customer, product, outstanding_ugx: outstanding, due_date: nextDue, status, branch: sampleBranch(customer) })) },
  { key: 'customers', label: 'Customer report', description: 'Borrower directory and registration details.', icon: Users, count: customers.length, dateKey: 'registered', data: () => customers.map(({ id, name, district, town, loans: loanCount, status, registered }) => ({ customer_id: id, name, district, town, loans: loanCount, status, registered, branch: sampleBranch(name) })) },
  { key: 'collections', label: 'Collection report', description: 'Follow-up activity and contact status.', icon: BriefcaseBusiness, count: collections.length, dateKey: 'follow_up', data: () => collections.map(({ id, customer, loan, outstanding, overdue, followUp, officer, status }) => ({ collection_id: id, customer, loan_reference: loan, product: loanProduct(loan), outstanding_ugx: outstanding, overdue_ugx: overdue, follow_up: followUp, assigned_officer: officer, status, branch: sampleBranch(customer) })) },
  { key: 'cash', label: 'Cash transaction report', description: 'Financial transactions recorded by channel.', icon: FileBarChart2, count: transactions.length, dateKey: 'date', data: () => transactions.map(({ id, type, reference, customer, amount, method, date, status }) => ({ transaction_id: id, type, reference, customer, product: reference.startsWith('LN-') ? loanProduct(reference) : 'Not linked', amount_ugx: amount, channel: method, date, status, branch: sampleBranch(customer) })) },
  { key: 'officers', label: 'Loan officer report', description: 'Applications and portfolio activity by loan officer.', icon: BriefcaseBusiness, count: applications.length, dateKey: 'submitted', data: () => applications.map(({ id, customer, product, amount, officer, status, submitted }) => ({ application: id, customer, product, requested_ugx: amount, loan_officer: officer, status, submitted, branch: sampleBranch(customer) })) },
]
const trend = [
  { month: 'May', disbursed: 18, collected: 12 }, { month: 'Jun', disbursed: 22, collected: 15 }, { month: 'Jul', disbursed: 17, collected: 14 },
  { month: 'Aug', disbursed: 29, collected: 19 }, { month: 'Sep', disbursed: 25, collected: 18 }, { month: 'Oct', disbursed: 34, collected: 24 }, { month: 'Nov', disbursed: 30, collected: 21 },
]
const productChoices = ['All products', 'Business Growth', 'Salary Advance', 'Emergency Assist', 'Group Enterprise']
const branchChoices = ['All branches', 'Kampala Central', 'Entebbe', 'Gulu', 'Mbarara']

export function ReportsPage() {
  const [selected, setSelected] = useState(options[0].key)
  const [productFilter, setProductFilter] = useState('All products')
  const [branchFilter, setBranchFilter] = useState('All branches')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [fromDate, setFromDate] = useState('2026-10-01')
  const [toDate, setToDate] = useState('2026-11-04')
  const report = options.find((item) => item.key === selected) ?? options[0]
  const sourceRows = report.data()
  const statusChoices = [...new Set(sourceRows.map((row) => String(row.status ?? '')).filter(Boolean))]
  const rows = useMemo(() => sourceRows.filter((row) => {
    if (productFilter !== 'All products' && row.product && row.product !== productFilter) return false
    if (branchFilter !== 'All branches' && row.branch && row.branch !== branchFilter) return false
    if (statusFilter !== 'All statuses' && row.status && row.status !== statusFilter) return false
    const reportDate = report.dateKey ? String(row[report.dateKey] ?? '') : ''
    if (reportDate && /^\d{4}-\d{2}-\d{2}$/.test(reportDate) && (reportDate < fromDate || reportDate > toDate)) return false
    return true
  }), [sourceRows, productFilter, branchFilter, statusFilter, report.dateKey, fromDate, toDate])

  async function downloadExcel() {
    if (!rows.length) { toast.info('There are no rows to export for the selected filters.'); return }
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(workbook, sheet, report.label.slice(0, 31))
    XLSX.writeFile(workbook, `${report.key}-demo-report.xlsx`)
    toast.success('Demo Excel report downloaded', { description: 'Replace sample records with verified API results before operational use.' })
  }

  return <div className="reports-page"><div className="page-heading"><div><div className="eyebrow">MANAGEMENT <span className="eyebrow-separator">/</span> ANALYTICS</div><h1>Reports & insights</h1><p>Explore a clear view of lending activity across your portfolio.</p></div><div className="heading-actions"><button className="button-print" onClick={() => window.print()}><Printer size={15} /> Print / PDF</button><button className="lf-button lf-button-primary lf-button-md" onClick={() => void downloadExcel()}><ArrowDownToLine size={16} /> Export Excel</button></div></div>
    <div className="report-filters"><label className="report-date-control"><span>From</span><Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Report start date" /></label><label className="report-date-control"><span>To</span><Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Report end date" /></label><Select value={productFilter} onChange={(event) => setProductFilter(event.target.value)} aria-label="Filter by product">{productChoices.map((choice) => <option key={choice}>{choice}</option>)}</Select><Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status"><option>All statuses</option>{statusChoices.map((status) => <option key={status}>{status}</option>)}</Select><Select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} aria-label="Filter by branch">{branchChoices.map((branch) => <option key={branch}>{branch}</option>)}</Select><span className="report-filter-note">{rows.length} rows</span></div>
    <div className="report-overview-grid"><Card className="report-kpi"><span className="report-kpi-label">Total disbursed</span><strong>UGX 246.8m</strong><span className="report-kpi-up">↑ 12.8% vs. previous period</span></Card><Card className="report-kpi"><span className="report-kpi-label">Repayments collected</span><strong>UGX 118.4m</strong><span className="report-kpi-up">↑ 6.1% vs. previous period</span></Card><Card className="report-kpi"><span className="report-kpi-label">Active portfolio</span><strong>UGX 1.28B</strong><span className="report-kpi-neutral">1,238 active accounts</span></Card><Card className="report-kpi"><span className="report-kpi-label">Portfolio at risk</span><strong>4.8%</strong><span className="report-kpi-warning">11 loans need review</span></Card></div>
    <Card className="report-chart-card"><div className="card-section-header"><div><h2>Disbursement & collections</h2><p>Monthly movement · UGX millions · demo trend</p></div><div className="chart-legend report-legend"><span><i className="legend-dot legend-disbursement" /> Disbursed</span><span><i className="legend-dot legend-repayment" /> Collected</span></div></div><div className="report-chart">{trend.map((item) => <div className="report-bar-group" key={item.month}><div className="report-bars"><span className="bar-disbursed" style={{ height: `${item.disbursed * 2.3}px` }} /><span className="bar-collected" style={{ height: `${item.collected * 2.3}px` }} /></div><span>{item.month}</span></div>)}</div></Card>
    <div className="report-catalog-header"><div><h2>Available reports</h2><p>Choose a report to preview and export its filtered demo data.</p></div></div><div className="report-catalog">{options.map((item) => { const Icon = item.icon; return <button key={item.key} className={`report-tile ${selected === item.key ? 'report-tile-selected' : ''}`} onClick={() => { setSelected(item.key); setStatusFilter('All statuses') }}><span className="report-tile-icon"><Icon size={18} /></span><span className="report-tile-copy"><strong>{item.label}</strong><small>{item.description}</small></span><span className="report-tile-count">{item.count}</span><ArrowRight size={15} /></button> })}</div>
    <Card className="report-preview"><div className="card-section-header"><div><h2>{report.label}</h2><p>{report.description} <span className="demo-label">Demo data</span></p></div><button className="text-link" onClick={() => void downloadExcel()}>Download .xlsx <ArrowRight size={14} /></button></div><div className="report-preview-table">{rows.length ? <table className="lf-table"><thead><tr>{Object.keys(rows[0]).slice(0, 7).map((key) => <th key={key}>{key.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{rows.slice(0, 7).map((row, index) => <tr key={index}>{Object.values(row).slice(0, 7).map((value, col) => <td key={col}>{String(value)}</td>)}</tr>)}</tbody></table> : <div className="table-empty"><span><CalendarDays size={19} /></span><strong>No report rows match</strong><p>Try widening the reporting period or clearing a filter.</p></div>}</div></Card>
    <div className="data-footnote">Filters apply where the selected report includes the requested field. Report figures are illustrative sample data; connect reporting APIs before operational or financial use.</div>
  </div>
}
