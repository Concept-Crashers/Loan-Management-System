import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Banknote, CalendarClock, ChevronRight, CircleAlert, TrendingUp, Users, Wallet, ArrowRight, FilePlus2, ContactRound, ReceiptText, ListFilter } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, Button, StatusBadge, Select } from '../../components/ui/primitives'
import { applications, loans, repayments, schedules } from '../../data/mock-data'
import { formatDate, formatUGX } from '../../lib/format'

const trendData = [
  { month: 'May', disbursed: 18.2, repayments: 11.4 }, { month: 'Jun', disbursed: 21.8, repayments: 14.7 },
  { month: 'Jul', disbursed: 17.1, repayments: 13.5 }, { month: 'Aug', disbursed: 28.7, repayments: 19.2 },
  { month: 'Sep', disbursed: 25.4, repayments: 17.8 }, { month: 'Oct', disbursed: 33.6, repayments: 23.7 },
  { month: 'Nov', disbursed: 29.5, repayments: 21.4 },
]
const portfolioData = [
  { name: 'Business Growth', value: 48, color: '#2563eb' }, { name: 'Salary Advance', value: 26, color: '#39aa88' },
  { name: 'Emergency Assist', value: 16, color: '#f6aa4d' }, { name: 'Group Enterprise', value: 10, color: '#aaa4f4' },
]

function MetricCard({ label, value, change, icon: Icon, color, hint }: { label: string; value: string; change: string; icon: typeof Users; color: string; hint: string }) {
  return <Card className="metric-card"><div className="metric-top"><span className={`metric-icon ${color}`}><Icon size={18} strokeWidth={1.9} /></span><span className="metric-change"><ArrowUpRight size={13} /> {change}</span></div><p className="metric-label">{label}</p><div className="metric-value">{value}</div><span className="metric-hint">{hint}</span></Card>
}

export function DashboardPage() {
  const [period, setPeriod] = useState('Last 7 months')
  const totalOutstanding = loans.reduce((sum, loan) => sum + loan.outstanding, 0)
  const monthlyRepayments = repayments.reduce((sum, payment) => sum + payment.amount, 0)
  const overdueCount = loans.filter((loan) => loan.status === 'Overdue').length
  const activeCount = loans.filter((loan) => loan.status === 'Active').length
  const pendingApplicationCount = applications.filter((item) => ['Submitted', 'Under Review', 'Additional Information Required'].includes(item.status)).length
  const recentTransactions = repayments.slice(0, 4)
  const upcoming = schedules.filter((item) => item.status !== 'Paid').slice(0, 4)

  return <div className="dashboard-page">
    <div className="page-heading dashboard-heading"><div><div className="eyebrow"><span className="live-spark" /> WEDNESDAY, 4 NOVEMBER 2026</div><h1>Good morning, Sarah <span className="wave">✳</span></h1><p>Here’s what’s happening with your loan portfolio today.</p></div><div className="heading-actions"><span className="refresh-note"><span className="online-dot" /> Live demo data</span><Button variant="outline" icon={ListFilter} onClick={() => window.print()}>Export overview</Button></div></div>
    <div className="metrics-grid">
      <MetricCard label="Total customers" value="2,104" change="8.4%" icon={Users} color="blue" hint="vs. last month · sample metric" />
      <MetricCard label="Total disbursed" value={formatUGX(246_800_000, true)} change="12.8%" icon={ArrowDownLeft} color="green" hint="vs. last month" />
      <MetricCard label="Outstanding balance" value={formatUGX(totalOutstanding, true)} change="4.2%" icon={Wallet} color="violet" hint="across active loans" />
      <MetricCard label="Repayments collected" value={formatUGX(monthlyRepayments, true)} change="6.1%" icon={Banknote} color="amber" hint="this month · demo data" />
    </div>
    <div className="dashboard-secondary-stats"><Card className="secondary-stat-card"><span className="secondary-stat-icon blue"><TrendingUp size={15} /></span><span><small>Total loans issued</small><strong>{loans.length}</strong><em>sample loan records</em></span></Card><Card className="secondary-stat-card"><span className="secondary-stat-icon violet"><FilePlus2 size={15} /></span><span><small>Pending applications</small><strong>{pendingApplicationCount}</strong><em>awaiting review</em></span></Card><Card className="secondary-stat-card"><span className="secondary-stat-icon green"><Users size={15} /></span><span><small>Active loans</small><strong>{activeCount}</strong><em>demo accounts</em></span></Card><Card className="secondary-stat-card"><span className="secondary-stat-icon amber"><CircleAlert size={15} /></span><span><small>Overdue loans</small><strong>{overdueCount}</strong><em>needs follow-up</em></span></Card></div>
    <div className="alert-strip"><span className="alert-icon"><CircleAlert size={16} /></span><span><strong>{overdueCount} loan needs attention.</strong> Review overdue installments and upcoming follow-ups.</span><Link to="/collections">Open collections <ArrowRight size={14} /></Link></div>

    <section className="dashboard-charts-grid">
      <Card className="chart-card trend-card"><div className="chart-card-header"><div><h2>Portfolio movement</h2><p>Disbursements and repayments</p></div><Select className="period-select" value={period} onChange={(event) => setPeriod(event.target.value)}><option>Last 7 months</option><option>Last 30 days</option><option>This year</option></Select></div>
        <div className="chart-legend"><span><i className="legend-dot legend-disbursement" /> Disbursed <strong>UGX 246.8m</strong></span><span><i className="legend-dot legend-repayment" /> Repaid <strong>UGX 118.4m</strong></span></div>
        <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trendData} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id="disbursedGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4278ec" stopOpacity={0.16} /><stop offset="95%" stopColor="#4278ec" stopOpacity={0} /></linearGradient><linearGradient id="repaidGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3fb997" stopOpacity={0.14} /><stop offset="95%" stopColor="#3fb997" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0f5" strokeDasharray="3 4" /><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#919cad', fontSize: 11 }} dy={9} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#919cad', fontSize: 10 }} tickFormatter={(value) => `${value}m`} /><Tooltip formatter={(value) => [`UGX ${value}m`]} contentStyle={{ border: '1px solid #e8ecf2', borderRadius: 10, boxShadow: '0 6px 20px #15254412', fontSize: 12 }} /><Area type="monotone" dataKey="disbursed" stroke="#4379ef" strokeWidth={2.4} fill="url(#disbursedGradient)" activeDot={{ r: 4 }} /><Area type="monotone" dataKey="repayments" stroke="#38b68f" strokeWidth={2.4} fill="url(#repaidGradient)" activeDot={{ r: 4 }} /></AreaChart></ResponsiveContainer></div>
        <div className="chart-x-note">Values shown in UGX millions · illustrative demo data</div>
      </Card>
      <Card className="chart-card portfolio-card"><div className="chart-card-header"><div><h2>Loan portfolio</h2><p>Active principal by product</p></div><button className="icon-link" aria-label="Portfolio details"><ChevronRight size={18} /></button></div>
        <div className="portfolio-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={portfolioData} innerRadius={65} outerRadius={84} paddingAngle={4} dataKey="value" stroke="none" cornerRadius={5}>{portfolioData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip formatter={(value) => [`${value}%`, 'Portfolio share']} contentStyle={{ border: '1px solid #e8ecf2', borderRadius: 10, fontSize: 12 }} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>UGX 1.28B</strong><span>total portfolio</span></div></div>
        <div className="portfolio-legend">{portfolioData.map((item) => <div key={item.name}><span className="portfolio-name"><i style={{ backgroundColor: item.color }} />{item.name}</span><strong>{item.value}%</strong></div>)}</div><div className="portfolio-status-breakdown"><span>Loan status distribution</span><div><StatusBadge status="Active" /><strong>{activeCount}</strong><StatusBadge status="Overdue" /><strong>{overdueCount}</strong><StatusBadge status="Fully Paid" /><strong>{loans.filter((loan) => loan.status === 'Fully Paid').length}</strong></div></div>
      </Card>
    </section>

    <section className="dashboard-lower-grid"><Card className="table-card"><div className="card-section-header"><div><h2>Recent transactions</h2><p>Latest activity across your branches</p></div><Link to="/transactions" className="text-link">View all <ArrowRight size={14} /></Link></div><div className="transaction-list">{recentTransactions.map((payment) => <Link to={`/repayments/${payment.id}`} className="transaction-row" key={payment.id}><span className="transaction-method-icon"><ArrowDownLeft size={16} /></span><span className="transaction-main"><strong>{payment.customer}</strong><small>{payment.id} <span>·</span> {payment.method}</small></span><span className="transaction-amount">{formatUGX(payment.amount)}</span><span className="transaction-date">{formatDate(payment.date, 'dd MMM')}</span><StatusBadge status={payment.status} /></Link>)}</div></Card>
      <Card className="table-card upcoming-card"><div className="card-section-header"><div><h2>Upcoming repayments</h2><p>Next 14 days · {upcoming.length} installments</p></div><Link to="/schedules" className="text-link">View schedule <ArrowRight size={14} /></Link></div><div className="upcoming-list">{upcoming.map((item) => <div className="upcoming-row" key={item.id}><div className="due-date-box"><strong>{formatDate(item.due, 'dd')}</strong><small>{formatDate(item.due, 'MMM')}</small></div><div className="upcoming-main"><strong>{item.customer}</strong><small>{item.loan}</small></div><div className="upcoming-value"><strong>{formatUGX(item.expected)}</strong><small>{formatDate(item.due, 'EEEE, dd MMM')}</small></div></div>)}</div></Card></section>

    <section className="quick-actions-section"><div className="quick-actions-title"><div><h2>Quick actions</h2><p>Keep your operations moving</p></div><span className="quick-actions-rule" /></div><div className="quick-actions-grid"><Link to="/customers/new" className="quick-action-card"><span className="quick-action-icon quick-blue"><ContactRound size={18} /></span><span><strong>Register customer</strong><small>Add a new borrower</small></span><ChevronRight size={17} /></Link><Link to="/applications/new" className="quick-action-card"><span className="quick-action-icon quick-violet"><FilePlus2 size={18} /></span><span><strong>New application</strong><small>Start a loan request</small></span><ChevronRight size={17} /></Link><Link to="/repayments/new" className="quick-action-card"><span className="quick-action-icon quick-green"><ReceiptText size={18} /></span><span><strong>Record repayment</strong><small>Log a customer payment</small></span><ChevronRight size={17} /></Link><Link to="/collections" className="quick-action-card"><span className="quick-action-icon quick-amber"><CalendarClock size={18} /></span><span><strong>Follow-up queue</strong><small>{overdueCount} overdue for review</small></span><ChevronRight size={17} /></Link></div></section>
    <div className="dashboard-footnote"><TrendingUp size={14} /> Dashboard figures are illustrative sample data. Balances and calculations will be supplied by the lending service.</div>
  </div>
}
