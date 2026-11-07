import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute, HttpError } from '../../core/http.js'
import { assertBranchAccess, currentUser } from '../../core/scope.js'
import { recordAudit } from '../audit/audit.service.js'
import { ApplicationModel } from '../applications/application.model.js'
import { CustomerModel } from '../customers/customer.model.js'
import { CreditAssessmentModel } from './credit.model.js'
import { calculateInternalCredit } from './credit.service.js'

const router = Router()
router.use(requireAuth)

// Manual assessment (backward compatible)
router.post('/', requirePermission('loans.applications.assess'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ applicationId: z.string(), incomeMinor: z.number().int().nonnegative(), expensesMinor: z.number().int().nonnegative(), existingExposureMinor: z.number().int().nonnegative(), riskIndicators: z.array(z.string()).default([]), recommendation: z.enum(['proceed', 'review', 'decline', 'approve']), notes: z.string().min(3) }).parse(request.body)
  const user = currentUser(request)
  const application = await ApplicationModel.findOne({ _id: input.applicationId, tenantId: user.tenantId })
  if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  assertBranchAccess(request, application.branchId)
  const repaymentCapacityMinor = Math.max(0, input.incomeMinor - input.expensesMinor)
  const latest = await CreditAssessmentModel.findOne({ tenantId: user.tenantId, applicationId: application.id }).sort({ version: -1 }).lean()
  const assessment = await CreditAssessmentModel.create({ ...input, customerId: application.customerId, tenantId: user.tenantId, assessorId: user.id, repaymentCapacityMinor, source: 'manual', calculatedAt: new Date(), version: (latest?.version ?? 0) + 1 })
  await ApplicationModel.updateOne({ _id: application.id }, { $set: { status: 'approval_pending' }, $inc: { version: 1 } })
  await recordAudit({ user, action: 'application.assessed', entityType: 'loan_application', entityId: application.id, branchId: application.branchId, next: { recommendation: assessment.recommendation, assessmentId: assessment.id } })
  response.status(201).json({ success: true, message: 'Credit assessment recorded successfully', data: assessment })
}))

// Calculate internal credit score (customer and/or application context)
router.post('/calculate', requirePermission('loans.applications.assess'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ applicationId: z.string().optional(), customerId: z.string().optional() }).refine(v => v.applicationId || v.customerId, 'applicationId or customerId is required').parse(request.body)
  const user = currentUser(request)
  let customerId = input.customerId
  let application: any = null
  if (input.applicationId) {
    application = await ApplicationModel.findOne({ _id: input.applicationId, tenantId: user.tenantId })
    if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
    assertBranchAccess(request, application.branchId)
    customerId = String(application.customerId)
  }
  if (!customerId) throw new HttpError(400, 'CUSTOMER_REQUIRED', 'A customer context is required to calculate credit score.')
  const customer = await CustomerModel.findOne({ _id: customerId, tenantId: user.tenantId }).select('_id branchId').lean()
  if (!customer) throw new HttpError(404, 'CUSTOMER_NOT_FOUND', 'Customer was not found.')
  if (!application) assertBranchAccess(request, String((customer as any).branchId))

  const result = await calculateInternalCredit({ tenantId: user.tenantId, customerId, applicationId: input.applicationId })
  const latest = await CreditAssessmentModel.findOne({ tenantId: user.tenantId, ...(input.applicationId ? { applicationId: input.applicationId } : { customerId }) }).sort({ version: -1 }).lean()
  const assessment = await CreditAssessmentModel.create({
    tenantId: user.tenantId, customerId, applicationId: input.applicationId, assessorId: user.id,
    incomeMinor: result.incomeMinor, expensesMinor: 0, existingExposureMinor: result.existingExposureMinor, repaymentCapacityMinor: result.repaymentCapacityMinor,
    score: result.score, grade: result.grade, riskLevel: result.riskLevel, recommendation: result.recommendation,
    factors: result.factors, riskIndicators: result.riskIndicators, source: 'internal', modelVersion: result.modelVersion, calculatedAt: result.calculatedAt,
    notes: `Internal credit score ${result.score}/100 (${result.grade}, ${result.riskLevel}).`,
    version: (latest?.version ?? 0) + 1,
  })
  if (application && ['submitted', 'under_review', 'assessment_required'].includes(String(application.status))) {
    await ApplicationModel.updateOne({ _id: application._id, tenantId: user.tenantId, version: application.version }, { $set: { status: 'approval_pending' }, $inc: { version: 1 } })
  }
  await recordAudit({ user, action: 'credit.score.calculated', entityType: 'credit_assessment', entityId: assessment.id, branchId: application?.branchId ?? String((customer as any).branchId), next: { score: result.score, grade: result.grade, riskLevel: result.riskLevel, recommendation: result.recommendation, applicationId: input.applicationId, customerId } })
  response.status(201).json({ success: true, message: 'Credit score calculated successfully', data: assessment })
}))

router.get('/latest', requirePermission('loans.applications.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const { applicationId, customerId } = request.query as { applicationId?: string; customerId?: string }
  if (!applicationId && !customerId) throw new HttpError(400, 'QUERY_REQUIRED', 'applicationId or customerId is required.')
  const filter: any = { tenantId: user.tenantId }
  if (applicationId) filter.applicationId = applicationId
  if (customerId) filter.customerId = customerId
  const data = await CreditAssessmentModel.findOne(filter).sort({ version: -1, createdAt: -1 }).lean()
  response.json({ success: true, message: 'Latest credit assessment retrieved', data: data ?? null })
}))

router.get('/:applicationId', requirePermission('loans.applications.view'), asyncRoute(async (request: AuthRequest, response) => {
  const data = await CreditAssessmentModel.find({ tenantId: currentUser(request).tenantId, applicationId: request.params.applicationId }).sort({ version: -1 }).lean()
  response.json({ success: true, message: 'Credit assessments retrieved successfully', data })
}))
export default router
