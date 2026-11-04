import { apiRequest, getAuthenticatedUser } from './api'
import type { Application, Customer, LoanAccount, LoanProduct, Repayment } from './types'

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
    repaymentFrequency: 'weekly' | 'biweekly' | 'monthly'
    minTenureMonths: number
    maxTenureMonths: number
    gracePeriodDays: number
    fees: unknown[]
    requiredDocuments: string[]
  }
}

const branchId = () => {
  const id = getAuthenticatedUser()?.branchIds[0]
  if (!id) throw new Error('Your account has no assigned branch. Ask an administrator to assign one.')
  return id
}
const identifier = (record: { _id?: string; id?: string }) => record.id ?? record._id ?? ''
const fromMinor = (value: number | undefined) => (value ?? 0) / 100
const toMinor = (value: number) => Math.round(value * 100)

function mapCustomer(record: BackendCustomer): Customer {
  return {
    id: record.customerNumber ?? identifier(record),
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
  return {
    id: identifier(record),
    name: record.name,
    description: `${record.category} loan`,
    minAmount: fromMinor(record.terms.minAmountMinor),
    maxAmount: fromMinor(record.terms.maxAmountMinor),
    interestRate: record.terms.annualRateBps / 100,
    interestMethod: record.terms.interestMethod,
    duration: record.terms.maxTenureMonths,
    frequency: record.terms.repaymentFrequency === 'biweekly' ? 'Bi-weekly' : record.terms.repaymentFrequency === 'weekly' ? 'Weekly' : 'Monthly',
    gracePeriod: record.terms.gracePeriodDays,
    requiredDocuments: record.terms.requiredDocuments.join(', '),
    active: record.status === 'active',
  }
}

export const api = {
  listCustomers: async () => (await apiRequest<BackendCustomer[]>(`/api/v1/customers?branchId=${encodeURIComponent(branchId())}`)).map(mapCustomer),
  listProducts: async () => (await apiRequest<BackendProduct[]>('/api/v1/loan-products')).map(mapProduct),
  listApplications: async (): Promise<Application[]> => {
    const records = await apiRequest<Array<Record<string, unknown>>>('/api/v1/applications')
    return records.map((record) => ({
      id: String(record._id ?? record.id ?? ''),
      customer: String(record.customerName ?? record.customer ?? record.customerId ?? ''),
      customerId: String(record.customerId ?? ''),
      product: String(record.productName ?? record.product ?? record.productId ?? ''),
      amount: fromMinor(Number(record.amountMinor ?? 0)),
      duration: Number(record.tenureMonths ?? 0),
      status: String(record.status ?? 'submitted').replaceAll('_', ' ') as Application['status'],
      submitted: String(record.createdAt ?? '').slice(0, 10),
      income: fromMinor(Number(record.incomeMinor ?? 0)),
      officer: String(record.officerId ?? ''),
      purpose: String(record.purpose ?? ''),
      obligations: fromMinor(Number(record.obligationsMinor ?? 0)),
    }))
  },
  listLoans: async (): Promise<LoanAccount[]> => {
    const records = await apiRequest<Array<Record<string, unknown>>>('/api/v1/finance/loans')
    return records.map((record) => ({
      ref: String(record.ref ?? record._id ?? ''),
      applicationId: String(record.applicationId ?? ''),
      branchId: String(record.branchId ?? ''),
      customer: String(record.customer ?? record.customerName ?? ''),
      customerId: String(record.customerId ?? ''),
      product: String(record.product ?? ''),
      principal: fromMinor(Number(record.principalMinor ?? 0)),
      disbursed: fromMinor(Number(record.disbursedMinor ?? record.principalMinor ?? 0)),
      paid: fromMinor(Number(record.paidMinor ?? 0)),
      outstanding: fromMinor(Number(record.outstandingMinor ?? Number(record.outstandingPrincipalMinor ?? 0) + Number(record.outstandingInterestMinor ?? 0) + Number(record.outstandingFeesMinor ?? 0))),
      interest: fromMinor(Number(record.outstandingInterestMinor ?? 0)),
      start: String(record.start ?? ''),
      maturity: String(record.maturity ?? ''),
      status: record.status === 'in_arrears' ? 'Overdue' : record.status === 'settled' ? 'Fully Paid' : record.status === 'active' ? 'Active' : 'Pending Disbursement',
      nextDue: String(record.nextDue ?? 'Schedule pending'),
    }))
  },
  listRepayments: async (): Promise<Repayment[]> => {
    const records = await apiRequest<Array<Record<string, unknown>>>('/api/v1/finance/payments')
    return records.map((record) => ({
      id: String(record._id ?? record.id ?? ''),
      customer: String(record.customer ?? ''),
      customerId: String(record.customerId ?? ''),
      loan: String(record.loanAccountId ?? ''),
      amount: fromMinor(Number(record.amountMinor ?? 0)),
      method: String(record.method ?? 'Other') as Repayment['method'],
      reference: String(record.reference ?? ''),
      date: String(record.createdAt ?? '').slice(0, 10),
      receivedBy: String(record.confirmedBy ?? ''),
      status: record.status === 'reversed' ? 'Reversed' : record.status === 'confirmed' ? 'Successful' : 'Pending review',
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
  createProduct: async (input: Partial<LoanProduct>) => {
    const record = await apiRequest<BackendProduct>('/api/v1/loan-products', {
      method: 'POST',
      body: JSON.stringify({
        code: `${String(input.name ?? 'PRODUCT').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 12)}-${Date.now()}`,
        name: input.name,
        category: 'individual',
        approvalLimitMinor: toMinor(Number(input.maxAmount ?? 0)),
        terms: {
          minAmountMinor: toMinor(Number(input.minAmount ?? 0)),
          maxAmountMinor: toMinor(Number(input.maxAmount ?? 0)),
          annualRateBps: Math.round(Number(input.interestRate ?? 0) * 100),
          interestMethod: /flat/i.test(input.interestMethod ?? '') ? 'flat' : 'declining_balance',
          repaymentFrequency: input.frequency === 'Weekly' ? 'weekly' : input.frequency === 'Bi-weekly' ? 'biweekly' : 'monthly',
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
  recordDisbursement: (input: { loanRef: string; applicationId: string; branchId: string; amount: number; date: string; method: string; reference: string }) =>
    apiRequest<{ account: { ref?: string; _id?: string }; transaction: unknown }>('/api/v1/finance/disbursements', {
      method: 'POST',
      body: JSON.stringify({ loanAccountId: input.loanRef, applicationId: input.applicationId, branchId: input.branchId, amountMinor: toMinor(input.amount), idempotencyKey: input.reference, disbursedAt: input.date, method: input.method, reference: input.reference }),
    }),
  recordRepayment: (input: { loanAccountId: string; amount: number; method: string; reference: string; branchId?: string }) =>
    apiRequest<Repayment>('/api/v1/finance/payments', {
      method: 'POST',
      body: JSON.stringify({ branchId: input.branchId ?? branchId(), loanAccountId: input.loanAccountId, amountMinor: toMinor(input.amount), method: input.method, reference: input.reference }),
    }),
}

export const mockApi = api
export const apiContractNote = 'All financial values are converted to minor units and persisted by the authenticated backend.'
