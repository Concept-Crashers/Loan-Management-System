import { apiRequest, getAuthenticatedUser } from './api'
import type { Application, CollectionRecord, Customer, LoanAccount, LoanProduct, Repayment, ScheduleInstallment, StaffMember, Transaction } from './types'

type BackendCustomer = {
  _id?: string
  id?: string
  customerNumber?: string
  name: string
  phone: string
  email?: string
  address: string
  district: string
  monthlyIncomeMinor: number
  status?: string
  dateOfBirth?: string
  idType?: string
  nationalId?: string
  occupation: string
  employer: string
  nextOfKin: string
  nextOfKinRelationship: string
  nextOfKinPhone: string
}

type BackendProduct = {
  _id?: string
  id?: string
  code: string
  name: string
  category: 'individual' | 'group'
  status: 'draft' | 'active' | 'inactive'
  terms: {
    minAmountMinor: number
    maxAmountMinor: number
    annualRateBps: number
    interestMethod: 'flat' | 'declining_balance'
    repaymentFrequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
    minTenureMonths: number
    maxTenureMonths: number
    gracePeriodDays: number
    fees: unknown[]
    requiredDocuments: string[]
  }
}

export interface BranchRecord {
  id: string
  branchId?: string
  code?: string
  name: string
  district: string
  managerId?: string
  managerName?: string
  manager: string
  staff: string
  activeLoans: string
  status: 'Active' | 'Suspended'
  settings?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

const branchId = () => {
  const user = getAuthenticatedUser()
  const id = user?.branchIds?.[0]
  return id || ''
}

const identifier = (record: { _id?: string; id?: string }) => record.id ?? record._id ?? ''
const fromMinor = (value: number | undefined) => (value ?? 0) / 100
const toMinor = (value: number) => Math.round(value * 100)

function mapCustomer(record: BackendCustomer): Customer {
  const mongoId = identifier(record)
  return {
    id: record.customerNumber ?? mongoId,
    recordId: mongoId,
    name: record.name,
    phone: record.phone,
    email: record.email ?? '',
    district: record.district,
    town: '',
    loans: 0,
    outstanding: 0,
    status: record.status === 'inactive' ? 'Inactive' : 'Active',
    registered: new Date().toISOString().slice(0, 10),
    dateOfBirth: record.dateOfBirth,
    idType: record.idType,
    nationalId: record.nationalId ?? '',
    occupation: record.occupation,
    employer: record.employer,
    monthlyIncome: fromMinor(record.monthlyIncomeMinor),
    nextOfKin: record.nextOfKin,
    nextOfKinRelationship: record.nextOfKinRelationship,
    nextOfKinPhone: record.nextOfKinPhone,
    address: record.address,
  }
}

function mapProduct(record: BackendProduct): LoanProduct {
  const mongoId = identifier(record)
  return {
    id: mongoId,
    recordId: mongoId,
    name: record.name,
    description: `${record.category} loan`,
    minAmount: fromMinor(record.terms?.minAmountMinor),
    maxAmount: fromMinor(record.terms?.maxAmountMinor),
    interestRate: (record.terms?.annualRateBps ?? 0) / 100,
    interestMethod: record.terms?.interestMethod ?? 'flat',
    duration: record.terms?.maxTenureMonths ?? 12,
    frequency: record.terms?.repaymentFrequency === 'daily' ? 'Daily' : record.terms?.repaymentFrequency === 'biweekly' ? 'Bi-weekly' : record.terms?.repaymentFrequency === 'weekly' ? 'Weekly' : 'Monthly',
    gracePeriod: record.terms?.gracePeriodDays ?? 0,
    requiredDocuments: (record.terms?.requiredDocuments ?? []).join(', '),
    active: record.status === 'active',
  }
}

export const api = {
  listCustomers: async (): Promise<Customer[]> => {
    const bId = branchId()
    const path = bId ? `/api/v1/customers?branchId=${encodeURIComponent(bId)}` : '/api/v1/customers'
    const response = await apiRequest<BackendCustomer[] | { data: BackendCustomer[] }>(path)
    const records = Array.isArray(response) ? response : (response.data ?? [])
    return records.map((record) => {
      const mapped = mapCustomer(record)
      return { ...mapped, recordId: mapped.recordId || String((record as any)._id ?? (record as any).id ?? mapped.id) }
    })
  },

  listProducts: async (): Promise<LoanProduct[]> => {
    const response = await apiRequest<BackendProduct[] | { data: BackendProduct[] }>('/api/v1/loan-products')
    const records = Array.isArray(response) ? response : (response.data ?? [])
    return records.map(mapProduct)
  },

  listApplications: async (): Promise<Application[]> => {
    const records = await apiRequest<Array<Record<string, unknown>>>('/api/v1/applications')
    return (records ?? []).map((record) => {
      const customerObj = typeof record.customerId === 'object' && record.customerId !== null ? (record.customerId as { name?: string; _id?: string; customerNumber?: string }) : null
      const productObj = typeof record.productId === 'object' && record.productId !== null ? (record.productId as { name?: string; _id?: string }) : null
      return {
        id: String(record._id ?? record.id ?? ''),
        customer: customerObj?.name ?? String(record.customerName ?? record.customer ?? customerObj?.customerNumber ?? record.customerId ?? ''),
        customerId: customerObj?._id ? String(customerObj._id) : String(record.customerId ?? ''),
        product: productObj?.name ?? String(record.productName ?? record.product ?? record.productId ?? ''),
        amount: fromMinor(Number(record.amountMinor ?? 0)),
        duration: Number(record.tenureMonths ?? 0),
        status: ({ draft: 'Draft', submitted: 'Submitted', under_review: 'Under Review', assessment_required: 'Additional Information Required', info_requested: 'Information Requested', approval_pending: 'Pending Approval', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled', withdrawn: 'Withdrawn' } as Record<string, Application['status']>)[String(record.status ?? 'submitted')] ?? (String(record.status ?? 'Submitted').replaceAll('_', ' ') as Application['status']),
        submitted: String(record.createdAt ?? '').slice(0, 10),
        income: fromMinor(Number(record.incomeMinor ?? 0)),
        officer: String(record.officerId ?? ''),
        purpose: String(record.purpose ?? ''),
        obligations: fromMinor(Number(record.obligationsMinor ?? 0)),
        version: Number(record.version ?? 1),
      }
    })
  },

  updateApplication: (id: string, input: { amount?: number; duration?: number; purpose?: string; income?: number; obligations?: number; version: number }) =>
    apiRequest<Application>(`/api/v1/applications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(input.amount !== undefined ? { amountMinor: toMinor(input.amount) } : {}),
        ...(input.duration !== undefined ? { tenureMonths: input.duration } : {}),
        ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
        ...(input.income !== undefined ? { incomeMinor: toMinor(input.income) } : {}),
        ...(input.obligations !== undefined ? { obligationsMinor: toMinor(input.obligations) } : {}),
        version: input.version,
      }),
    }),

  decideApplication: (id: string, decision: 'approved' | 'rejected', reason: string, version: number) =>
    apiRequest<Application>(`/api/v1/applications/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason, version }),
    }),

  listLoans: async (): Promise<LoanAccount[]> => {
    const response = await apiRequest<Array<Record<string, unknown>> | { data: Array<Record<string, unknown>> }>('/api/v1/finance/loans')
    const records = Array.isArray(response) ? response : (response.data ?? [])
    return records.map((record) => {
      const customerObj = typeof record.customerId === 'object' && record.customerId !== null ? (record.customerId as { name?: string; _id?: string; customerNumber?: string }) : null
      return {
        id: String(record._id ?? record.ref ?? ''),
        ref: String(record.ref ?? record._id ?? ''),
        applicationId: String(record.applicationId ?? ''),
        branchId: String(record.branchId ?? ''),
        customer: customerObj?.name ?? String(record.customer ?? customerObj?.customerNumber ?? ''),
        customerId: customerObj?._id ? String(customerObj._id) : String(record.customerId ?? ''),
        product: String(record.product ?? (record.productSnapshot as { name?: string } | undefined)?.name ?? 'Loan Account'),
        principal: fromMinor(Number(record.principalMinor ?? 0)),
        disbursed: fromMinor(Number(record.disbursedMinor ?? record.principalMinor ?? 0)),
        paid: fromMinor(Number(record.paidMinor ?? 0)),
        outstanding: fromMinor(Number(record.outstandingMinor ?? Number(record.outstandingPrincipalMinor ?? 0) + Number(record.outstandingInterestMinor ?? 0) + Number(record.outstandingFeesMinor ?? 0))),
        interest: fromMinor(Number(record.outstandingInterestMinor ?? 0)),
        start: String(record.createdAt ?? record.start ?? '').slice(0, 10),
        maturity: String(record.maturity ?? '').slice(0, 10),
        status: record.status === 'in_arrears' ? 'Overdue' : record.status === 'settled' ? 'Fully Paid' : record.status === 'active' ? 'Active' : 'Pending Disbursement',
        nextDue: String(record.nextDue ?? 'Schedule pending'),
      }
    })
  },

  listRepayments: async (): Promise<Repayment[]> => {
    const response = await apiRequest<Array<Record<string, unknown>> | { data: Array<Record<string, unknown>> }>('/api/v1/finance/payments')
    const records = Array.isArray(response) ? response : (response.data ?? [])
    return records.map((record) => {
      const loanObj = typeof record.loanAccountId === 'object' && record.loanAccountId !== null ? (record.loanAccountId as { _id?: string; ref?: string; customerId?: { name?: string; _id?: string } }) : null
      const customerObj = loanObj && typeof loanObj.customerId === 'object' ? loanObj.customerId : null
      const rid = String(record._id ?? record.id ?? record.reference ?? '')
      return {
        id: rid,
        recordId: String(record._id ?? record.id ?? ''),
        customer: String(record.customer ?? customerObj?.name ?? ''),
        customerId: customerObj?._id ? String(customerObj._id) : String(record.customerId ?? ''),
        loan: String((loanObj as any)?.ref ?? loanObj?._id ?? record.loanAccountId ?? ''),
        amount: fromMinor(Number(record.amountMinor ?? 0)),
        method: String(record.method ?? 'Manual') as Repayment['method'],
        date: String(record.createdAt ?? record.date ?? '').slice(0, 10),
        reference: String(record.reference ?? ''),
        receivedBy: String(record.confirmedBy ?? '—'),
        status: record.status === 'reversed' ? 'Reversed' : record.status === 'confirmed' ? 'Successful' : 'Pending review',
      }
    })
  },

  confirmRepayment: (id: string) => apiRequest<any>(`/api/v1/finance/payments/${encodeURIComponent(id)}/confirm`, { method: 'POST' }),

  listSchedules: async (): Promise<ScheduleInstallment[]> => {
    const response = await apiRequest<Array<Record<string, unknown>> | { data: Array<Record<string, unknown>> }>('/api/v1/finance/schedules')
    const records = Array.isArray(response) ? response : (response.data ?? [])
    return records.map((record) => {
      const loanObj = typeof record.loanAccountId === 'object' && record.loanAccountId !== null ? (record.loanAccountId as { _id?: string; customerId?: { name?: string } }) : null
      return {
        id: String(record._id ?? ''),
        loan: String(loanObj?._id ?? record.loanAccountId ?? ''),
        customer: loanObj?.customerId?.name ?? 'Borrower',
        due: String(record.dueDate ?? '').slice(0, 10),
        expected: fromMinor(Number(record.totalMinor ?? 0)),
        paid: 0,
        officer: 'Loan Officer',
        status: record.status === 'paid' ? 'Paid' : record.status === 'overdue' ? 'Overdue' : 'Due soon',
      }
    })
  },

  listCollections: async (): Promise<CollectionRecord[]> => {
    const response = await apiRequest<Array<Record<string, unknown>> | { data: Array<Record<string, unknown>> }>('/api/v1/collections')
    const records = Array.isArray(response) ? response : (response.data ?? [])
    return records.map((record) => {
      const loanObj = typeof record.loanAccountId === 'object' && record.loanAccountId !== null ? (record.loanAccountId as { _id?: string; customerId?: { name?: string; phone?: string }; outstandingPrincipalMinor?: number }) : null
      return {
        id: String(record._id ?? ''),
        customer: loanObj?.customerId?.name ?? 'Borrower',
        loan: String(loanObj?._id ?? record.loanAccountId ?? ''),
        outstanding: fromMinor(Number(loanObj?.outstandingPrincipalMinor ?? record.overduePrincipalMinor ?? 0)),
        overdue: fromMinor(Number(record.overduePrincipalMinor ?? 0)),
        lastPayment: String(record.createdAt ?? '').slice(0, 10),
        followUp: String(record.followUpAt ?? '').slice(0, 10),
        officer: String(record.assignedTo ?? 'Collections Officer'),
        status: record.status === 'resolved' ? 'Resolved' : record.status === 'contacted' ? 'Contacted' : record.status === 'promise_to_pay' ? 'Payment Arrangement Recorded' : record.status === 'escalated' ? 'Escalated for Review' : record.status === 'open' ? 'Awaiting Response' : 'Not Contacted',
        note: String(record.notes ?? ''),
        phone: loanObj?.customerId?.phone ?? '',
        assignedTo: String(record.assignedTo ?? ''),
        promiseAmount: fromMinor(Number(record.promiseAmountMinor ?? 0)),
        promiseDueAt: String(record.promiseDueAt ?? '').slice(0, 10),
      }
    })
  },

  listDisbursements: async () => {
    const response = await apiRequest<Array<Record<string, unknown>> | { data: Array<Record<string, unknown>> }>('/api/v1/finance/disbursements')
    const records = Array.isArray(response) ? response : (response.data ?? [])
    return records.map((record) => {
      const loanObj = typeof record.loanAccountId === 'object' && record.loanAccountId !== null ? (record.loanAccountId as any) : null
      const customerObj = loanObj?.customerId && typeof loanObj.customerId === 'object' ? loanObj.customerId : null
      return {
        id: String(record._id ?? record.id ?? ''),
        loan: String(loanObj?._id ?? record.loanAccountId ?? ''),
        applicationId: String((record.applicationId as any)?._id ?? record.applicationId ?? ''),
        customer: String(customerObj?.name ?? customerObj?.customerNumber ?? 'Borrower'),
        amount: fromMinor(Number(record.amountMinor ?? 0)),
        branch: String(record.branchId ?? ''),
        method: String(record.method ?? ''),
        status: String(record.status ?? 'authorized'),
        state: record.status === 'completed' ? 'Completed' : record.status === 'cancelled' ? 'Cancelled' : 'Authorized',
        created: String(record.createdAt ?? '').slice(0, 10),
        authorizedAt: String(record.authorizedAt ?? record.createdAt ?? '').slice(0, 19).replace('T',' '),
        completedAt: record.completedAt ? String(record.completedAt).slice(0, 19).replace('T',' ') : '',
        cancelledAt: record.cancelledAt ? String(record.cancelledAt).slice(0, 19).replace('T',' ') : '',
        authorizedBy: String(record.authorizedByName ?? record.authorizedBy ?? ''),
        completedBy: String(record.completedByName ?? record.completedBy ?? ''),
        cancelledBy: String(record.cancelledByName ?? record.cancelledBy ?? ''),
        reference: String(record.reference ?? record.idempotencyKey ?? ''),
        idempotencyKey: String(record.idempotencyKey ?? ''),
        notes: String(record.notes ?? ''),
      }
    })
  },
  executeDisbursementRecord: (id: string) => apiRequest(`/api/v1/finance/disbursements/${encodeURIComponent(id)}/execute`, { method: 'POST' }),
  cancelDisbursementRecord: (id: string, reason: string) => apiRequest(`/api/v1/finance/disbursements/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  updateCollection: (id: string, input: { status?: 'open' | 'contacted' | 'promise_to_pay' | 'escalated' | 'resolved'; notes?: string; assignedTo?: string; assignedToName?: string; followUpAt?: string; promiseAmountMinor?: number; promiseDueAt?: string }) =>
    apiRequest(`/api/v1/collections/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  updateCollectionFollowup: (id: string, notes: string, status = 'contacted') =>
    apiRequest<Record<string, unknown>>(`/api/v1/collections/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ notes, status }) }),

  listTransactions: async (): Promise<Transaction[]> => {
    const response = await apiRequest<Array<Record<string, unknown>> | { data: Array<Record<string, unknown>> }>('/api/v1/finance/journal')
    const records = Array.isArray(response) ? response : (response.data ?? [])
    return records.map((record) => {
      const lines = (record.lines as Array<{ debitMinor?: number; creditMinor?: number; account?: string }> | undefined) ?? []
      const totalMinor = lines.reduce((sum, line) => sum + (Number(line.debitMinor) || 0), 0)
      return {
        id: String(record._id ?? ''),
        type: String(record.sourceType ?? 'Transaction').replace(/_/g, ' ') as Transaction['type'],
        reference: String(record.sourceId ?? record._id ?? ''),
        customer: 'General Ledger',
        amount: fromMinor(totalMinor),
        method: lines[0]?.account ?? 'Journal',
        date: String(record.postedAt ?? record.createdAt ?? '').slice(0, 10),
        status: 'Completed',
        recordedBy: 'Finance System',
      }
    })
  },

  listStaff: async (): Promise<StaffMember[]> => {
    try {
      const response = await apiRequest<{ data: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>('/api/v1/auth/users')
      const records = Array.isArray(response) ? response : (response.data ?? [])
      return records.map((record) => ({
        id: String(record.id ?? record._id ?? ''),
        name: String(record.name ?? 'Staff Member'),
        email: String(record.email ?? ''),
        phone: String(record.phone ?? ''),
        role: Array.isArray(record.roles) ? (record.roles as string[]).join(', ') : 'Staff',
        branch: Array.isArray(record.branchIds) && (record.branchIds as unknown[]).length ? String((record.branchIds as string[])[0]) : '—',
        lastActive: '—',
        status: String(record.status ?? 'active') === 'active' ? 'Active' : 'Suspended',
      }))
    } catch {
      const response = await apiRequest<{ data: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>('/api/v1/organisation/staff')
      const records = Array.isArray(response) ? response : (response.data ?? [])
      return records.map((record) => {
        const userObj = typeof record.userId === 'object' && record.userId !== null ? (record.userId as { name?: string; email?: string; status?: string; _id?: string }) : null
        return {
          id: String(userObj?._id ?? record.userId ?? record._id ?? ''),
          name: userObj?.name ?? 'Staff Member',
          email: userObj?.email ?? '',
          phone: '',
          role: Array.isArray(record.roles) ? (record.roles as string[]).join(', ') : 'Staff',
          branch: 'Kampala Central',
          lastActive: String(record.updatedAt ?? record.createdAt ?? '').slice(0, 10),
          status: String(userObj?.status ?? record.status ?? 'active') === 'active' ? 'Active' : 'Suspended',
        }
      })
    }
  },

  createStaffUser: (input: { name: string; email: string; password: string; phone?: string; roles: string[]; branchIds?: string[] }) =>
    apiRequest<{ data?: unknown }>('/api/v1/auth/users', { method: 'POST', body: JSON.stringify(input) }),

  listBranches: async (): Promise<BranchRecord[]> => {
    const response = await apiRequest<{ data: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>('/api/v1/organisation/branches')
    const records = Array.isArray(response) ? response : (response.data ?? [])
    return records.map((record) => ({
      id: String(record._id ?? record.id ?? record.code ?? ''),
      branchId: String(record._id ?? record.id ?? ''),
      code: String(record.code ?? ''),
      name: String(record.name ?? ''),
      district: String(record.district ?? ''),
      managerId: String(record.managerId ?? ''),
      managerName: String(record.managerName ?? ''),
      manager: String(record.managerName ?? record.managerId ?? '—'),
      staff: String(record.staffCount ?? '0'),
      activeLoans: String(record.activeLoans ?? '0'),
      status: String(record.status ?? 'active') === 'active' ? 'Active' : 'Suspended',
      settings: (record.settings as Record<string, unknown> | undefined) ?? {},
      createdAt: String(record.createdAt ?? ''),
      updatedAt: String(record.updatedAt ?? ''),
    }))
  },

  updateCustomerStatus: (id: string, status: 'active' | 'inactive' | 'watchlist' | 'archived', version = 1) =>
    apiRequest<Customer>(`/api/v1/customers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status, version }) }),

  createBranch: (input: { code: string; name: string; district: string; managerId?: string }) =>
    apiRequest<BranchRecord>('/api/v1/organisation/branches', { method: 'POST', body: JSON.stringify(input) }),

  updateBranch: (id: string, input: { code?: string; name?: string; district?: string; managerId?: string | null; status?: 'active' | 'suspended'; settings?: Record<string, unknown> }) =>
    apiRequest<BranchRecord>(`/api/v1/organisation/branches/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),

  updateStaffUser: (id: string, input: { name?: string; email?: string; phone?: string; roles?: string[]; status?: string }) =>
    apiRequest<{ data?: unknown }>(`/api/v1/auth/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),

  updateLoanProduct: (id: string, input: { name?: string; status?: 'draft' | 'active' | 'inactive'; terms?: { minAmountMinor?: number; maxAmountMinor?: number; annualRateBps?: number; interestMethod?: 'flat' | 'declining_balance'; repaymentFrequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly'; minTenureMonths?: number; maxTenureMonths?: number; gracePeriodDays?: number } }) =>
    apiRequest(`/api/v1/loan-products/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  updateChartAccount: (id: string, input: { name?: string; active?: boolean }) =>
    apiRequest<{ _id?: string }>(`/api/v1/finance/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),

  listAuditLogs: async (): Promise<Array<Record<string, unknown>>> => {
    const response = await apiRequest<{ data: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>('/api/v1/audit')
    const records = Array.isArray(response) ? response : (response.data ?? [])
    return records.map((record) => ({
      id: String(record._id ?? ''),
      action: String(record.action ?? 'Activity'),
      description: `${String(record.action ?? '')} on ${String(record.entityType ?? 'record')}`,
      actor: String(record.actorId ?? 'System'),
      record: String(record.entityId ?? ''),
      branch: String(record.branchId ?? 'General'),
      date: String(record.createdAt ?? '').slice(0, 19).replace('T', ' '),
    }))
  },

  reportSummary: (query = '') => apiRequest<Record<string, unknown>>(`/api/v1/reports/summary${query}`),
  dashboardSummary: (query = '') => apiRequest<{ activeLoans: number; confirmedRepaymentsMinor: number; overdueLoans: number; generatedAt: string }>(`/api/v1/reports/dashboard${query}`),

  createCustomer: async (input: Partial<Customer>) => {
    const record = await apiRequest<BackendCustomer>('/api/v1/customers', {
      method: 'POST',
      body: JSON.stringify({
        branchId: branchId(),
        name: input.name,
        phone: input.phone,
        email: input.email,
        address: input.address,
        district: input.district,
        idType: input.idType,
        nationalId: input.nationalId,
        occupation: input.occupation,
        employer: input.employer,
        monthlyIncomeMinor: toMinor(Number(input.monthlyIncome ?? 0)),
        nextOfKin: input.nextOfKin,
        nextOfKinRelationship: input.nextOfKinRelationship,
        nextOfKinPhone: input.nextOfKinPhone,
        dateOfBirth: input.dateOfBirth,
      }),
    })
    return mapCustomer(record)
  },

  updateCustomer: async (id: string, input: Partial<Customer> & { version: number }) => {
    const bId = branchId()
    const record = await apiRequest<BackendCustomer>(`/api/v1/customers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        version: input.version,
        ...(bId ? { branchId: bId } : {}),
        name: input.name,
        phone: input.phone,
        email: input.email,
        address: input.address,
        district: input.district,
        idType: input.idType,
        nationalId: input.nationalId,
        occupation: input.occupation,
        employer: input.employer,
        monthlyIncomeMinor: toMinor(Number(input.monthlyIncome ?? 0)),
        nextOfKin: input.nextOfKin,
        nextOfKinRelationship: input.nextOfKinRelationship,
        nextOfKinPhone: input.nextOfKinPhone,
        dateOfBirth: input.dateOfBirth,
      }),
    })
    return mapCustomer(record)
  },

  createProduct: async (input: Partial<LoanProduct> & { code?: string }) => {
    const record = await apiRequest<BackendProduct>('/api/v1/loan-products', {
      method: 'POST',
      body: JSON.stringify({
        code: String((input as any).code || `${String(input.name ?? 'PRODUCT').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 12)}-${Date.now()}`),
        name: input.name,
        category: 'individual',
        approvalLimitMinor: toMinor(Number(input.maxAmount ?? 0)),
        terms: {
          minAmountMinor: toMinor(Number(input.minAmount ?? 0)),
          maxAmountMinor: toMinor(Number(input.maxAmount ?? 0)),
          annualRateBps: Math.round(Number(input.interestRate ?? 0) * 100),
          interestMethod: /flat/i.test(input.interestMethod ?? '') ? 'flat' : 'declining_balance',
          repaymentFrequency: input.frequency === 'Daily' ? 'daily' : input.frequency === 'Weekly' ? 'weekly' : input.frequency === 'Bi-weekly' ? 'biweekly' : 'monthly',
          minTenureMonths: 1,
          maxTenureMonths: Number(input.duration ?? 1),
          gracePeriodDays: Number(input.gracePeriod ?? 0),
          fees: [],
          requiredDocuments: String(input.requiredDocuments ?? '').split(',').map((item) => item.trim()).filter(Boolean),
        },
      }),
    })
    return mapProduct(record)
  },

  updateProductStatus: (id: string, status: 'active' | 'inactive' | 'draft') =>
    apiRequest<BackendProduct>(`/api/v1/loan-products/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  submitApplication: (input: { customerId: string; productId: string; amount: number; duration: number; purpose: string; income: number; obligations: number }) =>
    apiRequest<Application>('/api/v1/applications', {
      method: 'POST',
      body: JSON.stringify({
        branchId: branchId(),
        customerId: input.customerId,
        productId: input.productId,
        amountMinor: toMinor(input.amount),
        tenureMonths: input.duration,
        purpose: input.purpose,
        incomeMinor: toMinor(input.income),
        obligationsMinor: toMinor(input.obligations),
      }),
    }),

  recordDisbursement: async (input: { loanRef: string; applicationId: string; branchId: string; amount: number; date: string; method: string; reference?: string; idempotencyKey?: string }) => {
    const idem = input.idempotencyKey || input.reference || `disb-${Date.now()}`
    const payload = { loanAccountId: input.loanRef, applicationId: input.applicationId, branchId: input.branchId, amountMinor: toMinor(input.amount), idempotencyKey: idem, disbursedAt: input.date, method: input.method, reference: input.reference }
    const auth = await apiRequest<any>('/api/v1/finance/disbursements', { method: 'POST', body: JSON.stringify(payload) })
    const authId = auth?.id ?? auth?._id ?? auth?.data?.id ?? auth?.data?._id
    if (!authId) return auth
    try {
      return await apiRequest<any>(`/api/v1/finance/disbursements/${encodeURIComponent(String(authId))}/execute`, { method: 'POST' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (/already|completed|exists/i.test(msg)) return auth
      throw e
    }
  },

  recordRepayment: (input: { loanAccountId: string; amount: number; method: string; reference?: string; branchId?: string }) =>
    apiRequest<Repayment>('/api/v1/finance/payments', {
      method: 'POST',
      body: JSON.stringify({ branchId: input.branchId ?? branchId(), loanAccountId: input.loanAccountId, amountMinor: toMinor(input.amount), method: input.method, ...(input.reference ? { reference: input.reference } : {}) }),
    }),

  cancelApplication: (id: string, reason: string, version: number) =>
    apiRequest(`/api/v1/applications/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify({ reason, version }) }),

  reverseRepayment: (id: string, reason: string) =>
    apiRequest(`/api/v1/finance/payments/${encodeURIComponent(id)}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) }),

  loanLifecycle: (id: string, type: 'restructure' | 'refinance' | 'write_off' | 'settle' | 'penalty', reason: string) =>
    apiRequest(`/api/v1/finance/loans/${encodeURIComponent(id)}/lifecycle`, { method: 'POST', body: JSON.stringify({ type, reason }) }),
  requestLoanPlan: (id: string, type: 'reschedule_request' | 'payment_plan_request', reason: string, extra: { requestedDate?: string; notes?: string } = {}) =>
    apiRequest(`/api/v1/finance/loans/${encodeURIComponent(id)}/request-plan`, { method: 'POST', body: JSON.stringify({ type, reason, ...extra }) }),
  withdrawApplication: (id: string, reason: string, version: number) =>
    apiRequest(`/api/v1/applications/${encodeURIComponent(id)}/withdraw`, { method: 'POST', body: JSON.stringify({ reason, version }) }),
  transitionApplication: (id: string, status: 'under_review' | 'assessment_required' | 'info_requested' | 'approval_pending', reason: string, version: number) =>
    apiRequest(`/api/v1/applications/${encodeURIComponent(id)}/transition`, { method: 'POST', body: JSON.stringify({ status, reason, version }) }),
  addApplicationComment: (id: string, body: string, kind = 'review') =>
    apiRequest(`/api/v1/applications/${encodeURIComponent(id)}/comments`, { method: 'POST', body: JSON.stringify({ body, kind }) }),
  addApplicationAttachment: (id: string, input: { name: string; reference: string; kind?: string }) =>
    apiRequest(`/api/v1/applications/${encodeURIComponent(id)}/attachments`, { method: 'POST', body: JSON.stringify(input) }),
  getApplicationAttachmentSignature: (id: string, input: { mimeType: string; size: number }) =>
    apiRequest<Record<string, unknown>>(`/api/v1/applications/${encodeURIComponent(id)}/attachments/upload-signature`, { method: 'POST', body: JSON.stringify(input) }),
  saveApplicationAttachment: (id: string, input: { name: string; kind?: string; reference: string; storageKey?: string; mimeType?: string; size?: number }) =>
    apiRequest(`/api/v1/applications/${encodeURIComponent(id)}/attachments/upload`, { method: 'POST', body: JSON.stringify(input) }),

  applyLoanPlan: (id: string, type: 'reschedule' | 'payment_plan', reason: string, count = 1, unit: 'day' | 'month' = 'day', startDate?: string) =>
    apiRequest(`/api/v1/finance/loans/${encodeURIComponent(id)}/apply-plan`, { method: 'POST', body: JSON.stringify({ type, reason, count, unit, ...(startDate ? { startDate } : {}) }) }),

  authorizeDisbursement: (input: { loanAccountId: string; applicationId: string; branchId?: string; amount: number; method?: string; reference?: string; notes?: string; idempotencyKey: string }) =>
    apiRequest(`/api/v1/finance/disbursements/authorize`, { method: 'POST', body: JSON.stringify({ applicationId: input.applicationId, loanAccountId: input.loanAccountId, branchId: input.branchId ?? branchId(), amountMinor: toMinor(input.amount), method: input.method, reference: input.reference, notes: input.notes, idempotencyKey: input.idempotencyKey }) }),

  executeDisbursement: (id: string) =>
    apiRequest(`/api/v1/finance/disbursements/${encodeURIComponent(id)}/execute`, { method: 'POST' }),

  resetStaffPassword: (id: string) =>
    apiRequest<{ resetToken?: string; email?: string }>(`/api/v1/auth/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST' }),

}

export const apiContractNote = 'All financial records are persisted and validated by the authenticated backend.'
