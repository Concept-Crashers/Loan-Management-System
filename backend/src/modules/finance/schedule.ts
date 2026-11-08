import type { ClientSession } from 'mongoose'
import { RepaymentScheduleModel } from './finance.model.js'

export type ProductTerms = {
  annualRateBps?: number
  rateBps?: number
  interestBasis?: 'annual' | 'term' | 'monthly'
  interestMethod: 'flat' | 'declining_balance'
  repaymentFrequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  minTenureMonths?: number
  maxTenureMonths?: number
  fees?: Array<{ amountMinor?: number; amount?: number }>
}

export function effectiveRateBps(terms: Pick<ProductTerms,'annualRateBps'|'rateBps'>) {
  return Number(terms.rateBps ?? terms.annualRateBps ?? 0)
}

export function interestRateLabel(terms: Pick<ProductTerms,'annualRateBps'|'rateBps'|'interestBasis'>) {
  const pct = effectiveRateBps(terms) / 100
  const basis = terms.interestBasis ?? (terms.rateBps != null ? 'term' : 'annual')
  const suffix = basis === 'term' ? 'per term' : basis === 'monthly' ? 'per month' : 'p.a.'
  return `${pct.toLocaleString()}% ${suffix}`
}

function addPeriod(date: Date, frequency: ProductTerms['repaymentFrequency']) {
  const result = new Date(date)
  if (frequency === 'daily') result.setDate(result.getDate() + 1)
  else if (frequency === 'weekly') result.setDate(result.getDate() + 7)
  else if (frequency === 'biweekly') result.setDate(result.getDate() + 14)
  else result.setMonth(result.getMonth() + 1)
  return result
}

export function schedulePeriods(terms: Pick<ProductTerms,'repaymentFrequency'>, tenureMonths: number) {
  return terms.repaymentFrequency === 'daily' ? tenureMonths * 30 : terms.repaymentFrequency === 'weekly' ? tenureMonths * 4 : terms.repaymentFrequency === 'biweekly' ? tenureMonths * 2 : tenureMonths
}

export function computeTermInterestMinor(principalMinor: number, terms: Pick<ProductTerms,'annualRateBps'|'rateBps'|'interestBasis'|'interestMethod'>, tenureMonths: number) {
  const months = Math.max(1, Math.floor(tenureMonths || 1))
  const bps = effectiveRateBps(terms)
  const basis = terms.interestBasis ?? (terms.rateBps != null ? 'term' : 'annual')
  // Uganda/term products: "term" means the full interest for the loan term is fixed and due regardless of early repayment.
  // e.g. 10,000 at 20% for 1 month => 2,000 interest; paying in 2 weeks still owes 12,000 total.
  let factor = 0
  if (basis === 'term') factor = bps / 10_000
  else if (basis === 'monthly') factor = (bps / 10_000) * months
  else factor = (bps / 10_000) * (months / 12) // annual, backward compatible
  const raw = Math.max(0, Math.round(principalMinor * factor))
  // Fixed term basis: full agreed interest remains due even if repaid early (common Uganda short-term lending).
  if (basis === 'term') return raw
  if (terms.interestMethod === 'declining_balance') return Math.max(0, Math.round(raw / 2))
  return raw
}

export function computeTermFeeMinor(terms: Pick<ProductTerms,'fees'>) {
  return (terms.fees ?? []).reduce((sum, fee) => sum + Number(fee.amountMinor ?? fee.amount ?? 0), 0)
}

export async function generateRepaymentSchedule(account: {
  id: string
  tenantId: string
  branchId: string
  principalMinor: number
  productSnapshot: ProductTerms
}, tenureMonths: number, session?: ClientSession) {
  const terms = account.productSnapshot
  const periods = schedulePeriods(terms, tenureMonths)
  const totalInterest = computeTermInterestMinor(account.principalMinor, terms, tenureMonths)
  const feeTotal = computeTermFeeMinor(terms)
  const rows = Array.from({ length: periods }, (_, index) => {
    const principal = Math.floor(account.principalMinor / periods) + (index < account.principalMinor % periods ? 1 : 0)
    const interest = Math.floor(totalInterest / periods) + (index < totalInterest % periods ? 1 : 0)
    const fees = Math.floor(feeTotal / periods) + (index < feeTotal % periods ? 1 : 0)
    const dueDate = new Date()
    for (let i = 0; i <= index; i++) {
      const next = addPeriod(dueDate, terms.repaymentFrequency)
      dueDate.setTime(next.getTime())
    }
    return { tenantId: account.tenantId, branchId: account.branchId, loanAccountId: account.id, installmentNumber: index + 1, dueDate, principalMinor: principal, interestMinor: interest, feesMinor: fees, totalMinor: principal + interest + fees }
  })
  return RepaymentScheduleModel.insertMany(rows, { session })
}

