import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute, HttpError } from '../../core/http.js'
import { assertBranchAccess, currentUser } from '../../core/scope.js'
import { recordAudit } from '../audit/audit.service.js'
import { CustomerModel } from '../customers/customer.model.js'
import { LoanProductModel } from '../loans/loan-product.model.js'
import { ApplicationModel } from './application.model.js'
import { LoanAccountModel } from '../finance/finance.model.js'
import { generateRepaymentSchedule } from '../finance/schedule.js'

const router = Router()
const createInput = z.object({ branchId: z.string().min(1), customerId: z.string().min(1), productId: z.string().min(1), amountMinor: z.number().int().positive(), tenureMonths: z.number().int().positive(), purpose: z.string().min(5), incomeMinor: z.number().int().nonnegative(), obligationsMinor: z.number().int().nonnegative() })
router.use(requireAuth)
router.get('/:id', requirePermission('loans.applications.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const application = await ApplicationModel.findOne({ _id: request.params.id, tenantId: user.tenantId }).lean()
  if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  assertBranchAccess(request, application.branchId)
  response.json({ success: true, message: 'Application retrieved successfully', data: application })
}))

router.get('/', requirePermission('loans.applications.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const data = await ApplicationModel.find({ tenantId: user.tenantId, ...(request.query.status ? { status: String(request.query.status) } : {}), ...(request.query.branchId ? { branchId: String(request.query.branchId) } : {}) })
    .populate('customerId', 'name phone customerNumber')
    .populate('productId', 'name code')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()
  response.json({ success: true, message: 'Applications retrieved successfully', data })
}))

router.post('/', requirePermission('loans.applications.create'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = createInput.parse(request.body)
  const user = currentUser(request)
  assertBranchAccess(request, parsed.branchId)
  if (!mongoose.isValidObjectId(parsed.customerId) || !mongoose.isValidObjectId(parsed.productId)) throw new HttpError(400, 'INVALID_ID', 'Customer or loan product identifier is invalid. Reload the form and try again.')
  const [customer, product] = await Promise.all([CustomerModel.findOne({ _id: parsed.customerId, tenantId: user.tenantId, branchId: parsed.branchId }).lean(), LoanProductModel.findOne({ _id: parsed.productId, tenantId: user.tenantId, status: 'active' }).lean()])
  if (!customer) throw new HttpError(404, 'CUSTOMER_NOT_FOUND', 'Customer was not found in the selected branch.')
  if (!product) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Active loan product was not found.')
  if (parsed.amountMinor < product.terms.minAmountMinor || parsed.amountMinor > product.terms.maxAmountMinor || parsed.tenureMonths < product.terms.minTenureMonths || parsed.tenureMonths > product.terms.maxTenureMonths) throw new HttpError(422, 'TERMS_OUT_OF_RANGE', 'The requested amount or tenure is outside the product terms.')
  const application = await ApplicationModel.create({ ...parsed, tenantId: user.tenantId, productVersion: product.version, officerId: user.id, status: 'submitted' })
  await recordAudit({ user, action: 'application.submitted', entityType: 'loan_application', entityId: application.id, branchId: parsed.branchId, next: { status: application.status, amountMinor: application.amountMinor } })
  response.status(201).json({ success: true, message: 'Loan application submitted successfully', data: application })
}))

router.post('/:id/decision', requirePermission('loans.applications.approve'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = z.object({ decision: z.enum(['approved', 'rejected']), reason: z.string().min(3), version: z.number().int().positive() }).parse(request.body)
  const user = currentUser(request)
  const application = await ApplicationModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  assertBranchAccess(request, application.branchId)
  if (application.version !== parsed.version || !['approval_pending', 'under_review'].includes(application.status)) throw new HttpError(409, 'INVALID_DECISION_STATE', 'This application is no longer available for decision.')
  if (application.officerId === user.id) throw new HttpError(403, 'SEPARATION_OF_DUTIES', 'The submitting officer cannot decide this application.')
  application.status = parsed.decision
  application.version += 1
  application.decisionHistory.push({ actorId: user.id, decision: parsed.decision, reason: parsed.reason, at: new Date() })
  if (parsed.decision === 'approved') {
    const product = await LoanProductModel.findOne({ _id: application.productId, tenantId: user.tenantId, version: application.productVersion }).lean()
    if (!product) throw new HttpError(409, 'PRODUCT_SNAPSHOT_NOT_FOUND', 'The approved product version is no longer available.')
    const existing = await LoanAccountModel.findOne({ tenantId: user.tenantId, applicationId: application.id })
    const account = existing ?? await LoanAccountModel.create({ tenantId: user.tenantId, branchId: application.branchId, customerId: application.customerId, applicationId: application.id, principalMinor: application.amountMinor, outstandingPrincipalMinor: application.amountMinor, outstandingInterestMinor: 0, outstandingFeesMinor: 0, productSnapshot: product.terms, status: 'pending_disbursement' })
    if (!existing) {
      await generateRepaymentSchedule({ id: account.id ?? String(account._id), tenantId: account.tenantId, branchId: account.branchId, principalMinor: account.principalMinor, productSnapshot: account.productSnapshot }, application.tenureMonths)
    }
    application.loanAccountId = account.id
  }
  await application.save()
  await recordAudit({ user, action: `application.${parsed.decision}`, entityType: 'loan_application', entityId: application.id, branchId: application.branchId, next: { status: application.status, reason: parsed.reason } })
  response.json({ success: true, message: `Application ${parsed.decision} successfully`, data: application })
}))
export default router
