import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute } from '../../core/http.js'
import { currentUser } from '../../core/scope.js'
import { recordAudit } from '../audit/audit.service.js'
import { CollectionModel } from './collection.model.js'
import { pagination, paged } from '../../core/pagination.js'

const router = Router()
router.use(requireAuth)
router.get('/', requirePermission('collections.view'), asyncRoute(async (request: AuthRequest, response) => {
  const options = pagination(request)
  const filter = { tenantId: currentUser(request).tenantId, ...(request.query.status ? { status: String(request.query.status) } : {}), ...(options.search ? { notes: { $regex: options.search, $options: 'i' } } : {}) }
  const result = await paged(CollectionModel, filter, options, { followUpAt: 1 })
  const data = await CollectionModel.populate(result.data, { path: 'loanAccountId', populate: { path: 'customerId', select: 'name phone customerNumber' } })
  response.json({ success: true, message: 'Collection cases retrieved successfully', data, meta: result.meta })
}))
router.patch('/:id', requirePermission('collections.manage'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ status: z.enum(['open', 'contacted', 'promise_to_pay', 'escalated', 'resolved']).optional(), assignedTo: z.string().trim().min(1).optional(), assignedToName: z.string().trim().max(120).optional(), followUpAt: z.coerce.date().optional(), promiseAmountMinor: z.number().int().nonnegative().optional(), promiseDueAt: z.coerce.date().optional(), notes: z.string().max(2000).optional(), slaDueAt: z.coerce.date().optional() }).parse(request.body)
  const user = currentUser(request)
  const collection = await CollectionModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!collection) {
    response.status(404).json({ success: false, message: 'Collection case was not found.', code: 'COLLECTION_NOT_FOUND', errors: [] })
    return
  }
  const patch = { ...(input.status ? { status: input.status } : {}), ...(input.assignedTo ? { assignedTo: input.assignedTo } : {}), ...(input.assignedToName !== undefined ? { assignedToName: input.assignedToName } : {}), ...(input.followUpAt ? { followUpAt: input.followUpAt } : {}), ...(input.promiseAmountMinor !== undefined ? { promiseAmountMinor: input.promiseAmountMinor } : {}), ...(input.promiseDueAt ? { promiseDueAt: input.promiseDueAt } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}), ...(input.slaDueAt ? { slaDueAt: input.slaDueAt } : {}), lastActionAt: new Date() }
  collection.set(patch)
  collection.history.push({ actorId: user.id, ...patch, at: new Date() })
  await collection.save()
  await recordAudit({ user, action: 'collection.updated', entityType: 'collection_case', entityId: collection.id, branchId: collection.branchId, next: input })
  response.json({ success: true, message: 'Collection case updated successfully', data: collection })
}))
export default router
