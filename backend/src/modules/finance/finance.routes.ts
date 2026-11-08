import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute, HttpError } from '../../core/http.js'
import { assertBranchAccess, branchFilter, currentUser } from '../../core/scope.js'
import { recordAudit } from '../audit/audit.service.js'
import { TenantSettingsModel } from '../organisation/settings.model.js'
import { LoanAccountModel, PaymentModel, JournalModel, DisbursementModel, CashbookModel, LoanEventModel, ChartAccountModel, AccountingPeriodModel, RepaymentScheduleModel } from './finance.model.js'
import mongoose from 'mongoose'
import { ApplicationModel } from '../applications/application.model.js'
import { pagination, paged } from '../../core/pagination.js'
import { computeTermFeeMinor, computeTermInterestMinor, interestRateLabel } from './schedule.js'

const router = Router()
router.use(requireAuth)

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const loanTermMonths = (loan: any) => {
  const appMonths = Number(loan?.applicationId?.tenureMonths ?? loan?.application?.tenureMonths ?? 0)
  if (Number.isFinite(appMonths) && appMonths > 0) return Math.floor(appMonths)
  const snap = loan?.productSnapshot ?? {}
  const max = Number(snap.maxTenureMonths ?? snap.minTenureMonths ?? 1)
  return Number.isFinite(max) && max > 0 ? Math.floor(max) : 1
}
const loanInterestTotalMinor = (loan: any, schedule?: any[]) => {
  const fromSchedule = Array.isArray(schedule) && schedule.length ? schedule.reduce((sum, r) => sum + Number(r.interestMinor ?? 0), 0) : 0
  if (fromSchedule > 0) return fromSchedule
  const terms = loan?.productSnapshot ?? {}
  return computeTermInterestMinor(Number(loan?.principalMinor ?? 0), terms as any, loanTermMonths(loan))
}
const loanFeeTotalMinor = (loan: any, schedule?: any[]) => {
  const fromSchedule = Array.isArray(schedule) && schedule.length ? schedule.reduce((sum, r) => sum + Number(r.feesMinor ?? 0), 0) : 0
  if (fromSchedule > 0) return fromSchedule
  return computeTermFeeMinor(loan?.productSnapshot ?? {})
}
const loanTotals = (loan: any, schedule?: any[]) => {
  const interestMinor = loanInterestTotalMinor(loan, schedule)
  const feesMinor = loanFeeTotalMinor(loan, schedule)
  const totalRepayableMinor = (Array.isArray(schedule) && schedule.length ? schedule.reduce((s, r) => s + Number(r.totalMinor ?? 0), 0) : 0) || (Number(loan?.principalMinor ?? 0) + interestMinor + feesMinor)
  return { interestMinor, feesMinor, totalRepayableMinor }
}
const accrueFixedTermCharges = (loan: any, schedule?: any[]) => {
  const interestTotal = loanInterestTotalMinor(loan, schedule)
  const feeTotal = loanFeeTotalMinor(loan, schedule)
  // Fixed term/flat interest is due for the agreed term (Uganda workflow): accrue the full term charge regardless of early repayment timing.
  const interestAccrued = Number(loan.outstandingInterestMinor ?? 0) === 0 && !['settled', 'written_off', 'closed'].includes(String(loan.status ?? '')) ? Math.max(0, interestTotal) : 0
  const feeAccrued = Number(loan.outstandingFeesMinor ?? 0) === 0 && !['settled', 'written_off', 'closed'].includes(String(loan.status ?? '')) ? Math.max(0, feeTotal) : 0
  if (interestAccrued) loan.outstandingInterestMinor = interestAccrued
  if (feeAccrued) loan.outstandingFeesMinor = feeAccrued
  return { interestAccrued, feeAccrued, interestTotal, feeTotal }
}
const effectiveOutstanding = (loan: any) => Number(loan.outstandingPrincipalMinor ?? 0) + Number(loan.outstandingInterestMinor ?? 0) + Number(loan.outstandingFeesMinor ?? 0)
const receiptTheme = (kind: 'payment' | 'disbursement' | 'statement', orgName: string, currency: string, primary: string, secondary: string, logoUrl?: string) => {
  const safeOrg = esc(orgName || 'Trust Loans')
  const p = /^#[0-9a-f]{3,8}$/i.test(primary || '') ? primary : '#091426'
  const s = /^#[0-9a-f]{3,8}$/i.test(secondary || '') ? secondary : '#316bf3'
  const accent = kind === 'payment' ? '#28a094' : kind === 'statement' ? '#316bf3' : '#316bf3'
  const logo = logoUrl && /^https?:\/\//i.test(logoUrl)
    ? `<img src="${esc(logoUrl)}" alt="${safeOrg} logo" style="width:40px;height:40px;object-fit:contain;border-radius:10px;background:rgba(255,255,255,.14);padding:4px" />`
    : `<span aria-label="${safeOrg} logo" style="width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,.14);display:grid;place-items:center;flex:0 0 auto"><svg width="26" height="26" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="28" height="28" rx="8" fill="rgba(255,255,255,.16)"/><path d="M9 21.5V12.8c0-.44.36-.8.8-.8h2.1c.44 0 .8.36.8.8v8.7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M14.95 21.5v-11c0-.44.36-.8.8-.8h2.1c.44 0 .8.36.8.8v11" stroke="#d3e4fe" stroke-width="2.2" stroke-linecap="round"/><path d="M20.9 21.5v-6.1c0-.44.36-.8.8-.8h1.5c.44 0 .8.36.8.8v6.1" stroke="#99f6e4" stroke-width="2.2" stroke-linecap="round"/><path d="M8.5 22.2h15" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg></span>`
  return { orgName: safeOrg, currency: esc(currency || 'UGX'), primary: p, secondary: s, accent, logo }
}

async function receiptBrand(tenantId: string) {
  const settings = await TenantSettingsModel.findOne({ tenantId }).select('organisation.name branding.logoUrl branding.primaryColor branding.secondaryColor branding.currency').lean().catch(() => null) as any
  return {
    orgName: String(settings?.organisation?.name || 'Trust Loans'),
    currency: String(settings?.branding?.currency || 'UGX'),
    primary: String(settings?.branding?.primaryColor || '#091426'),
    secondary: String(settings?.branding?.secondaryColor || '#316bf3'),
    logoUrl: String(settings?.branding?.logoUrl || ''),
  }
}

async function openPeriod(tenantId: string, branchId: string, at = new Date()) {
  const period = await AccountingPeriodModel.findOne({ tenantId, branchId, status: 'open', periodStart: { $lte: at }, periodEnd: { $gte: at } })
  if (!period) throw new HttpError(409, 'ACCOUNTING_PERIOD_NOT_OPEN', 'An open accounting period is required for this transaction.')
  return period
}
router.get('/loans/:id', requirePermission('loans.accounts.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const loan = await LoanAccountModel.findOne({ _id: request.params.id, tenantId: user.tenantId }).populate('customerId', 'name customerNumber phone').lean()
  if (!loan) throw new HttpError(404, 'LOAN_ACCOUNT_NOT_FOUND', 'Loan account was not found.')
  assertBranchAccess(request, loan.branchId)
  response.json({ success: true, message: 'Loan account retrieved successfully', data: loan })
}))

router.get('/loans/:id/statement', requirePermission('loans.accounts.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const loan = await LoanAccountModel.findOne({ _id: request.params.id, tenantId: user.tenantId }).populate('customerId', 'name customerNumber phone').lean()
  if (!loan) throw new HttpError(404, 'LOAN_NOT_FOUND', 'Loan account was not found.')
  assertBranchAccess(request, loan.branchId)
  const [schedule, payments, disbursements] = await Promise.all([
    RepaymentScheduleModel.find({ tenantId: user.tenantId, loanAccountId: loan._id }).sort({ installmentNumber: 1 }).lean(),
    PaymentModel.find({ tenantId: user.tenantId, loanAccountId: loan._id }).sort({ createdAt: 1 }).lean(),
    DisbursementModel.find({ tenantId: user.tenantId, loanAccountId: loan._id }).sort({ createdAt: 1 }).lean(),
  ])
  const totalInterestMinor = (schedule as any[]).reduce((s, r) => s + Number(r.interestMinor ?? 0), 0) || loanInterestTotalMinor(loan as any, schedule as any[])
  const totalRepayableMinor = (schedule as any[]).reduce((s, r) => s + Number(r.totalMinor ?? 0), 0) || (Number(loan.principalMinor ?? 0) + totalInterestMinor + loanFeeTotalMinor(loan as any, schedule as any[]))
  const confirmedPaidMinor = payments.filter((p: any) => p.status === 'confirmed').reduce((s, p: any) => s + Number(p.amountMinor ?? 0), 0)
  const paymentDueMinor = Math.max(0, totalRepayableMinor - confirmedPaidMinor)
  response.json({ success: true, message: 'Loan statement retrieved successfully', data: { loan, schedule, payments, disbursements, summary: { principalMinor: Number(loan.principalMinor ?? 0), confirmedPaidMinor, totalInterestMinor, totalRepayableMinor, paymentDueMinor } } })
}))
router.get('/payments/:id', requirePermission('repayments.capture'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const payment = await PaymentModel.findOne({ _id: request.params.id, tenantId: user.tenantId }).lean()
  if (!payment) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment was not found.')
  assertBranchAccess(request, payment.branchId)
  response.json({ success: true, message: 'Payment retrieved successfully', data: payment })
}))
router.get('/loans', requirePermission('loans.accounts.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  const page = pagination(request)
  const filter = { tenantId: user.tenantId, ...branchFilter(request, branchId) }
  const total = await LoanAccountModel.countDocuments(filter)
  const loans = await LoanAccountModel.find(filter).populate('customerId', 'name customerNumber').populate('applicationId','tenureMonths').sort({ createdAt: -1 }).skip(page.skip).limit(page.pageSize).lean()
  const loanIds = loans.map((l: any) => l._id)
  const [schedules, paidAgg] = loanIds.length ? await Promise.all([
    RepaymentScheduleModel.aggregate([{ $match: { tenantId: user.tenantId, loanAccountId: { $in: loanIds } } }, { $group: { _id: '$loanAccountId', interestMinor: { $sum: '$interestMinor' }, feesMinor: { $sum: '$feesMinor' }, totalMinor: { $sum: '$totalMinor' } } }]),
    PaymentModel.aggregate([{ $match: { tenantId: user.tenantId, loanAccountId: { $in: loanIds }, status: 'confirmed' } }, { $group: { _id: '$loanAccountId', paidMinor: { $sum: '$amountMinor' } } }]),
  ]) : [[], []]
  const schedByLoan = new Map(schedules.map((r: any) => [String(r._id), r]))
  const paidByLoan = new Map((paidAgg as any[]).map((r) => [String(r._id), Number(r.paidMinor ?? 0)]))
  const data = loans.map((loan: any) => {
    const customer = (loan.customerId ?? {}) as Record<string, string>
    const sched = schedByLoan.get(String(loan._id))
    const totals = loanTotals(loan, sched ? [sched] : undefined)
    const totalInterestMinor = totals.interestMinor
    const totalFeesMinor = totals.feesMinor
    const totalRepayableMinor = totals.totalRepayableMinor
    const confirmedPaidMinor = paidByLoan.get(String(loan._id)) ?? 0
    const paymentDueMinor = Math.max(0, totalRepayableMinor - confirmedPaidMinor)
    const principalOut = Number(loan.outstandingPrincipalMinor ?? 0)
    const interestOut = Number(loan.outstandingInterestMinor ?? 0) > 0 || ['settled','written_off','closed'].includes(String(loan.status)) ? Number(loan.outstandingInterestMinor ?? 0) : (paymentDueMinor > 0 ? Math.max(0, totalInterestMinor) : 0)
    const feesOut = Number(loan.outstandingFeesMinor ?? 0) > 0 || ['settled','written_off','closed'].includes(String(loan.status)) ? Number(loan.outstandingFeesMinor ?? 0) : (paymentDueMinor > 0 ? Math.max(0, totalFeesMinor) : 0)
    return { ...loan, ref: String(loan._id), applicationId: String((loan.applicationId as any)?._id ?? loan.applicationId), customerId: String(customer?._id ?? loan.customerId), customer: customer.name ?? customer.customerNumber ?? '', outstandingMinor: paymentDueMinor, paymentDueMinor, confirmedPaidMinor, outstandingPrincipalMinor: principalOut, outstandingInterestMinor: interestOut, outstandingFeesMinor: feesOut, totalInterestMinor, totalRepayableMinor }
  })
  response.json({ success: true, message: 'Loan accounts retrieved successfully', data, meta: { page: page.page, pageSize: page.pageSize, total } })
}))
router.get('/payments', requirePermission('repayments.capture'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  const page = pagination(request)
  const filter = { tenantId: user.tenantId, ...branchFilter(request, branchId), ...(request.query.status ? { status: String(request.query.status) } : {}) }
  const result = await paged(PaymentModel, filter, page)
  const data = await PaymentModel.find(filter).populate({ path: 'loanAccountId', populate: { path: 'customerId', select: 'name customerNumber' } }).sort({ createdAt: -1 }).skip(page.skip).limit(page.pageSize).lean()
  response.json({ success: true, message: 'Repayments retrieved successfully', data, meta: result.meta })
}))
router.get('/schedules', requirePermission('loans.accounts.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  const filter = { tenantId: user.tenantId, ...branchFilter(request, branchId) }
  const data = await RepaymentScheduleModel.find(filter)
    .populate({ path: 'loanAccountId', populate: { path: 'customerId', select: 'name customerNumber' } })
    .sort({ dueDate: 1 })
    .limit(200)
    .lean()
  response.json({ success: true, message: 'Repayment schedules retrieved successfully', data })
}))
router.get('/journal', requirePermission('accounting.journal.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  const result = await paged(JournalModel, { tenantId: user.tenantId, ...branchFilter(request, branchId) }, pagination(request))
  response.json({ success: true, message: 'Journal entries retrieved successfully', ...result })
}))
router.get('/ledger', requirePermission('accounting.journal.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  const filter = { tenantId: user.tenantId, ...branchFilter(request, branchId), ...(request.query.periodId ? { periodId: request.query.periodId } : {}), ...(request.query.account ? { 'lines.account': String(request.query.account) } : {}) }
  const result = await paged(JournalModel, filter, pagination(request), { postedAt: 1 })
  response.json({ success: true, message: 'General ledger retrieved successfully', ...result })
}))
router.get('/ledger/export', requirePermission('reports.export'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  if (branchId) assertBranchAccess(request, branchId)
  const filter = { tenantId: user.tenantId, ...(branchId ? { branchId } : { branchId: { $in: user.branchIds } }), ...(request.query.periodId ? { periodId: request.query.periodId } : {}), ...(request.query.account ? { 'lines.account': String(request.query.account) } : {}) }
  const entries = await JournalModel.find(filter).sort({ postedAt: 1 }).lean()
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const rows = ['postedAt,sourceType,sourceId,account,debitMinor,creditMinor']
  for (const entry of entries) for (const line of entry.lines as Array<{ account: string; debitMinor?: number; creditMinor?: number }>) {
    if (request.query.account && line.account !== request.query.account) continue
    rows.push([entry.postedAt?.toISOString(), entry.sourceType, entry.sourceId, line.account, line.debitMinor ?? 0, line.creditMinor ?? 0].map(escape).join(','))
  }
  response.type('text/csv').setHeader('Content-Disposition', 'attachment; filename="general-ledger.csv"').send(rows.join('\n'))
}))
router.get('/trial-balance', requirePermission('accounting.journal.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  if (branchId) assertBranchAccess(request, branchId)
  const match = { tenantId: user.tenantId, ...(branchId ? { branchId } : { branchId: { $in: user.branchIds } }), ...(request.query.periodId ? { periodId: request.query.periodId } : {}) }
  const rows = await JournalModel.aggregate([
    { $match: match },
    { $unwind: '$lines' },
    { $group: { _id: '$lines.account', debitMinor: { $sum: '$lines.debitMinor' }, creditMinor: { $sum: '$lines.creditMinor' } } },
    { $sort: { _id: 1 } },
  ])
  response.json({ success: true, message: 'Trial balance retrieved successfully', data: rows.map((row) => ({ account: row._id, debitMinor: row.debitMinor, creditMinor: row.creditMinor, balanceMinor: row.debitMinor - row.creditMinor })) })
}))
router.get('/cashbook', requirePermission('accounting.journal.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  if (branchId) assertBranchAccess(request, branchId)
  const result = await paged(CashbookModel, { tenantId: user.tenantId, ...(branchId ? { branchId } : { branchId: { $in: user.branchIds } }) }, pagination(request))
  response.json({ success: true, message: 'Cashbook entries retrieved successfully', ...result })
}))
router.get('/accounts', requirePermission('accounting.journal.view'), asyncRoute(async (request: AuthRequest, response) => {
  const result = await paged(ChartAccountModel, { tenantId: currentUser(request).tenantId }, pagination(request), { code: 1 })
  response.json({ success: true, message: 'Chart of accounts retrieved successfully', ...result })
}))
router.post('/accounts', requirePermission('accounting.journal.create'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ code: z.string().regex(/^[a-z0-9_.-]{2,40}$/), name: z.string().min(2).max(120), type: z.enum(['asset', 'liability', 'equity', 'income', 'expense']) }).parse(request.body)
  const account = await ChartAccountModel.create({ ...input, tenantId: currentUser(request).tenantId })
  response.status(201).json({ success: true, message: 'Chart account created', data: account })
}))
router.patch('/accounts/:id', requirePermission('accounting.journal.create'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ name: z.string().min(2).max(120).optional(), active: z.boolean().optional() }).parse(request.body)
  const user = currentUser(request)
  const account = await ChartAccountModel.findOneAndUpdate({ _id: request.params.id, tenantId: user.tenantId }, { $set: input }, { new: true })
  if (!account) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Chart account was not found.')
  await recordAudit({ user, action: 'chart_account.updated', entityType: 'chart_account', entityId: account.id, next: input })
  response.json({ success: true, message: 'Chart account updated', data: account })
}))
router.get('/periods', requirePermission('accounting.journal.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  if (branchId) assertBranchAccess(request, branchId)
  const result = await paged(AccountingPeriodModel, { tenantId: user.tenantId, ...(branchId ? { branchId } : { branchId: { $in: user.branchIds } }) }, pagination(request), { periodStart: -1 })
  response.json({ success: true, message: 'Accounting periods retrieved successfully', ...result })
}))
router.post('/periods', requirePermission('accounting.reconciliation.manage'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ branchId: z.string(), periodStart: z.coerce.date(), periodEnd: z.coerce.date() }).refine((value) => value.periodEnd >= value.periodStart, { message: 'periodEnd must be on or after periodStart', path: ['periodEnd'] }).parse(request.body)
  const user = currentUser(request); assertBranchAccess(request, input.branchId)
  const overlap = await AccountingPeriodModel.exists({ tenantId: user.tenantId, branchId: input.branchId, periodStart: { $lte: input.periodEnd }, periodEnd: { $gte: input.periodStart } })
  if (overlap) throw new HttpError(409, 'ACCOUNTING_PERIOD_OVERLAP', 'The accounting period overlaps an existing period.')
  const period = await AccountingPeriodModel.create({ ...input, tenantId: user.tenantId, openedBy: user.id })
  const defaults = [
    ['cash', 'Cash', 'asset'], ['loan_receivable', 'Loan receivable', 'asset'], ['payables', 'Payables', 'liability'],
    ['retained_earnings', 'Retained earnings', 'equity'], ['interest_income', 'Interest income', 'income'], ['fee_income', 'Fee income', 'income'],
    ['operating_expenses', 'Operating expenses', 'expense'],
  ] as const
  await ChartAccountModel.bulkWrite(defaults.map(([code, name, type]) => ({
    updateOne: { filter: { tenantId: user.tenantId, code }, update: { $setOnInsert: { tenantId: user.tenantId, code, name, type, system: true } }, upsert: true },
  })))
  response.status(201).json({ success: true, message: 'Accounting period opened', data: period })
}))
router.post('/periods/:id/close', requirePermission('accounting.reconciliation.manage'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const period = await AccountingPeriodModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!period) throw new HttpError(404, 'ACCOUNTING_PERIOD_NOT_FOUND', 'Accounting period was not found.')
  assertBranchAccess(request, period.branchId)
  if (period.status === 'closed') throw new HttpError(409, 'ACCOUNTING_PERIOD_CLOSED', 'Accounting period is already closed.')
  const openCashbook = await CashbookModel.exists({ tenantId: user.tenantId, branchId: period.branchId, status: 'open', createdAt: { $gte: period.periodStart, $lte: period.periodEnd } })
  if (openCashbook) throw new HttpError(409, 'OPEN_CASHBOOK_ENTRIES', 'Settle all cashbook entries before closing the period.')
  const totals = await JournalModel.aggregate([
    { $match: { tenantId: user.tenantId, branchId: period.branchId, periodId: period._id } },
    { $unwind: '$lines' },
    { $lookup: { from: 'chartaccounts', let: { account: '$lines.account' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$tenantId', user.tenantId] }, { $eq: ['$code', '$$account'] }] } } }], as: 'account' } },
    { $unwind: '$account' },
    { $group: { _id: { code: '$account.code', type: '$account.type' }, debitMinor: { $sum: '$lines.debitMinor' }, creditMinor: { $sum: '$lines.creditMinor' } } },
  ])
  const incomeLines = totals.filter((row) => row._id.type === 'income').map((row) => ({ account: row._id.code, debitMinor: Math.max(0, row.creditMinor - row.debitMinor) })).filter((line) => line.debitMinor > 0)
  const expenseLines = totals.filter((row) => row._id.type === 'expense').map((row) => ({ account: row._id.code, creditMinor: Math.max(0, row.debitMinor - row.creditMinor) })).filter((line) => line.creditMinor > 0)
  const incomeMinor = incomeLines.reduce((sum, line) => sum + line.debitMinor, 0)
  const expenseMinor = expenseLines.reduce((sum, line) => sum + line.creditMinor, 0)
  const closingLines = [...incomeLines, ...(incomeMinor ? [{ account: 'retained_earnings', creditMinor: incomeMinor }] : []), ...(expenseMinor ? [{ account: 'retained_earnings', debitMinor: expenseMinor }] : []), ...expenseLines]
  const closingEntry = closingLines.length ? await JournalModel.create({ tenantId: user.tenantId, branchId: period.branchId, periodId: period.id, sourceType: 'period_close', sourceId: period.id, lines: closingLines }) : null
  period.status = 'closed'; period.closedBy = user.id; period.closedAt = new Date(); await period.save()
  await recordAudit({ user, action: 'accounting.period.closed', entityType: 'accounting_period', entityId: period.id, branchId: period.branchId, next: { status: period.status } })
  response.json({ success: true, message: 'Accounting period closed', data: { period, closingEntry } })
}))
router.post('/cashbook/:id/settle', requirePermission('accounting.reconciliation.manage'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const entry = await CashbookModel.findOneAndUpdate({ _id: request.params.id, tenantId: user.tenantId, branchId: { $in: user.branchIds }, status: 'open' }, { $set: { status: 'settled', settledAt: new Date(), settledBy: user.id } }, { new: true })
  if (!entry) throw new HttpError(404, 'CASHBOOK_ENTRY_NOT_FOUND', 'Open cashbook entry was not found.')
  await recordAudit({ user, action: 'cashbook.settled', entityType: 'cashbook_entry', entityId: entry.id, branchId: entry.branchId, next: { status: entry.status } })
  response.json({ success: true, message: 'Cashbook entry settled', data: entry })
}))
router.post('/loans/:id/lifecycle', requirePermission('loans.accounts.manage'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ type: z.enum(['restructure', 'refinance', 'write_off', 'settle', 'penalty']), reason: z.string().min(3), metadata: z.record(z.string(), z.unknown()).optional() }).parse(request.body)
  const user = currentUser(request)
  const loan = await LoanAccountModel.findOne({ _id: request.params.id, tenantId: user.tenantId, branchId: { $in: user.branchIds } })
  if (!loan) throw new HttpError(404, 'LOAN_ACCOUNT_NOT_FOUND', 'Loan account was not found.')
  if (input.type === 'write_off') loan.status = 'written_off'
  if (input.type === 'settle') loan.status = 'settled'
  if (input.type === 'restructure') loan.status = 'restructured'
  await loan.save()
  const event = await LoanEventModel.create({ tenantId: user.tenantId, branchId: loan.branchId, loanAccountId: loan.id, type: input.type, reason: input.reason, metadata: input.metadata, createdBy: user.id })
  await recordAudit({ user, action: `loan.${input.type}`, entityType: 'loan_account', entityId: loan.id, branchId: loan.branchId, next: { status: loan.status, reason: input.reason } })
  response.status(201).json({ success: true, message: `Loan ${input.type} recorded`, data: { loan, event } })
}))
router.post('/journal', requirePermission('accounting.journal.create'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ branchId: z.string(), periodId: z.string(), sourceType: z.string().min(2), sourceId: z.string().min(1), lines: z.array(z.object({ account: z.string().min(2), debitMinor: z.number().int().nonnegative().default(0), creditMinor: z.number().int().nonnegative().default(0) })).min(2) }).parse(request.body)
  const user = currentUser(request); assertBranchAccess(request, input.branchId)
  const period = await AccountingPeriodModel.findOne({ _id: input.periodId, tenantId: user.tenantId, branchId: input.branchId, status: 'open' })
  if (!period) throw new HttpError(409, 'ACCOUNTING_PERIOD_NOT_OPEN', 'Journal entries must be posted to an open accounting period.')
  const accountCodes = input.lines.map((line) => line.account)
  const accountCount = await ChartAccountModel.countDocuments({ tenantId: user.tenantId, code: { $in: accountCodes }, active: true })
  if (accountCount !== new Set(accountCodes).size) throw new HttpError(400, 'ACCOUNT_NOT_FOUND', 'Every journal line must reference an active chart account.')
  const debit = input.lines.reduce((sum, line) => sum + line.debitMinor, 0)
  const credit = input.lines.reduce((sum, line) => sum + line.creditMinor, 0)
  if (debit === 0 || debit !== credit || input.lines.some((line) => line.debitMinor > 0 && line.creditMinor > 0)) throw new HttpError(400, 'UNBALANCED_JOURNAL', 'Journal debits and credits must balance and each line must have one side.')
  const entry = await JournalModel.create({ ...input, tenantId: user.tenantId })
  await recordAudit({ user, action: 'journal.created', entityType: 'journal_entry', entityId: entry.id, branchId: input.branchId, next: { sourceType: input.sourceType, debitMinor: debit } })
  response.status(201).json({ success: true, message: 'Journal entry created', data: entry })
}))
router.post('/payments', requirePermission('repayments.capture'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ branchId: z.string(), loanAccountId: z.string(), reference: z.string().trim().optional(), amountMinor: z.number().int().positive(), method: z.string().min(2) }).parse(request.body)
  const user = currentUser(request)
  assertBranchAccess(request, input.branchId)
  const loan = await LoanAccountModel.findOne({ _id: input.loanAccountId, tenantId: user.tenantId, branchId: input.branchId })
  if (!loan) throw new HttpError(404, 'LOAN_ACCOUNT_NOT_FOUND', 'Loan account was not found in the selected branch.')
  const method = input.method.trim()
  const isCash = /^cash$/i.test(method)
  const reference = (input.reference?.trim() || (isCash ? `CASH-RCT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}` : ''))
  if (!reference || (!isCash && reference.length < 3)) throw new HttpError(400, 'REFERENCE_REQUIRED', 'A transaction/reference number is required for non-cash payments.')
  const existing = await PaymentModel.findOne({ tenantId: user.tenantId, reference })
  if (existing) throw new HttpError(409, 'DUPLICATE_PAYMENT', 'This payment reference already exists.')
  const payment = await PaymentModel.create({ ...input, method, reference, tenantId: user.tenantId })
  await recordAudit({ user, action: 'repayment.captured', entityType: 'repayment', entityId: payment.id, branchId: input.branchId, next: { status: payment.status, amountMinor: payment.amountMinor } })
  response.status(201).json({ success: true, message: 'Repayment captured pending verification', data: payment })
}))

router.post(['/disbursements/authorize', '/disbursements'], requirePermission('loans.disburse.authorize'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ applicationId: z.string(), loanAccountId: z.string(), branchId: z.string(), amountMinor: z.number().int().positive(), idempotencyKey: z.string().min(8), method: z.string().trim().min(2).max(80).optional(), reference: z.string().trim().max(120).optional(), notes: z.string().trim().max(1000).optional() }).parse(request.body)
  const user = currentUser(request)
  assertBranchAccess(request, input.branchId)
  const existing = await DisbursementModel.findOne({ tenantId: user.tenantId, idempotencyKey: input.idempotencyKey })
  if (existing) {
    response.status(200).json({ success: true, message: 'Disbursement authorization already exists', data: existing })
    return
  }
  const application = await ApplicationModel.findOne({ _id: input.applicationId, tenantId: user.tenantId, branchId: input.branchId })
  const loan = await LoanAccountModel.findOne({ _id: input.loanAccountId, tenantId: user.tenantId, branchId: input.branchId, applicationId: input.applicationId })
  if (!application || application.status !== 'approved' || !loan) throw new HttpError(409, 'DISBURSEMENT_NOT_ALLOWED', 'Only an approved application with a matching loan account can be disbursed.')
  if (input.amountMinor !== loan.principalMinor || loan.status !== 'pending_disbursement') throw new HttpError(409, 'INVALID_DISBURSEMENT_AMOUNT', 'Disbursement amount or loan state is invalid.')
  const method = (input.method ?? '').trim()
  const isCash = /^cash$/i.test(method)
  const reference = (input.reference?.trim() || (isCash ? `CASH-DISB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}` : input.idempotencyKey))
  if (!isCash && !reference) throw new HttpError(400, 'REFERENCE_REQUIRED', 'A transaction/bank reference is required for non-cash disbursements.')
  const authorization = await DisbursementModel.create({ ...input, tenantId: user.tenantId, authorizedBy: user.id, authorizedAt: new Date(), method, reference, notes: input.notes ?? '' })
  await recordAudit({ user, action: 'disbursement.authorized', entityType: 'disbursement', entityId: authorization.id, branchId: input.branchId, next: { amountMinor: input.amountMinor, method, reference } })
  response.status(201).json({ success: true, message: 'Disbursement authorized', data: authorization })
}))

router.post(['/disbursements/:id/execute', '/disbursements/:id/complete'], requirePermission('loans.disburse.execute'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const session = await mongoose.startSession()
  let result: unknown
  try {
    await session.withTransaction(async () => {
      const disbursement = await DisbursementModel.findOne({ _id: request.params.id, tenantId: user.tenantId }).session(session)
      if (!disbursement) throw new HttpError(404, 'DISBURSEMENT_NOT_FOUND', 'Disbursement authorization was not found.')
      assertBranchAccess(request, disbursement.branchId)
      if (disbursement.status === 'completed') { result = disbursement.toObject(); return }
      if (disbursement.status !== 'authorized') throw new HttpError(409, 'INVALID_DISBURSEMENT_STATE', 'This disbursement cannot be executed.')
      const loan = await LoanAccountModel.findOne({ _id: disbursement.loanAccountId, tenantId: user.tenantId, branchId: disbursement.branchId }).session(session)
      if (!loan || loan.status !== 'pending_disbursement') throw new HttpError(409, 'INVALID_LOAN_STATE', 'The loan is not awaiting disbursement.')
      const application = await ApplicationModel.findOne({ _id: loan.applicationId, tenantId: user.tenantId }).select('tenureMonths').lean().session(session) as any
      const schedule = await RepaymentScheduleModel.find({ tenantId: user.tenantId, loanAccountId: loan.id }).lean().session(session)
      const loanForTerms = application?.tenureMonths ? { ...(loan.toObject() as any), applicationId: { _id: loan.applicationId, tenureMonths: application.tenureMonths } } : loan
      const { interestAccrued, feeAccrued } = accrueFixedTermCharges(loanForTerms as any, schedule as any[])
      if (interestAccrued) loan.outstandingInterestMinor = Number(loan.outstandingInterestMinor ?? 0) + interestAccrued
      if (feeAccrued) loan.outstandingFeesMinor = Number(loan.outstandingFeesMinor ?? 0) + feeAccrued
      loan.status = 'active'; loan.version += 1
      disbursement.status = 'completed'; disbursement.completedBy = user.id; disbursement.completedAt = new Date()
      await loan.save({ session }); await disbursement.save({ session })
      const period = await openPeriod(user.tenantId, disbursement.branchId)
      await JournalModel.create([{ tenantId: user.tenantId, branchId: disbursement.branchId, periodId: period.id, sourceType: 'disbursement', sourceId: disbursement.id, lines: [{ account: 'loan_receivable', debitMinor: disbursement.amountMinor }, { account: 'cash', creditMinor: disbursement.amountMinor }] }], { session })
      if (interestAccrued > 0) await JournalModel.create([{ tenantId: user.tenantId, branchId: disbursement.branchId, periodId: period.id, sourceType: 'interest_accrual', sourceId: String(loan._id), lines: [{ account: 'loan_receivable', debitMinor: interestAccrued }, { account: 'interest_income', creditMinor: interestAccrued }] }], { session })
      if (feeAccrued > 0) await JournalModel.create([{ tenantId: user.tenantId, branchId: disbursement.branchId, periodId: period.id, sourceType: 'fee_accrual', sourceId: String(loan._id), lines: [{ account: 'loan_receivable', debitMinor: feeAccrued }, { account: 'fee_income', creditMinor: feeAccrued }] }], { session })
      await recordAudit({ user, action: 'disbursement.completed', entityType: 'disbursement', entityId: disbursement.id, branchId: disbursement.branchId, next: { status: disbursement.status, interestAccruedMinor: interestAccrued, feeAccruedMinor: feeAccrued, outstandingMinor: effectiveOutstanding(loan) }, session })
      result = disbursement.toObject()
    })
  } finally { await session.endSession() }
  response.json({ success: true, message: 'Disbursement completed', data: result })
}))
router.post('/payments/:id/confirm', requirePermission('repayments.confirm'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const session = await mongoose.startSession()
  let result: { payment: unknown; loan: unknown }
  try {
    await session.withTransaction(async () => {
      const payment = await PaymentModel.findOne({ _id: request.params.id, tenantId: user.tenantId }).session(session)
      if (!payment || payment.status !== 'pending_verification') throw new HttpError(409, 'INVALID_PAYMENT_STATE', 'Only pending payments can be confirmed.')
      const loan = await LoanAccountModel.findOne({ _id: payment.loanAccountId, tenantId: user.tenantId }).session(session)
      if (!loan) throw new HttpError(404, 'LOAN_ACCOUNT_NOT_FOUND', 'Loan account was not found.')
      assertBranchAccess(request, payment.branchId)
      if (loan.branchId !== payment.branchId) throw new HttpError(403, 'OWNERSHIP_MISMATCH', 'The payment and loan belong to different branches.')
      const schedule = await RepaymentScheduleModel.find({ tenantId: user.tenantId, loanAccountId: loan.id }).lean().session(session)
      const application = await ApplicationModel.findOne({ _id: loan.applicationId, tenantId: user.tenantId }).select('tenureMonths').lean().session(session) as any
      const loanForTerms = application?.tenureMonths ? { ...(loan.toObject() as any), applicationId: { _id: loan.applicationId, tenureMonths: application.tenureMonths } } : loan
      const totalInterestMinor = (schedule as any[]).reduce((s, r) => s + Number(r.interestMinor ?? 0), 0) || loanInterestTotalMinor(loanForTerms as any, schedule as any[])
      const totalFeesMinor = (schedule as any[]).reduce((s, r) => s + Number(r.feesMinor ?? 0), 0) || loanFeeTotalMinor(loanForTerms as any, schedule as any[])
      const totalRepayableMinor = (schedule as any[]).reduce((s, r) => s + Number(r.totalMinor ?? 0), 0) || (Number(loan.principalMinor ?? 0) + totalInterestMinor + totalFeesMinor)
      // Legacy guard: if term interest/fees were never accrued into outstanding components, accrue them now (idempotent) so allocation/settlement is correct.
      if (!['settled','written_off','closed'].includes(String(loan.status))) {
        if (Number(loan.outstandingInterestMinor ?? 0) === 0 && totalInterestMinor > 0) loan.outstandingInterestMinor = Math.max(0, totalInterestMinor)
        if (Number(loan.outstandingFeesMinor ?? 0) === 0 && totalFeesMinor > 0) loan.outstandingFeesMinor = Math.max(0, totalFeesMinor)
      }
      let remaining = Number(payment.amountMinor ?? 0)
      const principal = Math.min(remaining, Number(loan.outstandingPrincipalMinor ?? 0)); remaining -= principal
      const interest = Math.min(remaining, Number(loan.outstandingInterestMinor ?? 0)); remaining -= interest
      const fees = Math.min(remaining, Number(loan.outstandingFeesMinor ?? 0))
      payment.status = 'confirmed'; payment.confirmedBy = user.id; payment.allocations = [{ principalMinor: principal, interestMinor: interest, feesMinor: fees }]
      loan.outstandingPrincipalMinor = Math.max(0, Number(loan.outstandingPrincipalMinor ?? 0) - principal)
      loan.outstandingInterestMinor = Math.max(0, Number(loan.outstandingInterestMinor ?? 0) - interest)
      loan.outstandingFeesMinor = Math.max(0, Number(loan.outstandingFeesMinor ?? 0) - fees)
      loan.version += 1
      const confirmedPaidBefore = await PaymentModel.aggregate([{ $match: { tenantId: user.tenantId, loanAccountId: loan._id, status: 'confirmed', _id: { $ne: payment._id } } }, { $group: { _id: null, paidMinor: { $sum: '$amountMinor' } } }]).session(session)
      const confirmedPaidMinor = Number(confirmedPaidBefore?.[0]?.paidMinor ?? 0) + Number(payment.amountMinor ?? 0)
      const paymentDueMinor = Math.max(0, totalRepayableMinor - confirmedPaidMinor)
      // Fully cleared ONLY when total repayable (principal + interest + fees) is paid. Never clear from principal-only.
      if (totalRepayableMinor > 0 && confirmedPaidMinor >= totalRepayableMinor) {
        loan.status = 'settled'
        loan.outstandingPrincipalMinor = 0; loan.outstandingInterestMinor = 0; loan.outstandingFeesMinor = 0
      }
      await payment.save({ session }); await loan.save({ session })
      const period = await openPeriod(user.tenantId, payment.branchId)
      const lines: Array<{ account: string; debitMinor?: number; creditMinor?: number }> = [{ account: 'cash', debitMinor: payment.amountMinor }]
      const receivableCredit = principal + interest + fees
      if (receivableCredit > 0) lines.push({ account: 'loan_receivable', creditMinor: receivableCredit })
      // Post catch-up accrual journals once for legacy loans missing interest/fee accrual (keeps loan_receivable balanced when allocation includes them)
      const postedInterestAccrual = totalInterestMinor > 0 ? await JournalModel.exists({ tenantId: user.tenantId, sourceType: 'interest_accrual', sourceId: String(loan._id) }).session(session) : null
      if (!postedInterestAccrual && totalInterestMinor > 0 && Number(loan.outstandingInterestMinor ?? 0) >= 0) {
        await JournalModel.create([{ tenantId: user.tenantId, branchId: payment.branchId, periodId: period.id, sourceType: 'interest_accrual', sourceId: String(loan._id), lines: [{ account: 'loan_receivable', debitMinor: totalInterestMinor }, { account: 'interest_income', creditMinor: totalInterestMinor }] }], { session })
      }
      const postedFeeAccrual = totalFeesMinor > 0 ? await JournalModel.exists({ tenantId: user.tenantId, sourceType: 'fee_accrual', sourceId: String(loan._id) }).session(session) : null
      if (!postedFeeAccrual && totalFeesMinor > 0) {
        await JournalModel.create([{ tenantId: user.tenantId, branchId: payment.branchId, periodId: period.id, sourceType: 'fee_accrual', sourceId: String(loan._id), lines: [{ account: 'loan_receivable', debitMinor: totalFeesMinor }, { account: 'fee_income', creditMinor: totalFeesMinor }] }], { session })
      }
      await JournalModel.create([{ tenantId: user.tenantId, branchId: payment.branchId, periodId: period.id, sourceType: 'repayment', sourceId: payment.id, lines }], { session })
      await recordAudit({ user, action: 'repayment.confirmed', entityType: 'repayment', entityId: payment.id, branchId: payment.branchId, next: { allocations: payment.allocations, outstandingMinor: effectiveOutstanding(loan), paymentDueMinor, totalRepayableMinor, confirmedPaidMinor }, session })
      result = { payment: payment.toObject(), loan: loan.toObject() }
    })
  } finally { await session.endSession() }
  response.json({ success: true, message: 'Repayment confirmed and allocated', data: result! })
}))
router.post('/payments/:id/reverse', requirePermission('repayments.reverse'), asyncRoute(async (request: AuthRequest, response) => {
  const reason = z.object({ reason: z.string().min(3) }).parse(request.body).reason
  const user = currentUser(request)
  const session = await mongoose.startSession()
  let result: unknown
  try {
    await session.withTransaction(async () => {
      const payment = await PaymentModel.findOne({ _id: request.params.id, tenantId: user.tenantId }).session(session)
      if (!payment || payment.status !== 'confirmed') throw new HttpError(409, 'INVALID_REVERSAL_STATE', 'Only confirmed payments can be reversed.')
      const loan = await LoanAccountModel.findOne({ _id: payment.loanAccountId, tenantId: user.tenantId }).session(session)
      if (!loan) throw new HttpError(404, 'LOAN_ACCOUNT_NOT_FOUND', 'Loan account was not found.')
      assertBranchAccess(request, payment.branchId)
      if (loan.branchId !== payment.branchId) throw new HttpError(403, 'OWNERSHIP_MISMATCH', 'The payment and loan belong to different branches.')
      const allocation = payment.allocations[0] as { principalMinor?: number; interestMinor?: number; feesMinor?: number } | undefined
      const principal = allocation?.principalMinor ?? 0; const interest = allocation?.interestMinor ?? 0; const fees = allocation?.feesMinor ?? 0
      payment.status = 'reversed'; payment.reversalReason = reason
      loan.outstandingPrincipalMinor += principal; loan.outstandingInterestMinor += interest; loan.outstandingFeesMinor += fees
      if (loan.status === 'settled') loan.status = 'active'; loan.version += 1
      await payment.save({ session }); await loan.save({ session })
      const period = await openPeriod(user.tenantId, payment.branchId)
      const lines: Array<{ account: string; debitMinor?: number; creditMinor?: number }> = [{ account: 'cash', creditMinor: payment.amountMinor }]
      const receivableDebit = principal + interest + fees
      if (receivableDebit > 0) lines.push({ account: 'loan_receivable', debitMinor: receivableDebit })
      await JournalModel.create([{ tenantId: user.tenantId, branchId: payment.branchId, periodId: period.id, sourceType: 'repayment_reversal', sourceId: payment.id, lines }], { session })
      await recordAudit({ user, action: 'repayment.reversed', entityType: 'repayment', entityId: payment.id, branchId: payment.branchId, reason, next: { status: payment.status }, session })
      result = payment.toObject()
    })
  } finally { await session.endSession() }
  response.json({ success: true, message: 'Repayment reversal recorded', data: result })
}))


router.get('/disbursements', requirePermission('loans.accounts.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const options = pagination(request)
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  const filter = { tenantId: user.tenantId, ...(request.query.status ? { status: String(request.query.status) } : {}), ...(branchId ? { branchId } : user.branchIds.length ? { branchId: { $in: user.branchIds } } : {}) }
  const result = await paged(DisbursementModel, filter, options, { createdAt: -1 })
  const populated = await DisbursementModel.populate(result.data, [
    { path: 'loanAccountId', select: 'principalMinor status', populate: { path: 'customerId', select: 'name customerNumber phone' } },
    { path: 'applicationId', select: 'status' },
  ])
  const ids = Array.from(new Set(populated.flatMap((d: any) => [d.authorizedBy, d.completedBy, d.cancelledBy]).filter(Boolean)))
  const actors = ids.length ? await (await import('../identity/identity.model.js')).IdentityModel.find({ _id: { $in: ids } }).select('_id name email').lean() : []
  const nameById = new Map(actors.map((a: any) => [String(a._id), a.name || a.email || String(a._id)]))
  const data = populated.map((d: any) => ({ ...d, authorizedByName: nameById.get(String(d.authorizedBy)) || d.authorizedBy, completedByName: d.completedBy ? (nameById.get(String(d.completedBy)) || d.completedBy) : undefined, cancelledByName: d.cancelledBy ? (nameById.get(String(d.cancelledBy)) || d.cancelledBy) : undefined }))
  response.json({ success: true, message: 'Disbursements retrieved successfully', data, meta: result.meta })
}))


router.get('/disbursements/:id/receipt', requirePermission('loans.accounts.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const disbursement = await DisbursementModel.findOne({ _id: request.params.id, tenantId: user.tenantId }).populate([
    { path: 'loanAccountId', populate: { path: 'customerId', select: 'name phone customerNumber' } },
    { path: 'applicationId', select: 'status' },
  ]).lean() as any
  if (!disbursement) throw new HttpError(404, 'DISBURSEMENT_NOT_FOUND', 'Disbursement was not found.')
  assertBranchAccess(request, disbursement.branchId)
  const brand = receiptTheme('disbursement', ...(Object.values(await receiptBrand(user.tenantId)) as [string,string,string,string,string]))
  const amount = (Number(disbursement.amountMinor || 0) / 100).toLocaleString()
  const customer = esc(disbursement.loanAccountId?.customerId?.name || '—')
  const loanId = esc(disbursement.loanAccountId?._id || '—')
  const ref = esc(disbursement.reference || disbursement.idempotencyKey || disbursement._id)
  const id = esc(disbursement._id)
  const status = esc(String(disbursement.status || '—').replace(/_/g, ' '))
  const method = esc(disbursement.method || '—')
  const authorized = esc(disbursement.authorizedAt ? new Date(disbursement.authorizedAt).toLocaleString() : '—')
  const completed = esc(disbursement.completedAt ? new Date(disbursement.completedAt).toLocaleString() : '—')
  response.type('text/html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Disbursement receipt ${ref}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet"><style>:root{--bg:#f8f9ff;--card:#fff;--line:#e2e8f0;--ink:#0b1c30;--muted:#64748b;--primary:${brand.primary};--secondary:${brand.secondary};--accent:${brand.accent};--pill-bg:#e5eeff;--pill-line:#b4c5ff;--pill:#003ea8}*{box-sizing:border-box}body{margin:0;padding:24px;background:linear-gradient(180deg,#f8f9ff,#eef4ff);color:var(--ink);font:500 14px/1.45 Inter,Arial,sans-serif}.card{max-width:760px;margin:0 auto;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(15,23,42,.08)}.head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 24px;background:linear-gradient(135deg,var(--primary),#1e293b 58%,var(--secondary));color:#fff}.brand{display:flex;align-items:center;gap:12px;min-width:0}.brand h1{margin:0;font:700 24px/1.15 'Hanken Grotesk',Inter,sans-serif;letter-spacing:-.015em}.brand p{margin:4px 0 0;color:rgba(255,255,255,.78);font:600 11px/14px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase}.pill{padding:6px 12px;border:1px solid var(--pill-line);border-radius:9999px;background:var(--pill-bg);color:var(--pill);font:700 11px/14px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}.body{padding:24px}.hero{padding:18px;border:1px solid #d3e4fe;border-radius:12px;background:linear-gradient(180deg,#fff,#f8faff)}.label{display:block;margin-bottom:4px;color:var(--muted);font:700 11px/14px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase}.amount{color:var(--secondary);font:700 32px/1.05 'Hanken Grotesk',Inter,sans-serif;letter-spacing:-.02em}.sub{margin-top:6px;color:#45474c;font:500 13px/18px 'JetBrains Mono',monospace}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}.cell{padding:12px 16px;border:1px solid var(--line);border-radius:8px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04)}.value{color:var(--ink);font:600 14px/20px Inter,sans-serif;word-break:break-word}.mono{font:700 14px/20px 'JetBrains Mono',monospace}.foot{margin-top:18px;padding-top:14px;border-top:1px dashed #c5c6cd;color:var(--muted);font:400 12px/1.6 Inter,sans-serif}.actions{display:flex;gap:10px;margin-top:16px}button{padding:10px 14px;border:0;border-radius:8px;background:var(--primary);color:#fff;font:600 14px/1 Inter,sans-serif;cursor:pointer}button.secondary{background:#fff;color:#334155;border:1px solid #cbd5e1}@media(max-width:640px){body{padding:12px}.head,.body{padding:16px}.grid{grid-template-columns:1fr}.amount{font-size:28px}}@media print{body{background:#fff;padding:0}.card{box-shadow:none;border:0}.actions{display:none}}</style></head><body><div class="card"><div class="head"><div class="brand">${brand.logo}<div><h1>${brand.orgName}</h1><p>Disbursement Receipt</p></div></div><span class="pill">Disbursement</span></div><div class="body"><div class="hero"><span class="label">Amount Released</span><div class="amount">${brand.currency} ${amount}</div><div class="sub">Reference ${ref}</div></div><div class="grid"><div class="cell"><span class="label">Disbursement ID</span><div class="value mono">${id}</div></div><div class="cell"><span class="label">Reference</span><div class="value mono">${ref}</div></div><div class="cell"><span class="label">Customer</span><div class="value">${customer}</div></div><div class="cell"><span class="label">Loan Account</span><div class="value mono">${loanId}</div></div><div class="cell"><span class="label">Method</span><div class="value">${method}</div></div><div class="cell"><span class="label">Status</span><div class="value">${status}</div></div><div class="cell"><span class="label">Authorized</span><div class="value mono">${authorized}</div></div><div class="cell"><span class="label">Completed</span><div class="value mono">${completed}</div></div></div><div class="actions"><button onclick="window.print()">Print / Save as PDF</button><button class="secondary" onclick="window.close()">Close</button></div><div class="foot">Generated from authenticated backend records for ${brand.orgName}. Disbursement authorization, execution, and cancellation are audited workflow actions.</div></div></div></body></html>`)
}))

router.get('/disbursements/:id', requirePermission('loans.accounts.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const disbursement = await DisbursementModel.findOne({ _id: request.params.id, tenantId: user.tenantId }).populate([
    { path: 'loanAccountId', select: 'principalMinor status branchId', populate: { path: 'customerId', select: 'name customerNumber phone' } },
    { path: 'applicationId', select: 'status branchId' },
  ]).lean()
  if (!disbursement) throw new HttpError(404, 'DISBURSEMENT_NOT_FOUND', 'Disbursement was not found.')
  assertBranchAccess(request, disbursement.branchId)
  response.json({ success: true, message: 'Disbursement retrieved successfully', data: disbursement })
}))

router.post('/disbursements/:id/cancel', requirePermission('loans.disburse.authorize'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = z.object({ reason: z.string().min(3) }).parse(request.body)
  const user = currentUser(request)
  const disbursement = await DisbursementModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!disbursement) throw new HttpError(404, 'DISBURSEMENT_NOT_FOUND', 'Disbursement authorization was not found.')
  assertBranchAccess(request, disbursement.branchId)
  if (disbursement.status !== 'authorized') throw new HttpError(409, 'INVALID_DISBURSEMENT_STATE', 'Only authorized disbursements can be cancelled.')
  disbursement.status = 'cancelled'
  disbursement.cancelledBy = user.id
  disbursement.cancelledAt = new Date()
  disbursement.cancelReason = parsed.reason
  await disbursement.save()
  await recordAudit({ user, action: 'disbursement.cancelled', entityType: 'disbursement', entityId: disbursement.id, branchId: disbursement.branchId, next: { status: disbursement.status, reason: parsed.reason, cancelledBy: user.id } })
  response.json({ success: true, message: 'Disbursement cancelled', data: disbursement })
}))


router.post('/loans/:id/request-plan', requirePermission('loans.accounts.manage'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = z.object({ type: z.enum(['reschedule_request','payment_plan_request']), reason: z.string().min(3), requestedDate: z.string().optional(), notes: z.string().max(1000).optional() }).parse(request.body)
  const user = currentUser(request)
  const loan = await LoanAccountModel.findOne({ _id: request.params.id, tenantId: user.tenantId, ...(user.branchIds.length ? { branchId: { $in: user.branchIds } } : {}) })
  if (!loan) throw new HttpError(404, 'LOAN_NOT_FOUND', 'Loan account was not found.')
  await LoanEventModel.create({ tenantId: user.tenantId, branchId: loan.branchId, loanAccountId: loan.id, type: parsed.type, reason: parsed.reason, metadata: { requestedDate: parsed.requestedDate, notes: parsed.notes }, createdBy: user.id })
  await recordAudit({ user, action: parsed.type, entityType: 'loan_account', entityId: loan.id, branchId: loan.branchId, next: parsed })
  response.json({ success: true, message: parsed.type === 'reschedule_request' ? 'Reschedule request recorded' : 'Payment plan request recorded', data: { loanId: loan.id } })
}))

router.post('/loans/:id/apply-plan', requirePermission('loans.accounts.manage'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = z.object({ type: z.enum(['reschedule','payment_plan']), reason: z.string().min(3), count: z.number().int().min(1).max(365).optional(), months: z.number().int().min(1).max(60).optional(), unit: z.enum(['day','month']).optional(), startDate: z.string().optional() }).parse(request.body)
  const user = currentUser(request)
  const loan = await LoanAccountModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!loan) throw new HttpError(404, 'LOAN_NOT_FOUND', 'Loan account was not found.')
  assertBranchAccess(request, loan.branchId)
  if (!['active','in_arrears','restructured'].includes(loan.status)) throw new HttpError(409, 'INVALID_PLAN_STATE', 'Only active, in-arrears, or restructured loans can be rescheduled or put on a payment plan.')
  const pending = await RepaymentScheduleModel.find({ tenantId: user.tenantId, loanAccountId: loan.id, status: { $in: ['pending','partially_paid','overdue'] } }).sort({ dueDate: 1, installmentNumber: 1 })
  if (!pending.length) throw new HttpError(409, 'NO_PENDING_SCHEDULE', 'No pending schedule installments were found for this loan.')
  const now = parsed.startDate ? new Date(parsed.startDate) : new Date()
  if (Number.isNaN(now.getTime())) throw new HttpError(400, 'INVALID_START_DATE', 'Start date is invalid.')
  const freq = String((loan as any).productSnapshot?.repaymentFrequency ?? 'monthly')
  const unit = parsed.unit ?? (freq === 'daily' ? 'day' : 'month')
  const rawCount = parsed.count ?? parsed.months ?? 1
  const count = Math.max(1, Math.min(unit === 'day' ? 365 : 60, rawCount))
  const addUnit = (d: Date, n: number) => { const x = new Date(d); if (unit === 'day') x.setDate(x.getDate() + n); else x.setMonth(x.getMonth() + n); return x }
  if (parsed.type === 'reschedule') {
    const shift = unit === 'day' ? count : count
    for (const row of pending) { row.dueDate = addUnit(new Date(row.dueDate), shift); if (row.status === 'overdue') row.status = 'pending'; await row.save() }
    loan.status = 'restructured'; loan.version += 1; await loan.save()
  } else {
    // payment plan: preserve pending total and split principal/interest/fees proportionally; daily-friendly installment count
    const totals = pending.reduce((a, r) => ({ p: a.p + Number(r.principalMinor||0), i: a.i + Number(r.interestMinor||0), f: a.f + Number(r.feesMinor||0), t: a.t + Number(r.totalMinor||0) }), { p:0,i:0,f:0,t:0 })
    const split = (total: number) => { const base = Math.floor(total / count); let rem = total - base * count; return Array.from({length: count}, () => { const v = base + (rem > 0 ? 1 : 0); rem = Math.max(0, rem - 1); return v }) }
    const ps = split(totals.p), ints = split(totals.i), fs = split(totals.f)
    await RepaymentScheduleModel.deleteMany({ tenantId: user.tenantId, loanAccountId: loan.id, status: { $in: ['pending','partially_paid','overdue'] } })
    const rows = Array.from({ length: count }, (_, i) => {
      const totalMinor = (ps[i] ?? 0) + (ints[i] ?? 0) + (fs[i] ?? 0)
      return { tenantId: user.tenantId, branchId: loan.branchId, loanAccountId: loan.id, installmentNumber: i + 1, dueDate: addUnit(now, i + 1), principalMinor: ps[i] ?? 0, interestMinor: ints[i] ?? 0, feesMinor: fs[i] ?? 0, totalMinor, status: 'pending' }
    })
    await RepaymentScheduleModel.insertMany(rows)
    loan.status = 'restructured'; loan.version += 1; await loan.save()
  }
  await LoanEventModel.create({ tenantId: user.tenantId, branchId: loan.branchId, loanAccountId: loan.id, type: parsed.type === 'reschedule' ? 'rescheduled' : 'payment_plan_applied', reason: parsed.reason, metadata: { count, unit, frequency: freq, startDate: now.toISOString(), affected: pending.length }, createdBy: user.id })
  await recordAudit({ user, action: parsed.type === 'reschedule' ? 'loan.rescheduled' : 'loan.payment_plan_applied', entityType: 'loan_account', entityId: loan.id, branchId: loan.branchId, next: { count, unit, affected: pending.length, reason: parsed.reason } })
  const plural = count === 1 ? '' : 's'
  const label = unit === 'day' ? `day${plural}` : `month${plural}`
  response.json({ success: true, message: parsed.type === 'reschedule' ? `Loan schedule rescheduled by ${count} ${label}` : `Payment plan applied: ${count} ${label} installment${plural}`, data: { loanId: loan.id, affected: pending.length, count, unit } })
}))

router.get('/payments/:id/receipt', requirePermission('repayments.capture'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const payment = await PaymentModel.findOne({ _id: request.params.id, tenantId: user.tenantId }).populate({ path: 'loanAccountId', populate: { path: 'customerId', select: 'name phone customerNumber' } }).lean() as any
  if (!payment) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Repayment was not found.')
  assertBranchAccess(request, payment.branchId)
  const brand = receiptTheme('payment', ...(Object.values(await receiptBrand(user.tenantId)) as [string,string,string,string,string]))
  const amount = (Number(payment.amountMinor || 0) / 100).toLocaleString()
  const customer = esc(payment.loanAccountId?.customerId?.name || '—')
  const loanId = esc(payment.loanAccountId?._id || '—')
  const ref = esc(payment.reference || payment._id)
  const date = esc(new Date(payment.createdAt || Date.now()).toLocaleString())
  const method = esc(payment.method || '—')
  const status = esc(String(payment.status || '—').replace(/_/g, ' '))
  response.type('text/html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment receipt ${ref}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet"><style>:root{--bg:#f8f9ff;--card:#fff;--line:#e2e8f0;--ink:#0b1c30;--muted:#64748b;--primary:${brand.primary};--secondary:${brand.secondary};--accent:${brand.accent};--teal-bg:#f0fdfa;--teal-line:#99f6e4;--teal:#115e59}*{box-sizing:border-box}body{margin:0;padding:24px;background:linear-gradient(180deg,#f8f9ff,#eef4ff);color:var(--ink);font:500 14px/1.45 Inter,Arial,sans-serif}.card{max-width:760px;margin:0 auto;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(15,23,42,.08)}.head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 24px;background:linear-gradient(135deg,var(--primary),#1e293b 62%,var(--secondary));color:#fff}.brand{display:flex;align-items:center;gap:12px;min-width:0}.brand h1{margin:0;font:700 24px/1.15 'Hanken Grotesk',Inter,sans-serif;letter-spacing:-.015em}.brand p{margin:4px 0 0;color:rgba(255,255,255,.78);font:600 11px/14px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase}.pill{padding:6px 12px;border:1px solid var(--teal-line);border-radius:9999px;background:var(--teal-bg);color:var(--teal);font:700 11px/14px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}.body{padding:24px}.hero{padding:18px;border:1px solid #d3e4fe;border-radius:12px;background:linear-gradient(180deg,#fff,#f8faff)}.label{display:block;margin-bottom:4px;color:var(--muted);font:700 11px/14px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase}.amount{color:var(--accent);font:700 32px/1.05 'Hanken Grotesk',Inter,sans-serif;letter-spacing:-.02em}.sub{margin-top:6px;color:#45474c;font:500 13px/18px 'JetBrains Mono',monospace}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}.cell{padding:12px 16px;border:1px solid var(--line);border-radius:8px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04)}.value{color:var(--ink);font:600 14px/20px Inter,sans-serif;word-break:break-word}.mono{font:700 14px/20px 'JetBrains Mono',monospace}.foot{margin-top:18px;padding-top:14px;border-top:1px dashed #c5c6cd;color:var(--muted);font:400 12px/1.6 Inter,sans-serif}.actions{display:flex;gap:10px;margin-top:16px}button{padding:10px 14px;border:0;border-radius:8px;background:var(--primary);color:#fff;font:600 14px/1 Inter,sans-serif;cursor:pointer}button.secondary{background:#fff;color:#334155;border:1px solid #cbd5e1}@media(max-width:640px){body{padding:12px}.head,.body{padding:16px}.grid{grid-template-columns:1fr}.amount{font-size:28px}}@media print{body{background:#fff;padding:0}.card{box-shadow:none;border:0}.actions{display:none}}</style></head><body><div class="card"><div class="head"><div class="brand">${brand.logo}<div><h1>${brand.orgName}</h1><p>Payment Receipt</p></div></div><span class="pill">Recorded</span></div><div class="body"><div class="hero"><span class="label">Amount Received</span><div class="amount">${brand.currency} ${amount}</div><div class="sub">Reference ${ref}</div></div><div class="grid"><div class="cell"><span class="label">Receipt / Reference</span><div class="value mono">${ref}</div></div><div class="cell"><span class="label">Customer</span><div class="value">${customer}</div></div><div class="cell"><span class="label">Loan Account</span><div class="value mono">${loanId}</div></div><div class="cell"><span class="label">Payment Method</span><div class="value">${method}</div></div><div class="cell"><span class="label">Payment Status</span><div class="value">${status}</div></div><div class="cell"><span class="label">Date</span><div class="value mono">${date}</div></div></div><div class="actions"><button onclick="window.print()">Print / Save as PDF</button><button class="secondary" onclick="window.close()">Close</button></div><div class="foot">Generated from authenticated backend records for ${brand.orgName}. Keep this receipt for audit and customer support. For reversals or corrections, use the audited repayment workflow.</div></div></div></body></html>`)
}))

router.get('/loans/:id/statement/pdf', requirePermission('loans.accounts.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const loan = await LoanAccountModel.findOne({ _id: request.params.id, tenantId: user.tenantId }).populate('customerId', 'name customerNumber phone').lean() as any
  if (!loan) throw new HttpError(404, 'LOAN_NOT_FOUND', 'Loan account was not found.')
  assertBranchAccess(request, loan.branchId)
  const [schedule, payments, disbursements] = await Promise.all([
    RepaymentScheduleModel.find({ tenantId: user.tenantId, loanAccountId: loan._id }).sort({ installmentNumber: 1 }).lean(),
    PaymentModel.find({ tenantId: user.tenantId, loanAccountId: loan._id }).sort({ createdAt: 1 }).lean(),
    DisbursementModel.find({ tenantId: user.tenantId, loanAccountId: loan._id }).sort({ createdAt: 1 }).lean(),
  ])
  const brand = receiptTheme('statement', ...(Object.values(await receiptBrand(user.tenantId)) as [string,string,string,string,string]))
  const money = (minor: unknown) => `${brand.currency} ${(Number(minor || 0) / 100).toLocaleString()}`
  const dt = (v: unknown) => v ? esc(new Date(v as any).toLocaleString()) : '—'
  const statusPill = (v: unknown) => {
    const s = String(v || '').toLowerCase()
    const tone = /paid|confirmed|completed|active|executed/.test(s) ? 'ok' : /overdue|arrear|failed|cancel|reject|written/.test(s) ? 'bad' : 'warn'
    return `<span class="pill ${tone}">${esc(String(v || '—').replace(/_/g, ' '))}</span>`
  }
  const customer = esc(loan.customerId?.name || loan.customerId?.customerNumber || '—')
  const phone = esc(loan.customerId?.phone || '—')
  const loanId = esc(loan._id)
  const totals = loanTotals(loan, schedule as any[])
  const totalInterestMinor = totals.interestMinor
  const totalFeesMinor = totals.feesMinor
  const totalRepayableMinor = totals.totalRepayableMinor
  const paidMinor = payments.filter((p: any) => p.status === 'confirmed').reduce((s: number, p: any) => s + Number(p.amountMinor ?? 0), 0)
  const paymentDueMinor = Math.max(0, totalRepayableMinor - paidMinor)
  const termMonths = loanTermMonths(loan)
  const term = termMonths ? `${esc(termMonths)} month(s)` : '—'
  const rate = interestRateLabel((loan.productSnapshot ?? {}) as any)
  const scheduleRows = (schedule as any[]).map((r) => `<tr><td class="mono">#${esc(r.installmentNumber ?? '')}</td><td class="mono">${dt(r.dueDate)}</td><td class="mono">${money(r.principalMinor)}</td><td class="mono">${money(r.interestMinor)}</td><td class="mono">${money(r.totalMinor)}</td><td>${statusPill(r.status)}</td><td class="mono">${dt(r.paidAt)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No schedule installments found.</td></tr>'
  const paymentRows = (payments as any[]).map((p) => `<tr><td class="mono">${dt(p.createdAt)}</td><td class="mono">${esc(p.reference || p._id)}</td><td class="mono">${money(p.amountMinor)}</td><td>${esc(p.method || '—')}</td><td>${statusPill(p.status)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No payments recorded.</td></tr>'
  const disbRows = (disbursements as any[]).map((d) => `<tr><td class="mono">${dt(d.createdAt)}</td><td class="mono">${esc(d.reference || d.idempotencyKey || d._id)}</td><td class="mono">${money(d.amountMinor)}</td><td>${esc(d.method || '—')}</td><td>${statusPill(d.status)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No disbursements recorded.</td></tr>'
  response.type('text/html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Loan statement ${loanId}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet"><style>:root{--bg:#f8f9ff;--card:#fff;--line:#e2e8f0;--ink:#0b1c30;--muted:#64748b;--primary:${brand.primary};--secondary:${brand.secondary};--accent:#28a094}*{box-sizing:border-box}body{margin:0;padding:24px;background:linear-gradient(180deg,#f8f9ff,#eef4ff);color:var(--ink);font:500 14px/1.45 Inter,Arial,sans-serif}.wrap{max-width:980px;margin:0 auto}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(15,23,42,.08)}.head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 24px;background:linear-gradient(135deg,var(--primary),#1e293b 58%,var(--secondary));color:#fff}.brand{display:flex;align-items:center;gap:12px}.brand h1{margin:0;font:700 24px/1.15 'Hanken Grotesk',Inter,sans-serif;letter-spacing:-.015em}.brand p{margin:4px 0 0;color:rgba(255,255,255,.78);font:600 11px/14px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase}.body{padding:24px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.cell,.panel{padding:12px 16px;border:1px solid var(--line);border-radius:8px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04)}.label{display:block;margin-bottom:4px;color:var(--muted);font:700 11px/14px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase}.value{color:var(--ink);font:600 14px/20px Inter,sans-serif;word-break:break-word}.mono{font:700 13px/18px 'JetBrains Mono',monospace}.section{margin-top:18px}.section h2{margin:0 0 10px;font:600 18px/26px 'Hanken Grotesk',Inter,sans-serif;letter-spacing:-.01em}table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff}th,td{padding:10px 12px;border-bottom:1px solid #e9eef6;text-align:left;vertical-align:middle;font-size:13px}th{background:#f8faff;color:var(--muted);font:700 11px/14px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase}tr:last-child td{border-bottom:0}.empty{color:var(--muted);text-align:center;padding:16px}.pill{display:inline-flex;padding:3px 8px;border:1px solid #c5c6cd;border-radius:9999px;background:#f8f9ff;color:#45474c;font:700 10px/1 Inter,sans-serif;letter-spacing:.04em;text-transform:uppercase}.pill.ok{border-color:#99f6e4;background:#f0fdfa;color:#115e59}.pill.bad{border-color:#fecaca;background:#fef2f2;color:#991b1b}.pill.warn{border-color:#fde68a;background:#fffbeb;color:#92400e}.actions{display:flex;gap:10px;margin-top:16px}button{padding:10px 14px;border:0;border-radius:8px;background:var(--primary);color:#fff;font:600 14px/1 Inter,sans-serif;cursor:pointer}button.secondary{background:#fff;color:#334155;border:1px solid #cbd5e1}.foot{margin-top:16px;padding-top:14px;border-top:1px dashed #c5c6cd;color:var(--muted);font:400 12px/1.6 Inter,sans-serif}@media(max-width:860px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:640px){body{padding:12px}.head,.body{padding:16px}.grid{grid-template-columns:1fr}table{display:block;overflow:auto}}@media print{body{background:#fff;padding:0}.card{box-shadow:none;border:0}.actions{display:none}}</style></head><body><div class="wrap"><div class="card"><div class="head"><div class="brand">${brand.logo}<div><h1>${brand.orgName}</h1><p>Loan Statement</p></div></div><div class="pill ${/closed|completed|settled/.test(String(loan.status||''))?'ok':'warn'}">${esc(String(loan.status||'—').replace(/_/g,' '))}</div></div><div class="body"><div class="grid"><div class="cell"><span class="label">Loan Account</span><div class="value mono">${loanId}</div></div><div class="cell"><span class="label">Customer</span><div class="value">${customer}</div></div><div class="cell"><span class="label">Phone</span><div class="value mono">${phone}</div></div><div class="cell"><span class="label">Generated</span><div class="value mono">${esc(new Date().toLocaleString())}</div></div><div class="cell"><span class="label">Principal</span><div class="value mono">${money(loan.principalMinor)}</div></div><div class="cell"><span class="label">Interest (${esc(rate)}, full term — fixed even if repaid early)</span><div class="value mono">${money(totalInterestMinor)}</div></div><div class="cell"><span class="label">Fees (full term)</span><div class="value mono">${money(totalFeesMinor)}</div></div><div class="cell"><span class="label">Total Repayable (${term})</span><div class="value mono">${money(totalRepayableMinor)}</div></div><div class="cell"><span class="label">Confirmed Paid</span><div class="value mono">${money(paidMinor)}</div></div><div class="cell"><span class="label">Payment Due (includes interest)</span><div class="value mono">${money(paymentDueMinor)}</div></div></div><div class="section"><h2>Repayment schedule</h2><table><thead><tr><th>#</th><th>Due date</th><th>Principal</th><th>Interest</th><th>Total due</th><th>Status</th><th>Paid at</th></tr></thead><tbody>${scheduleRows}</tbody></table></div><div class="section"><h2>Payments</h2><table><thead><tr><th>Date</th><th>Reference</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>${paymentRows}</tbody></table></div><div class="section"><h2>Disbursements</h2><table><thead><tr><th>Date</th><th>Reference</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>${disbRows}</tbody></table></div><div class="actions"><button onclick="window.print()">Print / Save as PDF</button><button class="secondary" onclick="window.close()">Close</button></div><div class="foot">Generated from authenticated backend records for ${brand.orgName}. Use your browser’s “Save as PDF” in the print dialog to export this branded statement.</div></div></div></div></body></html>`)
}))

router.get('/loans/:id/statement/export', requirePermission('loans.accounts.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const loan = await LoanAccountModel.findOne({ _id: request.params.id, tenantId: user.tenantId }).populate('customerId', 'name customerNumber').lean()
  if (!loan) throw new HttpError(404, 'LOAN_NOT_FOUND', 'Loan account was not found.')
  assertBranchAccess(request, loan.branchId)
  const [schedule, payments] = await Promise.all([
    RepaymentScheduleModel.find({ tenantId: user.tenantId, loanAccountId: loan._id }).sort({ installmentNumber: 1 }).lean(),
    PaymentModel.find({ tenantId: user.tenantId, loanAccountId: loan._id }).sort({ createdAt: 1 }).lean(),
  ])
  const rows = ['type,date,reference,amount_minor,status,details', ...schedule.map((r: any) => `schedule,${new Date(r.dueDate).toISOString()},installment-${r.installmentNumber},${r.totalMinor},${r.status},`), ...payments.map((p: any) => `payment,${new Date(p.createdAt).toISOString()},${String(p.reference||'').replaceAll(',',' ')},${p.amountMinor},${p.status},${String(p.method||'').replaceAll(',',' ')}`)]
  response.type('text/csv').setHeader('Content-Disposition', `attachment; filename="loan-statement-${loan._id}.csv"`).send(rows.join('\n'))
}))

export default router
