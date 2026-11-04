import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute, HttpError } from '../../core/http.js'
import { currentUser } from '../../core/scope.js'
import { recordAudit } from '../audit/audit.service.js'
import { ApplicationModel } from '../applications/application.model.js'
import { CreditAssessmentModel } from './credit.model.js'

const router = Router()
router.use(requireAuth)
router.post('/', requirePermission('loans.applications.assess'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ applicationId: z.string(), incomeMinor: z.number().int().nonnegative(), expensesMinor: z.number().int().nonnegative(), existingExposureMinor: z.number().int().nonnegative(), riskIndicators: z.array(z.string()).default([]), recommendation: z.enum(['proceed', 'review', 'decline']), notes: z.string().min(3) }).parse(request.body)
  const user = currentUser(request)
  const application = await ApplicationModel.findOne({ _id: input.applicationId, tenantId: user.tenantId })
  if (!application) throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  const repaymentCapacityMinor = Math.max(0, input.incomeMinor - input.expensesMinor)
  const latest = await CreditAssessmentModel.findOne({ tenantId: user.tenantId, applicationId: application.id }).sort({ version: -1 }).lean()
  const assessment = await CreditAssessmentModel.create({ ...input, tenantId: user.tenantId, assessorId: user.id, repaymentCapacityMinor, version: (latest?.version ?? 0) + 1 })
  await ApplicationModel.updateOne({ _id: application.id }, { $set: { status: 'approval_pending' }, $inc: { version: 1 } })
  await recordAudit({ user, action: 'application.assessed', entityType: 'loan_application', entityId: application.id, branchId: application.branchId, next: { recommendation: assessment.recommendation, assessmentId: assessment.id } })
  response.status(201).json({ success: true, message: 'Credit assessment recorded successfully', data: assessment })
}))
router.get('/:applicationId', requirePermission('loans.applications.assess'), asyncRoute(async (request: AuthRequest, response) => {
  const data = await CreditAssessmentModel.find({ tenantId: currentUser(request).tenantId, applicationId: request.params.applicationId }).sort({ version: -1 }).lean()
  response.json({ success: true, message: 'Credit assessments retrieved successfully', data })
}))
export default router
