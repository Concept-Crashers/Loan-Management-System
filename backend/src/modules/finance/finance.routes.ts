import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute, HttpError } from '../../core/http.js'
import { assertBranchAccess, currentUser } from '../../core/scope.js'
import { recordAudit } from '../audit/audit.service.js'
import { LoanAccountModel, PaymentModel, JournalModel, DisbursementModel } from './finance.model.js'
import mongoose from 'mongoose'
import { ApplicationModel } from '../applications/application.model.js'

const router = Router()
router.use(requireAuth)
router.get('/loans', requirePermission('loans.accounts.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  if (branchId) assertBranchAccess(request, branchId)
  const data = await LoanAccountModel.find({ tenantId: user.tenantId, ...(branchId ? { branchId } : { branchId: { $in: user.branchIds } }) }).populate('customerId', 'name customerNumber').sort({ createdAt: -1 }).limit(200).lean()
  response.json({ success: true, message: 'Loan accounts retrieved successfully', data: data.map((loan) => {
    const customer = loan.customerId as unknown as { name?: string; customerNumber?: string }
    return { ...loan, ref: String(loan._id), applicationId: String(loan.applicationId), customerId: String((loan.customerId as unknown as { _id?: string })._id ?? loan.customerId), customer: customer.name ?? customer.customerNumber ?? '' }
  }) })
}))
router.get('/payments', requirePermission('repayments.capture'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  if (branchId) assertBranchAccess(request, branchId)
  const data = await PaymentModel.find({ tenantId: user.tenantId, ...(branchId ? { branchId } : { branchId: { $in: user.branchIds } }) }).sort({ createdAt: -1 }).limit(200).lean()
  response.json({ success: true, message: 'Repayments retrieved successfully', data })
}))
router.get('/journal', requirePermission('accounting.journal.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  if (branchId) assertBranchAccess(request, branchId)
  const data = await JournalModel.find({ tenantId: user.tenantId, ...(branchId ? { branchId } : { branchId: { $in: user.branchIds } }) }).sort({ createdAt: -1 }).limit(200).lean()
  response.json({ success: true, message: 'Journal entries retrieved successfully', data })
}))
router.post('/journal', requirePermission('accounting.journal.create'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ branchId: z.string(), sourceType: z.string().min(2), sourceId: z.string().min(1), lines: z.array(z.object({ account: z.string().min(2), debitMinor: z.number().int().nonnegative().default(0), creditMinor: z.number().int().nonnegative().default(0) })).min(2) }).parse(request.body)
  const user = currentUser(request); assertBranchAccess(request, input.branchId)
  const debit = input.lines.reduce((sum, line) => sum + line.debitMinor, 0)
  const credit = input.lines.reduce((sum, line) => sum + line.creditMinor, 0)
  if (debit === 0 || debit !== credit || input.lines.some((line) => line.debitMinor > 0 && line.creditMinor > 0)) throw new HttpError(400, 'UNBALANCED_JOURNAL', 'Journal debits and credits must balance and each line must have one side.')
  const entry = await JournalModel.create({ ...input, tenantId: user.tenantId })
  await recordAudit({ user, action: 'journal.created', entityType: 'journal_entry', entityId: entry.id, branchId: input.branchId, next: { sourceType: input.sourceType, debitMinor: debit } })
  response.status(201).json({ success: true, message: 'Journal entry created', data: entry })
}))
router.post('/payments', requirePermission('repayments.capture'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ branchId: z.string(), loanAccountId: z.string(), reference: z.string().min(3), amountMinor: z.number().int().positive(), method: z.string().min(2) }).parse(request.body)
  const user = currentUser(request)
  assertBranchAccess(request, input.branchId)
  const loan = await LoanAccountModel.findOne({ _id: input.loanAccountId, tenantId: user.tenantId, branchId: input.branchId })
  if (!loan) throw new HttpError(404, 'LOAN_ACCOUNT_NOT_FOUND', 'Loan account was not found in the selected branch.')
  const existing = await PaymentModel.findOne({ tenantId: user.tenantId, reference: input.reference })
  if (existing) throw new HttpError(409, 'DUPLICATE_PAYMENT', 'This payment reference already exists.')
  const payment = await PaymentModel.create({ ...input, tenantId: user.tenantId })
  await recordAudit({ user, action: 'repayment.captured', entityType: 'repayment', entityId: payment.id, branchId: input.branchId, next: { status: payment.status, amountMinor: payment.amountMinor } })
  response.status(201).json({ success: true, message: 'Repayment captured pending verification', data: payment })
}))

router.post(['/disbursements/authorize', '/disbursements'], requirePermission('loans.disburse.authorize'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ applicationId: z.string(), loanAccountId: z.string(), branchId: z.string(), amountMinor: z.number().int().positive(), idempotencyKey: z.string().min(8) }).parse(request.body)
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
  const authorization = await DisbursementModel.create({ ...input, tenantId: user.tenantId, authorizedBy: user.id })
  await recordAudit({ user, action: 'disbursement.authorized', entityType: 'disbursement', entityId: authorization.id, branchId: input.branchId, next: { amountMinor: input.amountMinor } })
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
      await JournalModel.create([{ tenantId: user.tenantId, branchId: disbursement.branchId, sourceType: 'disbursement', sourceId: disbursement.id, lines: [{ account: 'loan_receivable', debitMinor: disbursement.amountMinor }, { account: 'cash', creditMinor: disbursement.amountMinor }] }], { session })
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
      await JournalModel.create([{ tenantId: user.tenantId, branchId: payment.branchId, sourceType: 'repayment', sourceId: payment.id, lines: [{ account: 'cash', debitMinor: payment.amountMinor }, { account: 'loan_receivable', creditMinor: principal }, { account: 'interest_income', creditMinor: interest }, { account: 'fee_income', creditMinor: fees }] }], { session })
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
      await JournalModel.create([{ tenantId: user.tenantId, branchId: payment.branchId, sourceType: 'repayment_reversal', sourceId: payment.id, lines: [{ account: 'cash', creditMinor: payment.amountMinor }, { account: 'loan_receivable', debitMinor: principal }, { account: 'interest_income', debitMinor: interest }, { account: 'fee_income', debitMinor: fees }] }], { session })
      await recordAudit({ user, action: 'repayment.reversed', entityType: 'repayment', entityId: payment.id, branchId: payment.branchId, reason, next: { status: payment.status }, session })
      result = payment.toObject()
    })
  } finally { await session.endSession() }
  response.json({ success: true, message: 'Repayment reversal recorded', data: result })
}))
export default router
