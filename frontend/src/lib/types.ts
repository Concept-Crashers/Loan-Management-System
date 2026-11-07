export type LoanStatus = 'Active' | 'Overdue' | 'Pending Disbursement' | 'Restructured' | 'Fully Paid' | 'Written Off' | 'Closed'
export type ApplicationStatus = 'Draft' | 'Submitted' | 'Under Review' | 'Additional Information Required' | 'Approved' | 'Rejected' | 'Cancelled'
export type PaymentMethod = 'MTN Mobile Money' | 'Airtel Money' | 'Bank transfer' | 'Cash' | 'Other'

export interface Customer {
  id: string
  /** MongoDB record id for API mutations (falls back to id). */
  recordId?: string
  name: string
  phone: string
  email: string
  district: string
  town: string
  loans: number
  outstanding: number
  status: 'Active' | 'Inactive' | 'Watchlist'
  registered: string
  dateOfBirth?: string
  idType?: string
  nationalId: string
  occupation: string
  employer: string
  monthlyIncome: number
  nextOfKin: string
  nextOfKinRelationship?: string
  nextOfKinPhone: string
  address: string
}

export interface LoanProduct {
  id: string
  recordId?: string
  name: string
  description: string
  minAmount: number
  maxAmount: number
  interestRate: number
  interestMethod?: string
  duration: number
  frequency: 'Daily' | 'Weekly' | 'Bi-weekly' | 'Monthly'
  gracePeriod?: number
  fees?: string
  lateRule?: string
  requiredDocuments?: string
  active: boolean
}

export interface Application {
  id: string
  customer: string
  customerId: string
  product: string
  amount: number
  duration: number
  status: ApplicationStatus
  submitted: string
  income: number
  officer: string
  purpose: string
  obligations: number
  version?: number
}

export interface LoanAccount {
  ref: string
  applicationId?: string
  branchId?: string
  customer: string
  customerId: string
  product: string
  principal: number
  disbursed: number
  paid: number
  outstanding: number
  interest: number
  start: string
  maturity: string
  status: LoanStatus
  nextDue: string
}

export interface Repayment {
  id: string
  customer: string
  customerId: string
  loan: string
  amount: number
  method: PaymentMethod
  reference: string
  date: string
  receivedBy: string
  status: 'Successful' | 'Pending review' | 'Reversed'
}

export interface ScheduleInstallment {
  id: string
  customer: string
  loan: string
  due: string
  expected: number
  paid: number
  status: 'Paid' | 'Due soon' | 'Due today' | 'Overdue' | 'Upcoming'
  officer: string
}

export interface CollectionRecord {
  id: string
  customer: string
  phone: string
  loan: string
  outstanding: number
  overdue: number
  lastPayment: string
  followUp: string
  officer: string
  status: 'Not Contacted' | 'Contacted' | 'Awaiting Response' | 'Payment Arrangement Recorded' | 'Escalated for Review' | 'Resolved'
  note: string
  assignedTo?: string
  promiseAmount?: number
  promiseDueAt?: string
}

export interface Transaction {
  id: string
  type: 'Disbursement' | 'Repayment' | 'Fee'
  reference: string
  customer: string
  amount: number
  date: string
  method: string
  status: 'Completed' | 'Pending' | 'Reversed'
  recordedBy: string
}

export interface StaffMember {
  id: string
  name: string
  email: string
  phone: string
  role: string
  branch: string
  status: 'Active' | 'Invited' | 'Suspended'
  lastActive: string
}

export type TableValue = string | number | boolean | undefined
export type TableRow = Record<string, TableValue>
