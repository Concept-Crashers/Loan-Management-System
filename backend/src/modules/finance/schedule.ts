import type { ClientSession } from 'mongoose'
import { RepaymentScheduleModel } from './finance.model.js'

type ProductTerms = {
  annualRateBps: number
  interestMethod: 'flat' | 'declining_balance'
  repaymentFrequency: 'weekly' | 'biweekly' | 'monthly'
  fees?: Array<{ amountMinor?: number; amount?: number }>
}

function addPeriod(date: Date, frequency: ProductTerms['repaymentFrequency']) {
  const result = new Date(date)
  if (frequency === 'weekly') result.setDate(result.getDate() + 7)
  else if (frequency === 'biweekly') result.setDate(result.getDate() + 14)
  else result.setMonth(result.getMonth() + 1)
  return result
}

export async function generateRepaymentSchedule(account: {
  id: string
  tenantId: string
  branchId: string
  principalMinor: number
  productSnapshot: ProductTerms
}, tenureMonths: number, session?: ClientSession) {
  const terms = account.productSnapshot
  const periods = terms.repaymentFrequency === 'weekly' ? tenureMonths * 4 : terms.repaymentFrequency === 'biweekly' ? tenureMonths * 2 : tenureMonths
  const totalInterest = terms.interestMethod === 'flat'
    ? Math.round(account.principalMinor * terms.annualRateBps / 10_000 * tenureMonths / 12)
    : Math.round(account.principalMinor * (terms.annualRateBps / 10_000) * tenureMonths / 12 / 2)
  const feeTotal = (terms.fees ?? []).reduce((sum, fee) => sum + Number(fee.amountMinor ?? fee.amount ?? 0), 0)
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
