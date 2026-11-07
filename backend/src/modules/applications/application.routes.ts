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
import { createDocumentUploadSignature } from '../../infrastructure/storage/cloudinary.js'

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

router.patch('/:id', requirePermission('loans.applications.create'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = z.object({ amountMinor: z.number().int().positive().optional(), tenureMonths: z.number().int().positive().optional(), purpose: z.string().min(5).optional(), incomeMinor: z.number().int().nonnegative().optional(), obligationsMinor: z.number().int().nonnegative().optional(), version: z.number().int().positive() }).parse(request.body)
  const user = currentUser(request)
  const application = await ApplicationModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  assertBranchAccess(request, application.branchId)
  if (!['draft', 'submitted', 'under_review', 'assessment_required', 'info_requested', 'approval_pending'].includes(application.status)) throw new HttpError(409, 'INVALID_EDIT_STATE', 'Approved, rejected, or cancelled applications cannot be edited.')
  if (application.version !== parsed.version) throw new HttpError(409, 'STALE_VERSION', `This application changed elsewhere (current version ${application.version}). Refresh and try again.`)
  const product = await LoanProductModel.findOne({ _id: application.productId, tenantId: user.tenantId }).lean()
  if (!product) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Loan product was not found.')
  const next = { amountMinor: parsed.amountMinor ?? application.amountMinor, tenureMonths: parsed.tenureMonths ?? application.tenureMonths }
  if (next.amountMinor < product.terms.minAmountMinor || next.amountMinor > product.terms.maxAmountMinor || next.tenureMonths < product.terms.minTenureMonths || next.tenureMonths > product.terms.maxTenureMonths) throw new HttpError(422, 'TERMS_OUT_OF_RANGE', 'The requested amount or tenure is outside the product terms.')
  const previous = { amountMinor: application.amountMinor, tenureMonths: application.tenureMonths, purpose: application.purpose }
  if (parsed.amountMinor !== undefined) application.amountMinor = parsed.amountMinor
  if (parsed.tenureMonths !== undefined) application.tenureMonths = parsed.tenureMonths
  if (parsed.purpose !== undefined) application.purpose = parsed.purpose
  if (parsed.incomeMinor !== undefined) application.incomeMinor = parsed.incomeMinor
  if (parsed.obligationsMinor !== undefined) application.obligationsMinor = parsed.obligationsMinor
  application.version += 1
  await application.save()
  await recordAudit({ user, action: 'application.updated', entityType: 'loan_application', entityId: application.id, branchId: application.branchId, previous, next: { amountMinor: application.amountMinor, tenureMonths: application.tenureMonths, purpose: application.purpose, version: application.version } })
  response.json({ success: true, message: 'Application updated successfully', data: application })
}))

router.post('/:id/decision', requirePermission('loans.applications.approve'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = z.object({ decision: z.enum(['approved', 'rejected']), reason: z.string().min(3), version: z.number().int().positive() }).parse(request.body)
  const user = currentUser(request)
  const application = await ApplicationModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  assertBranchAccess(request, application.branchId)
  const decidable = ['submitted', 'under_review', 'assessment_required', 'info_requested', 'approval_pending']
  if (application.version !== parsed.version || !decidable.includes(application.status)) throw new HttpError(409, 'INVALID_DECISION_STATE', `This application is no longer available for decision (status: ${application.status}, expected version ${application.version}). Refresh approvals and try again.`)
  const isPrivileged = (user.roles ?? []).some((r) => ['super_admin', 'super-admin', 'superadmin', 'admin'].includes(String(r).toLowerCase().replace(/\s+/g, '_')))
  if (!isPrivileged && application.officerId === user.id) throw new HttpError(403, 'SEPARATION_OF_DUTIES', 'The submitting officer cannot decide this application.')
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
router.post('/:id/cancel', requirePermission('loans.applications.create'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = z.object({ reason: z.string().min(3), version: z.number().int().positive() }).parse(request.body)
  const user = currentUser(request)
  const application = await ApplicationModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  assertBranchAccess(request, application.branchId)
  if (!['draft', 'submitted', 'under_review', 'assessment_required', 'info_requested', 'approval_pending'].includes(application.status)) throw new HttpError(409, 'INVALID_CANCEL_STATE', 'This application cannot be cancelled in its current state.')
  if (application.version !== parsed.version) throw new HttpError(409, 'STALE_VERSION', `This application changed elsewhere (current version ${application.version}). Refresh and try again.`)
  application.status = 'cancelled'
  application.version += 1
  application.decisionHistory.push({ actorId: user.id, decision: 'cancelled', reason: parsed.reason, at: new Date() })
  await application.save()
  await recordAudit({ user, action: 'application.cancelled', entityType: 'loan_application', entityId: application.id, branchId: application.branchId, next: { status: application.status, reason: parsed.reason } })
  response.json({ success: true, message: 'Application cancelled successfully', data: application })
}))

router.post('/:id/withdraw', requirePermission('loans.applications.create'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = z.object({ reason: z.string().min(3), version: z.number().int().positive() }).parse(request.body)
  const user = currentUser(request)
  const application = await ApplicationModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  assertBranchAccess(request, application.branchId)
  if (!['draft', 'submitted', 'under_review', 'assessment_required', 'info_requested', 'approval_pending'].includes(application.status)) throw new HttpError(409, 'INVALID_WITHDRAW_STATE', 'This application cannot be withdrawn in its current state.')
  if (application.version !== parsed.version) throw new HttpError(409, 'STALE_VERSION', `This application changed elsewhere (current version ${application.version}). Refresh and try again.`)
  application.status = 'withdrawn'; application.version += 1
  application.decisionHistory.push({ actorId: user.id, decision: 'withdrawn', reason: parsed.reason, at: new Date() })
  await application.save()
  await recordAudit({ user, action: 'application.withdrawn', entityType: 'loan_application', entityId: application.id, branchId: application.branchId, next: { status: application.status, reason: parsed.reason } })
  response.json({ success: true, message: 'Application withdrawn successfully', data: application })
}))

router.post('/:id/transition', requirePermission('loans.applications.create'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = z.object({ status: z.enum(['under_review','assessment_required','info_requested','approval_pending']), reason: z.string().min(3), version: z.number().int().positive() }).parse(request.body)
  const user = currentUser(request)
  const application = await ApplicationModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  assertBranchAccess(request, application.branchId)
  if (['approved','rejected','cancelled','withdrawn'].includes(application.status)) throw new HttpError(409, 'INVALID_TRANSITION', 'Terminal applications cannot change workflow state.')
  if (application.version !== parsed.version) throw new HttpError(409, 'STALE_VERSION', `This application changed elsewhere (current version ${application.version}). Refresh and try again.`)
  const previous = application.status
  application.status = parsed.status; application.version += 1
  application.decisionHistory.push({ actorId: user.id, decision: parsed.status, reason: parsed.reason, at: new Date() })
  await application.save()
  await recordAudit({ user, action: 'application.transitioned', entityType: 'loan_application', entityId: application.id, branchId: application.branchId, previous: { status: previous }, next: { status: parsed.status, reason: parsed.reason } })
  response.json({ success: true, message: `Application moved to ${parsed.status.replaceAll('_',' ')}`, data: application })
}))

router.post('/:id/comments', requirePermission('loans.applications.view'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = z.object({ body: z.string().trim().min(2).max(2000), kind: z.string().trim().max(40).default('review') }).parse(request.body)
  const user = currentUser(request)
  const application = await ApplicationModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  assertBranchAccess(request, application.branchId)
  const comment = { actorId: user.id, actorName: (user as any).name || user.email || user.id, body: parsed.body, kind: parsed.kind, at: new Date() }
  ;(application.reviewComments as any[]).push(comment)
  await application.save()
  await recordAudit({ user, action: 'application.comment_added', entityType: 'loan_application', entityId: application.id, branchId: application.branchId, next: { kind: parsed.kind } })
  response.json({ success: true, message: 'Review comment added', data: application })
}))

router.post('/:id/attachments', requirePermission('loans.applications.create'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(160), kind: z.string().trim().max(40).default('document'), reference: z.string().trim().min(1).max(300) }).parse(request.body)
  const user = currentUser(request)
  const application = await ApplicationModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  assertBranchAccess(request, application.branchId)
  ;(application.attachments as any[]).push({ ...parsed, addedBy: user.id, addedAt: new Date() })
  application.version += 1
  await application.save()
  await recordAudit({ user, action: 'application.attachment_added', entityType: 'loan_application', entityId: application.id, branchId: application.branchId, next: parsed })
  response.json({ success: true, message: 'Attachment reference added', data: application })
}))

router.post('/:id/attachments/upload-signature', requirePermission('loans.applications.create'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ mimeType: z.string().min(1), size: z.number().int().positive().max(15 * 1024 * 1024) }).parse(request.body)
  const user = currentUser(request)
  const application = await ApplicationModel.findOne({ _id: request.params.id, tenantId: user.tenantId }).lean()
  if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  assertBranchAccess(request, application.branchId)
  response.json({ success: true, message: 'Application attachment upload signature created', data: createDocumentUploadSignature({ tenantId: user.tenantId, customerId: String(application._id), scope: 'applications' }) })
}))

router.post('/:id/attachments/upload', requirePermission('loans.applications.create'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(160), kind: z.string().trim().max(40).default('document'), reference: z.string().trim().min(1).max(300), storageKey: z.string().trim().min(3).max(300).optional(), mimeType: z.string().trim().max(120).optional(), size: z.number().int().nonnegative().optional() }).parse(request.body)
  const user = currentUser(request)
  const application = await ApplicationModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  assertBranchAccess(request, application.branchId)
  ;(application.attachments as any[]).push({ name: parsed.name, kind: parsed.kind, reference: parsed.storageKey || parsed.reference, storageKey: parsed.storageKey, mimeType: parsed.mimeType, size: parsed.size, addedBy: user.id, addedAt: new Date() })
  application.version += 1
  await application.save()
  await recordAudit({ user, action: 'application.attachment_uploaded', entityType: 'loan_application', entityId: application.id, branchId: application.branchId, next: { name: parsed.name, kind: parsed.kind, storageKey: parsed.storageKey || parsed.reference } })
  response.json({ success: true, message: 'Application attachment recorded', data: application })
}))

export default router
