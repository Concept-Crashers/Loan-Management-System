import { applications, collections, customers, loans, products, repayments, schedules, staff, transactions } from '../data/empty-data'
import { formatUGX } from '../lib/format'
import type { TableRow } from '../lib/types'

export interface PageColumn { label: string; key: string; format?: 'money' | 'date' | 'mono' | 'person' | 'status' | 'tag' }
export interface PageDefinition {
  title: string
  subtitle: string
  columns: PageColumn[]
  getRows: () => TableRow[]
  newTo?: string
  newLabel?: string
  detailBase?: string
  detailKey?: string
  filterKey?: string
  filterLabel?: string
  filterOptions?: string[]
  stats?: Array<{ label: string; value: string; helper: string }>
}

const money = (value: number) => formatUGX(value)

export const pageRegistry: Record<string, PageDefinition> = {
  '/customers': {
    title: 'Customers', subtitle: 'Manage borrowers and maintain a clear record of every customer relationship.', newTo: '/customers/new', newLabel: 'Register customer', detailBase: '/customers', detailKey: 'id', filterKey: 'status', filterLabel: 'Status',
    columns: [{ label: 'Customer', key: 'name', format: 'person' }, { label: 'Customer ID', key: 'id', format: 'mono' }, { label: 'Telephone', key: 'phone' }, { label: 'District', key: 'district' }, { label: 'Loans', key: 'loans' }, { label: 'Outstanding', key: 'outstanding', format: 'money' }, { label: 'Status', key: 'status', format: 'status' }, { label: 'Registered', key: 'registered', format: 'date' }],
    getRows: () => customers.map((item) => ({ id: item.id, name: item.name, phone: item.phone, district: item.district, loans: item.loans, outstanding: item.outstanding, status: item.status, registered: item.registered })),
    stats: [],
  },
  '/products': {
    title: 'Loan products', subtitle: 'Configure lending terms once, then apply them consistently across loan applications.', newTo: '/products/new', newLabel: 'Create product', detailBase: '/products', detailKey: 'id', filterKey: 'state', filterLabel: 'Availability', filterOptions: ['Active', 'Inactive'],
    columns: [{ label: 'Product', key: 'name', format: 'person' }, { label: 'Product ID', key: 'id', format: 'mono' }, { label: 'Loan range', key: 'range' }, { label: 'Interest / year', key: 'rate' }, { label: 'Duration', key: 'duration' }, { label: 'Repayment', key: 'frequency' }, { label: 'Status', key: 'state', format: 'status' }],
    getRows: () => products.map((item) => ({ id: item.id, name: item.name, range: `${money(item.minAmount)} – ${money(item.maxAmount)}`, rate: `${item.interestRate}%`, duration: `${item.duration} months`, frequency: item.frequency, state: item.active ? 'Active' : 'Inactive' })),
    stats: [],
  },
  '/applications': {
    title: 'Loan applications', subtitle: 'Track new requests from submission through review and decision.', newTo: '/applications/new', newLabel: 'New application', detailBase: '/applications', detailKey: 'id', filterKey: 'status', filterLabel: 'Application status',
    columns: [{ label: 'Application', key: 'id', format: 'mono' }, { label: 'Applicant', key: 'customer', format: 'person' }, { label: 'Loan product', key: 'product' }, { label: 'Requested amount', key: 'amount', format: 'money' }, { label: 'Duration', key: 'duration' }, { label: 'Loan officer', key: 'officer' }, { label: 'Submitted', key: 'submitted', format: 'date' }, { label: 'Status', key: 'status', format: 'status' }],
    getRows: () => applications.map((item) => ({ id: item.id, customer: item.customer, customerId: item.customerId, product: item.product, amount: item.amount, duration: `${item.duration} months`, officer: item.officer, submitted: item.submitted, status: item.status })),
    stats: [],
  },
  '/approvals': {
    title: 'Loan approvals', subtitle: 'Review the request, assessment and proposed terms before recording a decision.', filterKey: 'status', filterLabel: 'Decision queue',
    columns: [{ label: 'Application', key: 'id', format: 'mono' }, { label: 'Applicant', key: 'customer', format: 'person' }, { label: 'Product', key: 'product' }, { label: 'Requested', key: 'amount', format: 'money' }, { label: 'Monthly income', key: 'income', format: 'money' }, { label: 'Loan officer', key: 'officer' }, { label: 'Submitted', key: 'submitted', format: 'date' }, { label: 'Status', key: 'status', format: 'status' }],
    getRows: () => applications.filter((item) => ['Submitted', 'Under Review', 'Additional Information Required'].includes(item.status)).map((item) => ({ id: item.id, customer: item.customer, customerId: item.customerId, product: item.product, amount: item.amount, income: item.income, officer: item.officer, submitted: item.submitted, status: item.status })),
    stats: [],
  },
  '/loans': {
    title: 'Active loans', subtitle: 'Monitor disbursed accounts, upcoming obligations and outstanding balances.', detailBase: '/loans', detailKey: 'ref', filterKey: 'status', filterLabel: 'Loan status',
    columns: [{ label: 'Loan reference', key: 'ref', format: 'mono' }, { label: 'Borrower', key: 'customer', format: 'person' }, { label: 'Product', key: 'product' }, { label: 'Principal', key: 'principal', format: 'money' }, { label: 'Outstanding', key: 'outstanding', format: 'money' }, { label: 'Next due', key: 'nextDue', format: 'date' }, { label: 'Status', key: 'status', format: 'status' }],
    getRows: () => loans.map((item) => ({ ref: item.ref, customer: item.customer, customerId: item.customerId, product: item.product, principal: item.principal, outstanding: item.outstanding, nextDue: item.nextDue, status: item.status })),
    stats: [],
  },
  '/disbursements': {
    title: 'Disbursements', subtitle: 'Record approved loans when funds have been released to a borrower.', newTo: '/disbursements/new', newLabel: 'Record disbursement', filterKey: 'state', filterLabel: 'Disbursement status',
    columns: [{ label: 'Loan reference', key: 'ref', format: 'mono' }, { label: 'Borrower', key: 'customer', format: 'person' }, { label: 'Product', key: 'product' }, { label: 'Approved amount', key: 'amount', format: 'money' }, { label: 'Branch', key: 'branch' }, { label: 'Requested on', key: 'submitted', format: 'date' }, { label: 'Status', key: 'state', format: 'status' }],
    getRows: () => loans.filter((item) => item.status === 'Pending Disbursement').map((item) => ({ ref: item.ref, customer: item.customer, product: item.product, amount: item.principal, branch: 'Kampala Central', submitted: item.start, state: 'Pending Disbursement' })),
    stats: [{ label: 'Awaiting disbursement', value: '1', helper: 'Approved & ready' }, { label: 'Disbursed this month', value: 'UGX 42.6m', helper: 'Across 18 loans' }, { label: 'Disbursement channels', value: '3', helper: 'Bank · MoMo · cash' }],
  },
  '/repayments': {
    title: 'Repayments', subtitle: 'Review payments collected across mobile money, bank transfer and cash.', newTo: '/repayments/new', newLabel: 'Record repayment', detailBase: '/repayments', detailKey: 'id', filterKey: 'method', filterLabel: 'Payment method', filterOptions: ['MTN Mobile Money', 'Airtel Money', 'Bank transfer', 'Cash'],
    columns: [{ label: 'Receipt', key: 'id', format: 'mono' }, { label: 'Customer', key: 'customer', format: 'person' }, { label: 'Loan reference', key: 'loan', format: 'mono' }, { label: 'Amount paid', key: 'amount', format: 'money' }, { label: 'Method', key: 'method' }, { label: 'Payment date', key: 'date', format: 'date' }, { label: 'Received by', key: 'receivedBy' }, { label: 'Status', key: 'status', format: 'status' }],
    getRows: () => repayments.map((item) => ({ id: item.id, customer: item.customer, customerId: item.customerId, loan: item.loan, amount: item.amount, method: item.method, date: item.date, receivedBy: item.receivedBy, status: item.status })),
    stats: [{ label: 'Collected today', value: money(repayments.filter((item) => item.date === '2026-11-04').reduce((sum, item) => sum + item.amount, 0)), helper: 'Across all payment channels' }, { label: 'This month', value: 'UGX 82.4m', helper: '+6.1% vs. October' }, { label: 'Needs review', value: '1', helper: 'Duplicate-safe workflow' }],
  },
  '/schedules': {
    title: 'Repayment schedules', subtitle: 'Keep upcoming installments visible and give teams time to plan follow-ups.', detailBase: '/loans', detailKey: 'loan', filterKey: 'status', filterLabel: 'Payment status',
    columns: [{ label: 'Due date', key: 'due', format: 'date' }, { label: 'Customer', key: 'customer', format: 'person' }, { label: 'Loan reference', key: 'loan', format: 'mono' }, { label: 'Expected payment', key: 'expected', format: 'money' }, { label: 'Paid to date', key: 'paid', format: 'money' }, { label: 'Loan officer', key: 'officer' }, { label: 'Status', key: 'status', format: 'status' }],
    getRows: () => schedules.map((item) => ({ id: item.id, due: item.due, customer: item.customer, loan: item.loan, expected: item.expected, paid: item.paid, officer: item.officer, status: item.status })),
    stats: [{ label: 'Upcoming · 7 days', value: '26', helper: 'UGX 14.2m expected' }, { label: 'Overdue installments', value: '4', helper: 'UGX 1.8m outstanding' }, { label: 'Settled this month', value: '116', helper: '93% on-time rate' }],
  },
  '/collections': {
    title: 'Collections', subtitle: 'Plan respectful follow-ups and keep a transparent communication history.', filterKey: 'status', filterLabel: 'Follow-up status', filterOptions: ['Not Contacted', 'Contacted', 'Awaiting Response', 'Payment Arrangement Recorded', 'Escalated for Review', 'Resolved'],
    columns: [{ label: 'Customer', key: 'customer', format: 'person' }, { label: 'Loan reference', key: 'loan', format: 'mono' }, { label: 'Outstanding', key: 'outstanding', format: 'money' }, { label: 'Overdue amount', key: 'overdue', format: 'money' }, { label: 'Last payment', key: 'lastPayment', format: 'date' }, { label: 'Follow-up date', key: 'followUp', format: 'date' }, { label: 'Assigned to', key: 'officer' }, { label: 'Status', key: 'status', format: 'status' }],
    getRows: () => collections.map((item) => ({ id: item.id, customer: item.customer, loan: item.loan, outstanding: item.outstanding, overdue: item.overdue, lastPayment: item.lastPayment, followUp: item.followUp, officer: item.officer, status: item.status, note: item.note, phone: item.phone })),
    stats: [{ label: 'Follow-ups due today', value: '6', helper: 'Across 3 loan officers' }, { label: 'Overdue exposure', value: 'UGX 3.7m', helper: '4 installments' }, { label: 'Arrangements recorded', value: '9', helper: 'Respectful follow-up' }],
  },
  '/transactions': {
    title: 'Transactions', subtitle: 'A clear ledger of recorded disbursements, repayments and fees.', filterKey: 'type', filterLabel: 'Transaction type', filterOptions: ['Disbursement', 'Repayment', 'Fee'],
    columns: [{ label: 'Transaction', key: 'id', format: 'mono' }, { label: 'Type', key: 'type', format: 'tag' }, { label: 'Reference', key: 'reference', format: 'mono' }, { label: 'Customer', key: 'customer', format: 'person' }, { label: 'Amount', key: 'amount', format: 'money' }, { label: 'Payment channel', key: 'method' }, { label: 'Date', key: 'date', format: 'date' }, { label: 'Status', key: 'status', format: 'status' }],
    getRows: () => transactions.map((item) => ({ id: item.id, type: item.type, reference: item.reference, customer: item.customer, amount: item.amount, method: item.method, date: item.date, status: item.status, recordedBy: item.recordedBy })),
    stats: [{ label: 'Transactions today', value: '28', helper: 'All branches' }, { label: 'Cash in', value: 'UGX 1.24m', helper: 'This business day' }, { label: 'Needs reconciliation', value: '2', helper: 'Pending review' }],
  },
  '/staff': {
    title: 'Staff & users', subtitle: 'Manage team membership, branch assignment and role-based responsibilities.', newLabel: 'Invite staff', filterKey: 'role', filterLabel: 'Staff role',
    columns: [{ label: 'Staff member', key: 'name', format: 'person' }, { label: 'User ID', key: 'id', format: 'mono' }, { label: 'Email', key: 'email' }, { label: 'Role', key: 'role', format: 'tag' }, { label: 'Branch', key: 'branch' }, { label: 'Last active', key: 'lastActive' }, { label: 'Status', key: 'status', format: 'status' }],
    getRows: () => staff.map((item) => ({ id: item.id, name: item.name, email: item.email, phone: item.phone, role: item.role, branch: item.branch, lastActive: item.lastActive, status: item.status })),
    stats: [{ label: 'Team members', value: '24', helper: 'Across 4 branches' }, { label: 'Role groups', value: '9', helper: 'Separate permission sets' }, { label: 'Invitations pending', value: '2', helper: 'Sent this week' }],
  },
  '/branches': {
    title: 'Branches', subtitle: 'See where teams work and how customer and loan operations are distributed.', newLabel: 'Add branch', filterKey: 'status', filterLabel: 'Branch status',
    columns: [{ label: 'Branch', key: 'name', format: 'person' }, { label: 'Branch ID', key: 'id', format: 'mono' }, { label: 'District', key: 'district' }, { label: 'Branch manager', key: 'manager' }, { label: 'Staff', key: 'staff' }, { label: 'Active loans', key: 'activeLoans' }, { label: 'Status', key: 'status', format: 'status' }],
    getRows: () => [
      { id: 'BR-001', name: 'Kampala Central', district: 'Kampala', manager: 'Sarah Kiconco', staff: 8, activeLoans: 486, status: 'Active' },
      { id: 'BR-002', name: 'Entebbe', district: 'Wakiso', manager: 'Miriam Nakato', staff: 5, activeLoans: 298, status: 'Active' },
      { id: 'BR-003', name: 'Gulu', district: 'Gulu', manager: 'Rita Acen', staff: 4, activeLoans: 174, status: 'Active' },
      { id: 'BR-004', name: 'Mbarara', district: 'Mbarara', manager: 'Patrick Tumusiime', staff: 7, activeLoans: 280, status: 'Active' },
    ],
    stats: [{ label: 'Branches', value: '4', helper: 'Uganda network' }, { label: 'Staff assigned', value: '24', helper: 'Across all branches' }, { label: 'Active accounts', value: '1,238', helper: 'Portfolio-wide' }],
  },
  '/audit-logs': {
    title: 'Audit logs', subtitle: 'A traceable record of important decisions and user activity.', filterKey: 'action', filterLabel: 'Activity type', filterOptions: ['Application decision', 'Payment recorded', 'Customer updated', 'Role changed'],
    columns: [{ label: 'Activity', key: 'action', format: 'tag' }, { label: 'Description', key: 'description' }, { label: 'Performed by', key: 'actor', format: 'person' }, { label: 'Record', key: 'record', format: 'mono' }, { label: 'Branch', key: 'branch' }, { label: 'Date & time', key: 'date' }],
    getRows: () => [
      { id: 'AUD-1938', action: 'Payment recorded', description: 'Recorded UGX 420,000 repayment', actor: 'Paul Wekesa', record: 'RCT-2026-0841', branch: 'Kampala Central', date: '04 Nov 2026 · 10:42' },
      { id: 'AUD-1937', action: 'Application decision', description: 'Requested updated income documents', actor: 'Miriam Nakato', record: 'APP-2026-0311', branch: 'Kampala Central', date: '04 Nov 2026 · 09:18' },
      { id: 'AUD-1936', action: 'Customer updated', description: 'Updated contact preference', actor: 'Peter Ssebuliba', record: 'CUS-2481', branch: 'Kampala Central', date: '03 Nov 2026 · 16:24' },
      { id: 'AUD-1935', action: 'Role changed', description: 'Changed role to Collections Officer', actor: 'Sarah Kiconco', record: 'USR-004', branch: 'Kampala Central', date: '03 Nov 2026 · 14:03' },
    ],
    stats: [{ label: 'Events this week', value: '384', helper: 'Across all branches' }, { label: 'Decision records', value: '26', helper: 'Approvals & rejections' }, { label: 'Data access changes', value: '4', helper: 'Role-aware visibility' }],
  },
}
