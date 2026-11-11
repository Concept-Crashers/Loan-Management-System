import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { Activity, ArrowDownToLine, ArrowRight, Banknote, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, FileBarChart2, MessageCircle, Printer, Users, WalletCards } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Input, Select } from '../../components/ui/primitives'
import { shareBlob } from '../../lib/api'
import { api } from '../../lib/services'
import { formatUGX } from '../../lib/format'
import type { Application, CollectionRecord, Customer, LoanAccount, Repayment, Transaction } from '../../lib/types'
import { exportReportExcel, exportReportPDF, type OrgInfo } from '../../lib/exportDocs'
import type { RootState } from '../../store/store'

export function ReportsPage() {
  const branding = useSelector((state: RootState) => state.branding)
  const [loans, setLoans] = useState<LoanAccount[]>([])
  const [repayments, setRepayments] = useState<Repayment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [collections, setCollections] = useState<CollectionRecord[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  const [selected, setSelected] = useState('portfolio')
  const [productFilter, setProductFilter] = useState('All products')
    const [statusFilter, setStatusFilter] = useState('All statuses')
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [exporting, setExporting] = useState(false)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [loanRes, repayRes, custRes, appRes, collRes, txnRes] = await Promise.all([
          api.listLoans().catch(() => []),
          api.listRepayments().catch(() => []),
          api.listCustomers().catch(() => []),
          api.listApplications().catch(() => []),
          api.listCollections().catch(() => []),
          api.listTransactions().catch(() => []),
        ])
        setLoans(loanRes)
        setRepayments(repayRes)
        setCustomers(custRes)
        setApplications(appRes)
        setCollections(collRes)
        setTransactions(txnRes)
      } finally {
        setLoading(false)
      }
    }
    void loadData()
  }, [])

  const options = useMemo(() => [
    {
      key: 'portfolio',
      label: 'Loan portfolio',
      description: 'Payment due balances (total repayable minus confirmed paid, including interest) and account status across loans.',

      icon: WalletCards,
      count: loans.length,
      data: () => loans.map(({ ref, customer, product, principal, outstanding, status, maturity }) => ({
        loan_reference: ref, customer, product, principal_ugx: principal, outstanding_ugx: outstanding, status, maturity_date: maturity
      })),
    },
    {
      key: 'disbursements',
      label: 'Disbursement report',
      description: 'Loans issued within the selected reporting period.',
      icon: ArrowDownToLine,
      count: loans.filter((item) => (item.disbursed || 0) > 0).length,
      dateKey: 'disbursed_on',
      data: () => loans.filter((item) => (item.disbursed || 0) > 0).map(({ ref, customer, product, disbursed, start, status }) => ({
        loan_reference: ref, customer, product, amount_ugx: disbursed, disbursed_on: start, status
      })),
    },
    {
      key: 'repayments',
      label: 'Repayment report',
      description: 'Recorded receipts and payment channels.',
      icon: Banknote,
      count: repayments.length,
      dateKey: 'date',
      data: () => repayments.map(({ id, customer, loan, amount, method, date, receivedBy, status }) => ({
        receipt_number: id, customer, loan_reference: loan, amount_ugx: amount, payment_method: method, date, received_by: receivedBy, status
      })),
    },
    {
      key: 'outstanding',
      label: 'Loans with payment due',

      description: 'Remaining balances by borrower and loan product.',
      icon: ChartNoAxesCombined,
      count: loans.filter((item) => (item.outstanding || 0) > 0).length,
      data: () => loans.filter((item) => (item.outstanding || 0) > 0).map(({ ref, customer, product, principal, paid, outstanding, nextDue, status }) => ({
        loan_reference: ref, customer, product, principal_ugx: principal, paid_ugx: paid, outstanding_ugx: outstanding, next_due: nextDue, status
      })),
    },
    {
      key: 'overdue',
      label: 'Overdue loans',
      description: 'Delinquent accounts requiring follow-up.',
      icon: Activity,
      count: loans.filter((item) => item.status === 'Overdue').length,
      data: () => loans.filter((item) => item.status === 'Overdue').map(({ ref, customer, product, outstanding, nextDue, status }) => ({
        loan_reference: ref, customer, product, outstanding_ugx: outstanding, due_date: nextDue, status
      })),
    },
    {
      key: 'customers',
      label: 'Customer report',
      description: 'Borrower directory and registration details.',
      icon: Users,
      count: customers.length,
      dateKey: 'registered',
      data: () => customers.map(({ id, name, district, town, loans: loanCount, status, registered }) => ({
        customer_id: id, name, district, town, loans: loanCount, status, registered
      })),
    },
    {
      key: 'collections',
      label: 'Collection report',
      description: 'Follow-up activity and contact status.',
      icon: BriefcaseBusiness,
      count: collections.length,
      dateKey: 'follow_up',
      data: () => collections.map(({ id, customer, loan, outstanding, overdue, followUp, officer, status }) => ({
        collection_id: id, customer, loan_reference: loan, outstanding_ugx: outstanding, overdue_ugx: overdue, follow_up: followUp, assigned_officer: officer, status
      })),
    },
    {
      key: 'transactions',
      label: 'Financial transactions',
      description: 'Financial transactions recorded in the general ledger.',
      icon: FileBarChart2,
      count: transactions.length,
      dateKey: 'date',
      data: () => transactions.map(({ id, type, reference, customer, amount, method, date, status }) => ({
        transaction_id: id, type, reference, account: customer, amount_ugx: amount, channel: method, date, status
      })),
    },
    {
      key: 'applications',
      label: 'Loan applications',
      description: 'Applications and review queue records.',
      icon: BriefcaseBusiness,
      count: applications.length,
      dateKey: 'submitted',
      data: () => applications.map(({ id, customer, product, amount, officer, status, submitted }) => ({
        application: id, customer, product, requested_ugx: amount, loan_officer: officer, status, submitted
      })),
    },
  ], [loans, repayments, customers, applications, collections, transactions])

  const report = options.find((item) => item.key === selected) ?? options[0]
  const sourceRows = report.data()
  const statusChoices = useMemo(() => ['All statuses', ...new Set(sourceRows.map((row) => String(row.status ?? '')).filter(Boolean))], [sourceRows])
  const productChoices = useMemo(() => ['All products', ...new Set(loans.map((l) => l.product).filter(Boolean))], [loans])

  const rows = useMemo(() => sourceRows.filter((row) => {
    if (productFilter !== 'All products' && (row as Record<string, unknown>).product && (row as Record<string, unknown>).product !== productFilter) return false
    if (statusFilter !== 'All statuses' && row.status && row.status !== statusFilter) return false
    const reportDate = report.dateKey ? String((row as Record<string, unknown>)[report.dateKey] ?? '') : ''
    if (reportDate && /^\d{4}-\d{2}-\d{2}$/.test(reportDate) && (reportDate < fromDate || reportDate > toDate)) return false
    return true
  }), [sourceRows, productFilter, statusFilter, report.dateKey, fromDate, toDate])

  const totalDisbursed = useMemo(() => loans.reduce((sum, loan) => sum + (loan.disbursed || 0), 0), [loans])
  const totalRepayments = useMemo(() => repayments.reduce((sum, payment) => sum + (payment.amount || 0), 0), [repayments])
  const totalOutstanding = useMemo(() => loans.reduce((sum, loan) => sum + (loan.outstanding || 0), 0), [loans])
  const overdueLoans = useMemo(() => loans.filter((l) => l.status === 'Overdue'), [loans])
  const parRate = totalOutstanding > 0 ? ((overdueLoans.reduce((sum, l) => sum + (l.outstanding || 0), 0) / totalOutstanding) * 100).toFixed(1) : '0.0'

  const org: OrgInfo = { companyName: branding.companyName || 'Trust Loans', tagline: branding.tagline || 'Loan operations', country: branding.country || 'Uganda', currency: branding.currency || 'UGX', logoDataUrl: branding.logoDataUrl || null, signatureDataUrl: branding.signatureDataUrl || null }
  const reportOptions = {
    reportLabel: report.label,
    reportKey: report.key,
    rows,
    fromDate,
    toDate,
    org,
    summary: { totalDisbursed, totalRepayments, totalOutstanding, parRate },
  }

  async function downloadExcel() {
    if (!rows.length) { toast.info('There are no rows to export for the selected filters.'); return }
    setExporting(true)
    try {
      await exportReportExcel(reportOptions)
      toast.success('Excel report downloaded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
  }
  async function shareExcel() {
    if (!rows.length) { toast.info('There are no rows to share for the selected filters.'); return }
    setSharing(true)
    try {
      const blob = await exportReportExcel({ ...reportOptions, save: false })
      if (!(blob instanceof Blob)) throw new Error('Report file could not be prepared for sharing.')
      const result = await shareBlob(blob, `${report.key}-report.xlsx`, `${report.label} report`, `${report.label} report export from ${org.companyName}.`)
      if (result !== 'cancelled') toast.success(result === 'shared' ? 'Report shared' : 'Report downloaded for WhatsApp sharing')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Share failed.')
    } finally {
      setSharing(false)
    }
  }
  async function printPdfReport() {
    if (!rows.length) { toast.info('There are no rows to print for the selected filters.'); return }
    setExporting(true)
    try {
      await exportReportPDF(reportOptions)
      toast.success('Print-ready PDF downloaded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'PDF report could not be generated.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="reports-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MANAGEMENT <span className="eyebrow-separator">/</span> ANALYTICS</div>
          <h1>Reports & insights</h1>
          <p>Portfolio data and financial exports from the live database.</p>
        </div>
        <div className="heading-actions">
          <button className="button-print" disabled={exporting || sharing} onClick={() => void printPdfReport()}><Printer size={15} /> Print / PDF</button>
          <Button loading={exporting} disabled={sharing} icon={ArrowDownToLine} onClick={() => void downloadExcel()}>Export Excel</Button>
          <Button variant="outline" loading={sharing} disabled={exporting} icon={MessageCircle} onClick={() => void shareExcel()}>Share via WhatsApp</Button>
        </div>
      </div>

      <div className="report-filters">
        <label className="report-date-control">
          <span>From</span>
          <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Report start date" />
        </label>
        <label className="report-date-control">
          <span>To</span>
          <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Report end date" />
        </label>
        {productChoices.length > 1 && (
          <Select value={productFilter} onChange={(event) => setProductFilter(event.target.value)} aria-label="Filter by product">
            {productChoices.map((choice) => <option key={choice}>{choice}</option>)}
          </Select>
        )}
        <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
          {statusChoices.map((status) => <option key={status}>{status}</option>)}
        </Select>
        <span className="report-filter-note">{loading ? 'Loading…' : `${rows.length} rows`}</span>
      </div>

      <div className="report-overview-grid">
        <Card className="report-kpi">
          <span className="report-kpi-label">Total disbursed</span>
          <strong>{formatUGX(totalDisbursed)}</strong>
          <span className="report-kpi-neutral">{loans.length} total loan accounts</span>
        </Card>
        <Card className="report-kpi">
          <span className="report-kpi-label">Repayments collected</span>
          <strong>{formatUGX(totalRepayments)}</strong>
          <span className="report-kpi-neutral">{repayments.length} confirmed receipts</span>
        </Card>
        <Card className="report-kpi">
          <span className="report-kpi-label">Active portfolio</span>
          <strong>{formatUGX(totalOutstanding)}</strong>
          <span className="report-kpi-neutral">{loans.filter((l) => l.status === 'Active').length} active loans</span>
        </Card>
        <Card className="report-kpi">
          <span className="report-kpi-label">Portfolio at risk (PAR)</span>
          <strong>{parRate}%</strong>
          <span className={overdueLoans.length > 0 ? 'report-kpi-warning' : 'report-kpi-neutral'}>
            {overdueLoans.length} loan{overdueLoans.length === 1 ? '' : 's'} in arrears
          </span>
        </Card>
      </div>

      <div className="report-catalog-header">
        <div>
          <h2>Available reports</h2>
          <p>Select a report category to inspect and export filtered records.</p>
        </div>
      </div>

      <div className="report-catalog">
        {options.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              className={`report-tile ${selected === item.key ? 'report-tile-selected' : ''}`}
              onClick={() => { setSelected(item.key); setStatusFilter('All statuses') }}
            >
              <span className="report-tile-icon"><Icon size={18} /></span>
              <span className="report-tile-copy">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
              <span className="report-tile-count">{item.count}</span>
              <ArrowRight size={15} />
            </button>
          )
        })}
      </div>

      <Card className="report-preview">
        <div className="card-section-header">
          <div>
            <h2>{report.label}</h2>
            <p>{report.description}</p>
          </div>
          <button className="text-link" disabled={exporting || sharing || rows.length === 0} onClick={() => void downloadExcel()}>
            {exporting ? 'Preparing…' : 'Download .xlsx'} <ArrowRight size={14} />
          </button>
          <button className="text-link" disabled={exporting || sharing || rows.length === 0} onClick={() => void shareExcel()}>
            {sharing ? 'Preparing…' : 'Share via WhatsApp'}
          </button>
        </div>
        <div className="report-preview-table">
          {rows.length ? (
            <table className="lf-table">
              <thead>
                <tr>
                  {Object.keys(rows[0]).slice(0, 7).map((key) => <th key={key}>{key.replaceAll('_', ' ')}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((row, index) => (
                  <tr key={index}>
                    {Object.values(row).slice(0, 7).map((value, col) => (
                      <td key={col}>
                        {typeof value === 'number' && String(Object.keys(row)[col]).includes('ugx') ? formatUGX(value) : String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="table-empty">
              <span><CalendarDays size={19} /></span>
              <strong>No report records found</strong>
              <p>No records match the current filters or no data is recorded in this category yet.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
