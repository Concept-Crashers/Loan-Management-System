import { applications, customers, loans, products, repayments, transactions } from '../data/mock-data'
import type { Application, Customer, LoanProduct, Repayment } from './types'

const pause = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms))

export const mockApi = {
  async listCustomers(): Promise<Customer[]> { await pause(); return [...customers] },
  async listApplications(): Promise<Application[]> { await pause(); return [...applications] },
  async listLoans() { await pause(); return [...loans] },
  async listRepayments(): Promise<Repayment[]> { await pause(); return [...repayments] },
  async listProducts() { await pause(); return [...products] },
  async createProduct(input: Partial<LoanProduct>): Promise<LoanProduct> {
    await pause(300)
    const record: LoanProduct = {
      id: `PRD-${String(products.length + 1).padStart(3, '0')}`, name: input.name ?? 'New loan product',
      description: input.description ?? '', minAmount: Number(input.minAmount ?? 0), maxAmount: Number(input.maxAmount ?? 0),
      interestRate: Number(input.interestRate ?? 0), interestMethod: input.interestMethod ?? 'Product-configured', duration: Number(input.duration ?? 1),
      frequency: input.frequency ?? 'Monthly', gracePeriod: Number(input.gracePeriod ?? 0), fees: input.fees ?? '', lateRule: input.lateRule ?? '',
      requiredDocuments: input.requiredDocuments ?? '', active: true,
    }
    products.unshift(record)
    return record
  },
  async createCustomer(input: Partial<Customer>): Promise<Customer> {
    await pause(300)
    const record: Customer = {
      id: `CUS-${Math.floor(2500 + Math.random() * 400)}`,
      name: input.name ?? 'New borrower', phone: input.phone ?? '', email: input.email ?? '',
      district: input.district ?? 'Kampala', town: input.town ?? 'Kampala', loans: 0, outstanding: 0,
      status: 'Active', registered: new Date().toISOString().slice(0, 10), dateOfBirth: input.dateOfBirth,
      idType: input.idType, nationalId: input.nationalId ?? '', occupation: input.occupation ?? '',
      employer: input.employer ?? '', monthlyIncome: Number(input.monthlyIncome ?? 0), nextOfKin: input.nextOfKin ?? '',
      nextOfKinRelationship: input.nextOfKinRelationship, nextOfKinPhone: input.nextOfKinPhone ?? '', address: input.address ?? '',
    }
    customers.unshift(record)
    return record
  },
  async submitApplication(input: Partial<Application>): Promise<Application> {
    await pause(300)
    const record: Application = {
      id: `APP-2026-${String(315 + applications.length).padStart(4, '0')}`,
      customer: input.customer ?? 'Selected borrower', customerId: input.customerId ?? 'CUS-0000',
      product: input.product ?? 'Business Growth', amount: Number(input.amount ?? 0), duration: Number(input.duration ?? 12),
      status: 'Submitted', submitted: new Date().toISOString().slice(0, 10), income: Number(input.income ?? 0),
      officer: 'Sarah Kiconko', purpose: input.purpose ?? '', obligations: Number(input.obligations ?? 0),
    }
    applications.unshift(record)
    return record
  },
  async recordRepayment(input: Partial<Repayment>): Promise<Repayment> {
    await pause(300)
    const record: Repayment = {
      id: `RCT-2026-${String(842 + repayments.length).padStart(4, '0')}`,
      customer: input.customer ?? 'Selected borrower', customerId: input.customerId ?? 'CUS-0000', loan: input.loan ?? 'LN-2026-0000',
      amount: Number(input.amount ?? 0), method: input.method ?? 'Cash', reference: input.reference ?? 'DEMO-REF',
      date: input.date ?? new Date().toISOString().slice(0, 10), receivedBy: 'Paul Wekesa', status: input.status ?? 'Successful',
    }
    repayments.unshift(record)
    return record
  },
  async recordDisbursement(input: { loanRef: string; amount: number; date: string; method: string; reference: string }) {
    await pause(300)
    const account = loans.find((item) => item.ref === input.loanRef)
    if (!account) throw new Error('Loan reference was not found in the demo dataset.')
    account.status = 'Active'
    account.disbursed = input.amount
    account.start = input.date
    account.nextDue = 'Schedule pending from service'
    const transaction = {
      id: `TXN-${String(715 + transactions.length).padStart(5, '0')}`, type: 'Disbursement' as const,
      reference: account.ref, customer: account.customer, amount: input.amount, date: input.date, method: input.method,
      status: 'Completed' as const, recordedBy: 'Paul Wekesa',
    }
    transactions.unshift(transaction)
    return { account: { ...account }, transaction }
  },
}

export const apiContractNote = 'Replace mockApi methods with authenticated backend requests. Server responses own balances, interest, schedules, approvals, allocations and financial records.'
