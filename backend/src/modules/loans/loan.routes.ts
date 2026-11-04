import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute } from '../../core/http.js'
import { currentUser } from '../../core/scope.js'
import { recordAudit } from '../audit/audit.service.js'
import { LoanProductModel } from './loan-product.model.js'

const router = Router()
const terms = z.object({
  minAmountMinor: z.number().int().nonnegative(), maxAmountMinor: z.number().int().positive(), annualRateBps: z.number().int().nonnegative(),
  interestMethod: z.enum(['flat', 'declining_balance']), repaymentFrequency: z.enum(['weekly', 'biweekly', 'monthly']),
  minTenureMonths: z.number().int().positive(), maxTenureMonths: z.number().int().positive(), gracePeriodDays: z.number().int().nonnegative(),
  fees: z.array(z.record(z.string(), z.unknown())).default([]), requiredDocuments: z.array(z.string()).default([]),
})
const input = z.object({ code: z.string().min(2), name: z.string().min(2), category: z.enum(['individual', 'group']), terms, approvalLimitMinor: z.number().int().nonnegative() })

router.use(requireAuth)
router.get('/', requirePermission('loans.products.view'), asyncRoute(async (request: AuthRequest, response) => {
  const data = await LoanProductModel.find({ tenantId: currentUser(request).tenantId }).sort({ name: 1, version: -1 }).lean()
  response.json({ success: true, message: 'Loan products retrieved successfully', data })
}))
router.post('/', requirePermission('loans.products.create'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = input.parse(request.body)
  const user = currentUser(request)
  const latest = await LoanProductModel.findOne({ tenantId: user.tenantId, code: parsed.code }).sort({ version: -1 }).lean()
  const product = await LoanProductModel.create({ ...parsed, tenantId: user.tenantId, version: (latest?.version ?? 0) + 1 })
  await recordAudit({ user, action: 'loan_product.created', entityType: 'loan_product', entityId: product.id, next: { code: product.code, version: product.version } })
  response.status(201).json({ success: true, message: 'Loan product created successfully', data: product })
}))
export default router
