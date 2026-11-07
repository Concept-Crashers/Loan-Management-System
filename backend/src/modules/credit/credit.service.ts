import { CustomerModel } from '../customers/customer.model.js'
import { ApplicationModel } from '../applications/application.model.js'
import { LoanAccountModel, RepaymentScheduleModel, PaymentModel } from '../finance/finance.model.js'

export type CreditFactor = { code: string; label: string; impact: 'positive' | 'neutral' | 'negative'; points: number; value?: unknown }
export type CreditResult = { score: number; grade: string; riskLevel: 'low' | 'medium' | 'high' | 'very_high'; recommendation: 'approve' | 'review' | 'decline'; factors: CreditFactor[]; riskIndicators: string[]; modelVersion: string; calculatedAt: Date; incomeMinor: number; existingExposureMinor: number; repaymentCapacityMinor: number }

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const band = (score: number): { grade: string; riskLevel: CreditResult['riskLevel']; recommendation: CreditResult['recommendation'] } =>
  score >= 75 ? { grade: 'A', riskLevel: 'low', recommendation: 'approve' } :
  score >= 60 ? { grade: 'B', riskLevel: 'medium', recommendation: 'review' } :
  score >= 45 ? { grade: 'C', riskLevel: 'high', recommendation: 'review' } :
  { grade: 'D', riskLevel: 'very_high', recommendation: 'decline' }

export async function calculateInternalCredit(input: { tenantId: string; customerId: string; applicationId?: string }) {
  const [customer, application, loans, payments] = await Promise.all([
    CustomerModel.findOne({ _id: input.customerId, tenantId: input.tenantId }).select('status kycStatus monthlyIncomeMinor dateOfBirth name').lean(),
    input.applicationId ? ApplicationModel.findOne({ _id: input.applicationId, tenantId: input.tenantId }).lean() : Promise.resolve(null),
    LoanAccountModel.find({ tenantId: input.tenantId, customerId: input.customerId }).lean(),
    PaymentModel.find({ tenantId: input.tenantId, status: { $in: ['confirmed', 'reversed'] } }).lean().catch(() => []),
  ])
  if (!customer) throw Object.assign(new Error('Customer not found for credit scoring.'), { status: 404, code: 'CUSTOMER_NOT_FOUND' })
  const loanIds = loans.map((l: any) => String(l._id))
  const schedules = loanIds.length ? await RepaymentScheduleModel.find({ tenantId: input.tenantId, loanAccountId: { $in: loanIds } }).lean() : []
  const customerPayments = (payments as any[]).filter((p) => loanIds.includes(String(p.loanAccountId)))

  const factors: CreditFactor[] = []
  const riskIndicators: string[] = []
  let score = 50 // base: neutral thin file

  // KYC / identity
  if (String((customer as any).kycStatus) === 'verified') { score += 8; factors.push({ code: 'KYC_VERIFIED', label: 'KYC verified', impact: 'positive', points: 8 }) }
  else { score -= 8; factors.push({ code: 'KYC_PENDING', label: 'KYC not verified', impact: 'negative', points: -8, value: (customer as any).kycStatus }); riskIndicators.push('KYC not verified') }

  if (String((customer as any).status) !== 'active') { score -= 12; factors.push({ code: 'CUSTOMER_INACTIVE', label: 'Customer not active', impact: 'negative', points: -12, value: (customer as any).status }); riskIndicators.push('Customer not active') }

  const incomeMinor = Number((application as any)?.incomeMinor ?? (customer as any).monthlyIncomeMinor ?? 0)
  const obligationsMinor = Number((application as any)?.obligationsMinor ?? 0)
  const activeLoans = loans.filter((l: any) => ['active', 'in_arrears', 'pending_disbursement'].includes(String(l.status)))
  const existingExposureMinor = activeLoans.reduce((s: number, l: any) => s + Number(l.outstandingPrincipalMinor ?? 0) + Number(l.outstandingInterestMinor ?? 0) + Number(l.outstandingFeesMinor ?? 0), 0)
  const repaymentCapacityMinor = Math.max(0, incomeMinor - obligationsMinor)

  // Affordability / DTI
  if (incomeMinor > 0) {
    const dti = obligationsMinor / incomeMinor
    if (dti <= 0.3) { score += 10; factors.push({ code: 'DTI_LOW', label: 'Low debt-to-income ratio', impact: 'positive', points: 10, value: Math.round(dti * 100) }) }
    else if (dti <= 0.5) { score += 2; factors.push({ code: 'DTI_MODERATE', label: 'Moderate debt-to-income ratio', impact: 'neutral', points: 2, value: Math.round(dti * 100) }) }
    else { score -= 12; factors.push({ code: 'DTI_HIGH', label: 'High debt-to-income ratio', impact: 'negative', points: -12, value: Math.round(dti * 100) }); riskIndicators.push('High debt-to-income ratio') }
  } else { score -= 6; factors.push({ code: 'NO_INCOME', label: 'No income recorded', impact: 'negative', points: -6 }); riskIndicators.push('No income recorded') }

  // Requested amount affordability (application context)
  if (application && incomeMinor > 0) {
    const requested = Number((application as any).amountMinor ?? 0)
    const multiple = requested / incomeMinor
    if (multiple <= 2) { score += 4; factors.push({ code: 'REQUEST_AFFORDABLE', label: 'Requested amount affordable vs income', impact: 'positive', points: 4, value: +multiple.toFixed(2) }) }
    else if (multiple <= 5) { factors.push({ code: 'REQUEST_MODERATE', label: 'Requested amount moderate vs income', impact: 'neutral', points: 0, value: +multiple.toFixed(2) }) }
    else { score -= 8; factors.push({ code: 'REQUEST_HIGH', label: 'Requested amount high vs income', impact: 'negative', points: -8, value: +multiple.toFixed(2) }); riskIndicators.push('Requested amount high vs income') }
  }

  // Internal repayment history
  if (!loans.length) {
    factors.push({ code: 'THIN_FILE', label: 'No prior loan history (thin file)', impact: 'neutral', points: 0 })
  } else {
    const settled = loans.filter((l: any) => l.status === 'settled').length
    const writtenOff = loans.filter((l: any) => l.status === 'written_off').length
    const restructured = loans.filter((l: any) => l.status === 'restructured').length
    const inArrears = loans.filter((l: any) => l.status === 'in_arrears').length
    if (settled > 0) { score += clamp(settled * 4, 0, 12); factors.push({ code: 'SETTLED_LOANS', label: 'Settled loans on record', impact: 'positive', points: clamp(settled * 4, 0, 12), value: settled }) }
    if (writtenOff > 0) { score -= 20; factors.push({ code: 'WRITTEN_OFF', label: 'Written-off loan(s)', impact: 'negative', points: -20, value: writtenOff }); riskIndicators.push('Prior written-off loan') }
    if (restructured > 0) { score -= 6; factors.push({ code: 'RESTRUCTURED', label: 'Restructured loan(s)', impact: 'negative', points: -6, value: restructured }); riskIndicators.push('Prior restructured loan') }
    if (inArrears > 0) { score -= 15; factors.push({ code: 'IN_ARREARS', label: 'Loan(s) currently in arrears', impact: 'negative', points: -15, value: inArrears }); riskIndicators.push('Current loan in arrears') }

    const overdue = schedules.filter((s: any) => s.status === 'overdue').length
    const paid = schedules.filter((s: any) => s.status === 'paid').length
    const totalSched = schedules.length
    if (overdue > 0) { score -= clamp(overdue * 3, 3, 15); factors.push({ code: 'OVERDUE_INSTALLMENTS', label: 'Overdue installments', impact: 'negative', points: -clamp(overdue * 3, 3, 15), value: overdue }); riskIndicators.push('Overdue installments present') }
    if (totalSched >= 3 && paid / totalSched >= 0.8) { score += 8; factors.push({ code: 'STRONG_REPAYMENT', label: 'Strong installment repayment history', impact: 'positive', points: 8, value: `${paid}/${totalSched}` }) }

    const reversed = customerPayments.filter((p: any) => p.status === 'reversed').length
    if (reversed > 0) { score -= clamp(reversed * 2, 2, 8); factors.push({ code: 'REVERSED_PAYMENTS', label: 'Reversed payment(s)', impact: 'negative', points: -clamp(reversed * 2, 2, 8), value: reversed }) }

    if (activeLoans.length >= 3) { score -= 6; factors.push({ code: 'MULTI_ACTIVE_LOANS', label: 'Multiple active loans', impact: 'negative', points: -6, value: activeLoans.length }); riskIndicators.push('Multiple active loans') }
  }

  score = clamp(Math.round(score), 0, 100)
  const b = band(score)
  return {
    score, grade: b.grade, riskLevel: b.riskLevel, recommendation: b.recommendation,
    factors, riskIndicators, modelVersion: 'internal-v1', calculatedAt: new Date(),
    incomeMinor, existingExposureMinor, repaymentCapacityMinor,
  } as CreditResult
}
