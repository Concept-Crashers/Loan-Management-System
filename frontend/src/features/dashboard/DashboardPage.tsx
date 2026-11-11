import { useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Banknote, CalendarClock, ChevronRight, CircleAlert, TrendingUp, Users, Wallet, ArrowRight, FilePlus2, ContactRound, ReceiptText, ListFilter } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { Card, Button, StatusBadge, Select } from '../../components/ui/primitives'
import { formatDate, formatUGX } from '../../lib/format'
import { exportReportPDF, type OrgInfo } from '../../lib/exportDocs'
import { api } from '../../lib/services'
import type { Application, Customer, LoanAccount, Repayment, ScheduleInstallment } from '../../lib/types'
import type { RootState } from '../../store/store'

function MetricCard({ label, value, change, icon: Icon, color, hint }: { label: string; value: string; change: string; icon: typeof Users; color: string; hint: string }) {
  return (
    <Card className="metric-card">
      <div className="metric-top">
        <span className={`metric-icon ${color}`}><Icon size={18} strokeWidth={1.9} /></span>
        <span className="metric-change"><ArrowUpRight size={13} /> {change}</span>
      </div>
      <p className="metric-label">{label}</p>
      <div className="metric-value">{value}</div>
      <span className="metric-hint">{hint}</span>
    </Card>
  )
}

export function DashboardPage() {
  const [period, setPeriod] = useState('Last 7 months')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loans, setLoans] = useState<LoanAccount[]>([])
  const [repayments, setRepayments] = useState<Repayment[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [schedules, setSchedules] = useState<ScheduleInstallment[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const user = useSelector((state: RootState) => state.session.user)
  const branding = useSelector((state: RootState) => state.branding)
  const userDisplayName = user?.name?.trim() || 'Team'

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [custRes, loanRes, repayRes, appRes, schedRes] = await Promise.all([
          api.listCustomers().catch(() => []),
          api.listLoans().catch(() => []),
          api.listRepayments().catch(() => []),
          api.listApplications().catch(() => []),
          api.listSchedules().catch(() => []),
        ])
        setCustomers(custRes)
        setLoans(loanRes)
        setRepayments(repayRes)
        setApplications(appRes)
        setSchedules(schedRes)
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Dashboard data could not be loaded.')
      } finally {
      }
    }
    void loadDashboard()
  }, [])

  const totalOutstanding = useMemo(() => loans.reduce((sum, loan) => sum + (loan.outstanding || 0), 0), [loans])

  const totalDisbursed = useMemo(() => loans.reduce((sum, loan) => sum + (loan.disbursed || 0), 0), [loans])
  const totalRepayments = useMemo(() => repayments.reduce((sum, payment) => sum + (payment.amount || 0), 0), [repayments])
  const overdueCount = useMemo(() => loans.filter((loan) => loan.status === 'Overdue').length, [loans])
  const activeCount = useMemo(() => loans.filter((loan) => loan.status === 'Active').length, [loans])
  const pendingApplicationCount = useMemo(() => applications.filter((item) => ['submitted', 'under review', 'assessment required', 'approval pending'].includes(String(item.status).toLowerCase())).length, [applications])
  const org: OrgInfo = { companyName: branding.companyName || 'Trust Loans', tagline: branding.tagline || 'Loan operations', country: branding.country || 'Uganda', currency: branding.currency || 'UGX', logoDataUrl: branding.logoDataUrl || null, signatureDataUrl: branding.signatureDataUrl || null }

  async function exportOverviewPDF() {
    try {
      const today = new Date().toISOString().slice(0, 10)
      await exportReportPDF({
        reportLabel: 'Portfolio overview',
        rows: loans.map(({ ref, customer, product, principal, outstanding, status, maturity }) => ({
          loan_reference: ref, customer, product, principal_ugx: principal, outstanding_ugx: outstanding, status, maturity_date: maturity,
        })),
        fromDate: today,
        toDate: today,
        org,
        summary: {
          totalDisbursed,
          totalRepayments,
          totalOutstanding,
          parRate: totalOutstanding > 0
            ? ((loans.filter((loan) => loan.status === 'Overdue').reduce((sum, loan) => sum + loan.outstanding, 0) / totalOutstanding) * 100).toFixed(1)
            : '0.0',
        },
      })
      toast.success('Print-ready portfolio PDF downloaded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Portfolio PDF could not be generated.')
    }
  }

  const recentTransactions = repayments.slice(0, 4)
  const upcoming = schedules.filter((item) => item.status !== 'Paid').slice(0, 4)

  const portfolioData = useMemo(() => {
    if (!loans.length) return []
    const byProduct: Record<string, number> = {}
    for (const loan of loans) {
      const name = loan.product || 'Other'
      byProduct[name] = (byProduct[name] || 0) + (loan.principal || 0)
    }
    const colors = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899']
    return Object.entries(byProduct).map(([name, value], i) => ({
      name,
      value: totalDisbursed > 0 ? Math.round((value / totalDisbursed) * 100) : 0,
      color: colors[i % colors.length],
    }))
  }, [loans, totalDisbursed])

  const todayStr = useMemo(() => {
    return new Date().toLocaleDateString('en-UG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).toUpperCase()
  }, [])

  return (
    <div className="dashboard-page">
      {loadError && <div className="form-error" role="alert">{loadError}</div>}
      <div className="page-heading dashboard-heading">
        <div>
          <div className="eyebrow"><span className="live-spark" /> {todayStr}</div>
          <h1>Hello, {userDisplayName} <span className="wave">✳</span></h1>
        </div>
        <div className="heading-actions">
          <Button variant="outline" icon={ListFilter} onClick={() => void exportOverviewPDF()}>Export overview</Button>
        </div>
      </div>

      <section className="welcome-banner">
        <div>
          <span className="welcome-banner-kicker">LENDFLOW OPERATIONS</span>
          <h2>Clear lending operations and portfolio management.</h2>
          <p>Track loan disbursements, manage borrower applications, and record repayments directly into your database.</p>
        </div>
        <Link to="/applications/new" className="welcome-banner-action">
          Start an application <ArrowRight size={15} />
        </Link>
      </section>

      <div className="metrics-grid">
        <MetricCard label="Total customers" value={String(customers.length)} change="Verified" icon={Users} color="blue" hint="Registered in database" />
        <MetricCard label="Total disbursed" value={formatUGX(totalDisbursed, true)} change="Active" icon={ArrowDownLeft} color="green" hint="Total loan releases" />
        <MetricCard label="Payment due" value={formatUGX(totalOutstanding, true)} change="Portfolio" icon={Wallet} color="violet" hint="Total repayable minus confirmed paid (includes interest)" />

        <MetricCard label="Repayments collected" value={formatUGX(totalRepayments, true)} change="Settled" icon={Banknote} color="amber" hint="Recorded payments" />
      </div>

      <div className="dashboard-secondary-stats">
        <Card className="secondary-stat-card">
          <span className="secondary-stat-icon blue"><TrendingUp size={15} /></span>
          <span><small>Total loans issued</small><strong>{loans.length}</strong><em>accounts</em></span>
        </Card>
        <Card className="secondary-stat-card">
          <span className="secondary-stat-icon violet"><FilePlus2 size={15} /></span>
          <span><small>Pending applications</small><strong>{pendingApplicationCount}</strong><em>awaiting review</em></span>
        </Card>
        <Card className="secondary-stat-card">
          <span className="secondary-stat-icon green"><Users size={15} /></span>
          <span><small>Active loans</small><strong>{activeCount}</strong><em>disbursed accounts</em></span>
        </Card>
        <Card className="secondary-stat-card">
          <span className="secondary-stat-icon amber"><CircleAlert size={15} /></span>
          <span><small>Overdue loans</small><strong>{overdueCount}</strong><em>needs collection</em></span>
        </Card>
      </div>

      {overdueCount > 0 && (
        <div className="alert-strip">
          <span className="alert-icon"><CircleAlert size={16} /></span>
          <span><strong>{overdueCount} loan{overdueCount === 1 ? '' : 's'} need attention.</strong> Review overdue installments and record follow-ups.</span>
          <Link to="/collections">Open collections <ArrowRight size={14} /></Link>
        </div>
      )}

      <section className="dashboard-charts-grid">
        <Card className="chart-card trend-card">
          <div className="chart-card-header">
            <div>
              <h2>Portfolio movement</h2>
              <p>Disbursements and repayments overview</p>
            </div>
            <Select className="period-select" value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option>Year to date</option>
              <option>Last 30 days</option>
            </Select>
          </div>
          <div className="chart-legend">
            <span><i className="legend-dot legend-disbursement" /> Total Disbursed <strong>{formatUGX(totalDisbursed)}</strong></span>
            <span><i className="legend-dot legend-repayment" /> Total Repaid <strong>{formatUGX(totalRepayments)}</strong></span>
          </div>
          {loans.length === 0 ? (
            <div className="table-empty" style={{ padding: '40px 20px' }}>
              <strong>No portfolio activity yet</strong>
              <p>Disbursements and repayment metrics will appear once loan accounts are created.</p>
            </div>
          ) : (
            <div className="chart-area" role="img" aria-label="Portfolio movement">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[{ month: 'Portfolio', disbursed: totalDisbursed / 1000000, repayments: totalRepayments / 1000000 }]} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#edf0f5" strokeDasharray="3 4" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#919cad', fontSize: 11 }} dy={9} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#919cad', fontSize: 10 }} tickFormatter={(value) => `${value}m`} />
                  <Tooltip formatter={(value) => [`UGX ${value}m`]} contentStyle={{ border: '1px solid #e8ecf2', borderRadius: 10, fontSize: 12 }} />
                  <Area type="monotone" dataKey="disbursed" stroke="#4379ef" strokeWidth={2.4} fill="#4278ec22" activeDot={{ r: 4 }} />
                  <Area type="monotone" dataKey="repayments" stroke="#38b68f" strokeWidth={2.4} fill="#3fb99722" activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="chart-card portfolio-card">
          <div className="chart-card-header">
            <div>
              <h2>Loan portfolio</h2>
              <p>Active principal breakdown</p>
            </div>
            <Link to="/loans" className="icon-link" aria-label="Portfolio details"><ChevronRight size={18} /></Link>
          </div>
          {portfolioData.length === 0 ? (
            <div className="table-empty" style={{ padding: '40px 20px' }}>
              <strong>No active loans</strong>
              <p>Portfolio distribution will display as loans are approved and disbursed.</p>
            </div>
          ) : (
            <>
              <div className="portfolio-donut" role="img" aria-label="Loan portfolio share">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={portfolioData} innerRadius={65} outerRadius={84} paddingAngle={4} dataKey="value" stroke="none" cornerRadius={5}>
                      {portfolioData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value}%`, 'Portfolio share']} contentStyle={{ border: '1px solid #e8ecf2', borderRadius: 10, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <strong>{formatUGX(totalOutstanding, true)}</strong>
                  <span>active balance</span>
                </div>
              </div>
              <div className="portfolio-legend">
                {portfolioData.map((item) => (
                  <div key={item.name}>
                    <span className="portfolio-name"><i style={{ backgroundColor: item.color }} />{item.name}</span>
                    <strong>{item.value}%</strong>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="portfolio-status-breakdown">
            <span>Loan status distribution</span>
            <div>
              <StatusBadge status="Active" /><strong>{activeCount}</strong>
              <StatusBadge status="Overdue" /><strong>{overdueCount}</strong>
              <StatusBadge status="Fully Paid" /><strong>{loans.filter((loan) => loan.status === 'Fully Paid').length}</strong>
            </div>
          </div>
        </Card>
      </section>

      <section className="dashboard-lower-grid">
        <Card className="table-card">
          <div className="card-section-header">
            <div>
              <h2>Recent repayments</h2>
              <p>Latest recorded collections</p>
            </div>
            <Link to="/repayments" className="text-link">View all <ArrowRight size={14} /></Link>
          </div>
          {recentTransactions.length === 0 ? (
            <div className="table-empty">
              <strong>No repayments recorded</strong>
              <p>When borrowers make payments, they will be listed here.</p>
            </div>
          ) : (
            <div className="transaction-list">
              {recentTransactions.map((payment) => (
                <Link to={`/repayments/${payment.id}`} className="transaction-row" key={payment.id}>
                  <span className="transaction-method-icon"><ArrowDownLeft size={16} /></span>
                  <span className="transaction-main">
                    <strong>{payment.customer || 'Borrower'}</strong>
                    <small>{payment.id} <span>·</span> {payment.method}</small>
                  </span>
                  <span className="transaction-amount">{formatUGX(payment.amount)}</span>
                  <span className="transaction-date">{formatDate(payment.date, 'dd MMM')}</span>
                  <StatusBadge status={payment.status} />
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="table-card upcoming-card">
          <div className="card-section-header">
            <div>
              <h2>Upcoming repayments</h2>
              <p>Upcoming scheduled installments</p>
            </div>
            <Link to="/schedules" className="text-link">View schedule <ArrowRight size={14} /></Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="table-empty">
              <strong>No upcoming schedules</strong>
              <p>Installments are automatically generated when loans are disbursed.</p>
            </div>
          ) : (
            <div className="upcoming-list">
              {upcoming.map((item) => (
                <div className="upcoming-row" key={item.id}>
                  <div className="due-date-box">
                    <strong>{formatDate(item.due, 'dd')}</strong>
                    <small>{formatDate(item.due, 'MMM')}</small>
                  </div>
                  <div className="upcoming-main">
                    <strong>{item.customer}</strong>
                    <small>{item.loan}</small>
                  </div>
                  <div className="upcoming-value">
                    <strong>{formatUGX(item.expected)}</strong>
                    <small>{formatDate(item.due, 'EEEE, dd MMM')}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="quick-actions-section">
        <div className="quick-actions-title">
          <div>
            <h2>Quick actions</h2>
            <p>Operational workflows</p>
          </div>
          <span className="quick-actions-rule" />
        </div>
        <div className="quick-actions-grid">
          <Link to="/customers/new" className="quick-action-card">
            <span className="quick-action-icon quick-blue"><ContactRound size={18} /></span>
            <span><strong>Register customer</strong><small>Add a new borrower</small></span>
            <ChevronRight size={17} />
          </Link>
          <Link to="/applications/new" className="quick-action-card">
            <span className="quick-action-icon quick-violet"><FilePlus2 size={18} /></span>
            <span><strong>New application</strong><small>Start a loan request</small></span>
            <ChevronRight size={17} />
          </Link>
          <Link to="/repayments/new" className="quick-action-card">
            <span className="quick-action-icon quick-green"><ReceiptText size={18} /></span>
            <span><strong>Record repayment</strong><small>Log a customer payment</small></span>
            <ChevronRight size={17} />
          </Link>
          <Link to="/collections" className="quick-action-card">
            <span className="quick-action-icon quick-amber"><CalendarClock size={18} /></span>
            <span><strong>Follow-up queue</strong><small>{overdueCount} overdue for review</small></span>
            <ChevronRight size={17} />
          </Link>
        </div>
      </section>
    </div>
  )
}
