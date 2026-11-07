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

const router = Router()
router.use(requireAuth)
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
  if (!loan) throw new HttpError(404, 'LOAN_ACCOUNT_NOT_FOUND', 'Loan account was not found.')
  assertBranchAccess(request, loan.branchId)
  const [schedule, payments, disbursements] = await Promise.all([
    RepaymentScheduleModel.find({ tenantId: user.tenantId, loanAccountId: loan._id }).sort({ installmentNumber: 1 }).lean(),
    PaymentModel.find({ tenantId: user.tenantId, loanAccountId: loan._id }).sort({ createdAt: 1 }).lean(),
    DisbursementModel.find({ tenantId: user.tenantId, loanAccountId: loan._id }).sort({ createdAt: 1 }).lean(),
  ])
  const outstandingMinor = Number(loan.outstandingPrincipalMinor ?? 0) + Number(loan.outstandingInterestMinor ?? 0) + Number(loan.outstandingFeesMinor ?? 0)
  const paidMinor = payments.filter((p) => p.status === 'confirmed').reduce((s, p) => s + Number(p.amountMinor ?? 0), 0)
  response.json({ success: true, message: 'Loan statement retrieved successfully', data: { loan, schedule, payments, disbursements, summary: { principalMinor: Number(loan.principalMinor ?? 0), outstandingPrincipalMinor: Number(loan.outstandingPrincipalMinor ?? 0), outstandingInterestMinor: Number(loan.outstandingInterestMinor ?? 0), outstandingFeesMinor: Number(loan.outstandingFeesMinor ?? 0), outstandingMinor, confirmedPaidMinor: paidMinor } } })
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
  const result = await paged(LoanAccountModel, filter, page)
  const data = await LoanAccountModel.find(filter).populate('customerId', 'name customerNumber').sort({ createdAt: -1 }).skip(page.skip).limit(page.pageSize).lean()
  response.json({ success: true, message: 'Loan accounts retrieved successfully', data: data.map((loan) => {
    const customer = loan.customerId as unknown as { name?: string; customerNumber?: string; _id?: string }
    const outstandingMinor = Number(loan.outstandingPrincipalMinor ?? 0) + Number(loan.outstandingInterestMinor ?? 0) + Number(loan.outstandingFeesMinor ?? 0)
    return { ...loan, ref: String(loan._id), applicationId: String(loan.applicationId), customerId: String(customer?._id ?? loan.customerId), customer: customer.name ?? customer.customerNumber ?? '', outstandingMinor, outstandingPrincipalMinor: Number(loan.outstandingPrincipalMinor ?? 0), outstandingInterestMinor: Number(loan.outstandingInterestMinor ?? 0), outstandingFeesMinor: Number(loan.outstandingFeesMinor ?? 0) }
  }) , meta: result.meta })
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
      loan.status = 'active'; loan.version += 1
      disbursement.status = 'completed'; disbursement.completedBy = user.id; disbursement.completedAt = new Date()
      await loan.save({ session }); await disbursement.save({ session })
      const period = await openPeriod(user.tenantId, disbursement.branchId)
      await JournalModel.create([{ tenantId: user.tenantId, branchId: disbursement.branchId, periodId: period.id, sourceType: 'disbursement', sourceId: disbursement.id, lines: [{ account: 'loan_receivable', debitMinor: disbursement.amountMinor }, { account: 'cash', creditMinor: disbursement.amountMinor }] }], { session })
      await recordAudit({ user, action: 'disbursement.completed', entityType: 'disbursement', entityId: disbursement.id, branchId: disbursement.branchId, next: { status: disbursement.status }, session })
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
      const principal = Math.min(payment.amountMinor, loan.outstandingPrincipalMinor)
      const interest = Math.min(payment.amountMinor - principal, loan.outstandingInterestMinor)
      const fees = payment.amountMinor - principal - interest
      payment.status = 'confirmed'; payment.confirmedBy = user.id; payment.allocations = [{ principalMinor: principal, interestMinor: interest, feesMinor: fees }]
      loan.outstandingPrincipalMinor -= principal; loan.outstandingInterestMinor -= interest; loan.outstandingFeesMinor = Math.max(0, loan.outstandingFeesMinor - fees); loan.version += 1
      if (loan.outstandingPrincipalMinor + loan.outstandingInterestMinor + loan.outstandingFeesMinor === 0) loan.status = 'settled'
      await payment.save({ session }); await loan.save({ session })
      const period = await openPeriod(user.tenantId, payment.branchId)
      await JournalModel.create([{ tenantId: user.tenantId, branchId: payment.branchId, periodId: period.id, sourceType: 'repayment', sourceId: payment.id, lines: [{ account: 'cash', debitMinor: payment.amountMinor }, { account: 'loan_receivable', creditMinor: principal }, { account: 'interest_income', creditMinor: interest }, { account: 'fee_income', creditMinor: fees }] }], { session })
      await recordAudit({ user, action: 'repayment.confirmed', entityType: 'repayment', entityId: payment.id, branchId: payment.branchId, next: { allocations: payment.allocations }, session })
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
      await JournalModel.create([{ tenantId: user.tenantId, branchId: payment.branchId, periodId: period.id, sourceType: 'repayment_reversal', sourceId: payment.id, lines: [{ account: 'cash', creditMinor: payment.amountMinor }, { account: 'loan_receivable', debitMinor: principal }, { account: 'interest_income', debitMinor: interest }, { account: 'fee_income', debitMinor: fees }] }], { session })
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
  ]).lean()
  if (!disbursement) throw new HttpError(404, 'DISBURSEMENT_NOT_FOUND', 'Disbursement was not found.')
  assertBranchAccess(request, (disbursement as any).branchId)
  const amount = (Number((disbursement as any).amountMinor || 0) / 100).toLocaleString()
  const customer = String((disbursement as any).loanAccountId?.customerId?.name || '—')
  const ref = String((disbursement as any).reference || (disbursement as any).idempotencyKey || disbursement._id)
  const settings = await TenantSettingsModel.findOne({ tenantId: user.tenantId }).select('organisation.name').lean().catch(() => null)
  const orgName = String((settings as any)?.organisation?.name || 'Trust Loans')
  response.type('text/html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Disbursement receipt ${ref}</title><style>body{font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a}.card{max-width:720px;margin:0 auto;background:#fff;border:1px solid #dbe4ee;border-radius:16px;overflow:hidden}.head{padding:20px 24px;background:#1e3a8a;color:#fff}.head h1{margin:0;font-size:22px}.head p{margin:4px 0 0;color:#cbd5e1}.body{padding:24px}.grid{display:grid;grid-template-columns:180px 1fr;gap:10px 14px}.k{color:#64748b;font-size:13px}.v{font-weight:600}.amount{font-size:24px;color:#1d4ed8}.foot{margin-top:20px;padding-top:14px;border-top:1px dashed #cbd5e1;color:#64748b;font-size:12px}button{margin-top:18px;padding:10px 14px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer}@media print{body{background:#fff;padding:0}.card{border:0}button{display:none}}</style></head><body><div class="card"><div class="head"><h1>${orgName} Disbursement Receipt</h1><p>Authorized/executed loan disbursement record</p></div><div class="body"><div class="grid"><div class="k">Disbursement ID</div><div class="v">${String(disbursement._id)}</div><div class="k">Reference</div><div class="v">${ref}</div><div class="k">Customer</div><div class="v">${customer}</div><div class="k">Loan</div><div class="v">${String((disbursement as any).loanAccountId?._id || '—')}</div><div class="k">Amount</div><div class="v amount">UGX ${amount}</div><div class="k">Method</div><div class="v">${String((disbursement as any).method || '—')}</div><div class="k">Status</div><div class="v">${String((disbursement as any).status || '—')}</div><div class="k">Authorized</div><div class="v">${(disbursement as any).authorizedAt ? new Date((disbursement as any).authorizedAt).toLocaleString() : '—'}</div><div class="k">Completed</div><div class="v">${(disbursement as any).completedAt ? new Date((disbursement as any).completedAt).toLocaleString() : '—'}</div></div><button onclick="window.print()">Print / Save as PDF</button><div class="foot">Generated from authenticated backend records for ${orgName}. Disbursement execution and cancellation are audited workflow actions.</div></div></div></body></html>`)
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
  const payment = await PaymentModel.findOne({ _id: request.params.id, tenantId: user.tenantId }).populate({ path: 'loanAccountId', populate: { path: 'customerId', select: 'name phone customerNumber' } }).lean()
  if (!payment) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Repayment was not found.')
  assertBranchAccess(request, (payment as any).branchId)
  const amount = (Number((payment as any).amountMinor || 0) / 100).toLocaleString()
  const customer = String((payment as any).loanAccountId?.customerId?.name || '—')
  const loanId = String((payment as any).loanAccountId?._id || '—')
  const ref = String((payment as any).reference || payment._id)
  const date = new Date((payment as any).createdAt || Date.now()).toLocaleString()
  const settings = await TenantSettingsModel.findOne({ tenantId: user.tenantId }).select('organisation.name').lean().catch(() => null)
  const orgName = String((settings as any)?.organisation?.name || 'Trust Loans')
  response.type('text/html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Payment receipt ${ref}</title><style>body{font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a}.card{max-width:720px;margin:0 auto;background:#fff;border:1px solid #dbe4ee;border-radius:16px;overflow:hidden}.head{padding:20px 24px;background:#0f172a;color:#fff}.head h1{margin:0;font-size:22px}.head p{margin:4px 0 0;color:#cbd5e1}.body{padding:24px}.grid{display:grid;grid-template-columns:180px 1fr;gap:10px 14px}.k{color:#64748b;font-size:13px}.v{font-weight:600}.amount{font-size:24px;color:#166534}.foot{margin-top:20px;padding-top:14px;border-top:1px dashed #cbd5e1;color:#64748b;font-size:12px}button{margin-top:18px;padding:10px 14px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer}@media print{body{background:#fff;padding:0}.card{border:0}button{display:none}}</style></head><body><div class="card"><div class="head"><h1>${orgName} Payment Receipt</h1><p>Official collection/payment record for daily and scheduled repayments</p></div><div class="body"><div class="grid"><div class="k">Receipt / Reference</div><div class="v">${ref}</div><div class="k">Customer</div><div class="v">${customer}</div><div class="k">Loan account</div><div class="v">${loanId}</div><div class="k">Amount received</div><div class="v amount">UGX ${amount}</div><div class="k">Payment method</div><div class="v">${String((payment as any).method || '—')}</div><div class="k">Payment status</div><div class="v">${String((payment as any).status || '—')}</div><div class="k">Date</div><div class="v">${date}</div></div><button onclick="window.print()">Print / Save as PDF</button><div class="foot">Receipt generated from authenticated backend records for ${orgName}. Keep this record for audit and customer support. For reversals or corrections, use the audited repayment workflow.</div></div></div></body></html>`)
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
