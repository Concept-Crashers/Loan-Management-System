import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute, HttpError } from '../../core/http.js'
import { currentUser } from '../../core/scope.js'
import { recordAudit } from '../audit/audit.service.js'
import { LoanProductModel } from './loan-product.model.js'

const router = Router()
const terms = z.object({
  minAmountMinor: z.number().int().nonnegative(), maxAmountMinor: z.number().int().positive(), annualRateBps: z.number().int().nonnegative(),
  interestMethod: z.enum(['flat', 'declining_balance']), repaymentFrequency: z.enum(['daily','weekly', 'biweekly', 'monthly']),
  minTenureMonths: z.number().int().positive(), maxTenureMonths: z.number().int().positive(), gracePeriodDays: z.number().int().nonnegative(),
  fees: z.array(z.record(z.string(), z.unknown())).default([]), requiredDocuments: z.array(z.string()).default([]),
})
const input = z.object({ code: z.string().min(2), name: z.string().min(2), category: z.enum(['individual', 'group']), terms, approvalLimitMinor: z.number().int().nonnegative() })
const updateInput = z.object({ status: z.enum(['draft', 'active', 'inactive']).optional(), name: z.string().min(2).optional(), category: z.enum(['individual', 'group']).optional(), terms: terms.optional(), approvalLimitMinor: z.number().int().nonnegative().optional(), createNewVersion: z.boolean().optional() })

router.use(requireAuth)
router.get('/:id', requirePermission('loans.products.view'), asyncRoute(async (request: AuthRequest, response) => {
  const product = await LoanProductModel.findOne({ _id: request.params.id, tenantId: currentUser(request).tenantId }).lean()
  if (!product) throw new HttpError(404, 'LOAN_PRODUCT_NOT_FOUND', 'Loan product was not found.')
  response.json({ success: true, message: 'Loan product retrieved successfully', data: product })
}))
router.get('/', requirePermission('loans.products.view'), asyncRoute(async (request: AuthRequest, response) => {
  const data = await LoanProductModel.find({ tenantId: currentUser(request).tenantId }).sort({ name: 1, version: -1 }).lean()
  response.json({ success: true, message: 'Loan products retrieved successfully', data })
}))

router.post('/', requirePermission('loans.products.create'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = input.parse(request.body)
  const user = currentUser(request)
  const latest = await LoanProductModel.findOne({ tenantId: user.tenantId, code: parsed.code }).sort({ version: -1 }).lean()
  const product = await LoanProductModel.create({ ...parsed, tenantId: user.tenantId, version: (latest?.version ?? 0) + 1, status: 'active' })
  await recordAudit({ user, action: 'loan_product.created', entityType: 'loan_product', entityId: product.id, next: { code: product.code, version: product.version, status: product.status } })
  response.status(201).json({ success: true, message: 'Loan product created successfully', data: product })
}))

router.patch('/:id', requirePermission('loans.products.create'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = updateInput.parse(request.body)
  const user = currentUser(request)
  const product = await LoanProductModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!product) throw new HttpError(404, 'LOAN_PRODUCT_NOT_FOUND', 'Loan product was not found.')
  const previous = { status: product.status, name: product.name, version: product.version, terms: product.terms }
  const changingTerms = !!parsed.terms || !!parsed.name || !!parsed.category || parsed.approvalLimitMinor !== undefined
  if (changingTerms && product.status !== 'draft' && !parsed.createNewVersion) {
    // preserve approved snapshots: create a new version instead of mutating non-draft products
    const latest = await LoanProductModel.findOne({ tenantId: user.tenantId, code: product.code }).sort({ version: -1 }).lean()
    const next = await LoanProductModel.create({ tenantId: user.tenantId, code: product.code, name: parsed.name ?? product.name, category: parsed.category ?? product.category, terms: parsed.terms ?? (product as any).terms, approvalLimitMinor: parsed.approvalLimitMinor ?? product.approvalLimitMinor, status: parsed.status ?? 'draft', version: (latest?.version ?? product.version) + 1 })
    await recordAudit({ user, action: 'loan_product.version_created', entityType: 'loan_product', entityId: next.id, previous, next: { code: next.code, version: next.version, status: next.status } })
    response.json({ success: true, message: `Loan product saved as new version ${next.version}`, data: next })
    return
  }
  if (parsed.status !== undefined) product.status = parsed.status
  if (parsed.name !== undefined) product.name = parsed.name
  if (parsed.category !== undefined) product.category = parsed.category
  if (parsed.terms !== undefined) (product as any).terms = parsed.terms
  if (parsed.approvalLimitMinor !== undefined) product.approvalLimitMinor = parsed.approvalLimitMinor
  await product.save()
  await recordAudit({ user, action: parsed.status !== undefined && !changingTerms ? 'loan_product.status_changed' : 'loan_product.updated', entityType: 'loan_product', entityId: product.id, previous, next: { status: product.status, name: product.name, version: product.version } })
  response.json({ success: true, message: changingTerms ? 'Loan product updated successfully' : `Loan product ${parsed.status === 'active' ? 'activated' : parsed.status === 'inactive' ? 'deactivated' : 'updated'} successfully`, data: product })
}))
export default router
