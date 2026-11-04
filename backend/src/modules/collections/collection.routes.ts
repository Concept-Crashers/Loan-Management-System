import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute } from '../../core/http.js'
import { currentUser } from '../../core/scope.js'
import { recordAudit } from '../audit/audit.service.js'
import { CollectionModel } from './collection.model.js'

const router = Router()
router.use(requireAuth)
router.get('/', requirePermission('collections.view'), asyncRoute(async (request: AuthRequest, response) => {
  const data = await CollectionModel.find({ tenantId: currentUser(request).tenantId, ...(request.query.status ? { status: String(request.query.status) } : {}) }).sort({ followUpAt: 1 }).limit(100).lean()
  response.json({ success: true, message: 'Collection cases retrieved successfully', data })
}))
router.patch('/:id', requirePermission('collections.manage'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ status: z.enum(['open', 'contacted', 'promise_to_pay', 'escalated', 'resolved']), followUpAt: z.coerce.date().optional(), promiseAmountMinor: z.number().int().nonnegative().optional(), promiseDueAt: z.coerce.date().optional(), notes: z.string().max(2000).default('') }).parse(request.body)
  const user = currentUser(request)
  const collection = await CollectionModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!collection) {
    response.status(404).json({ success: false, message: 'Collection case was not found.', code: 'COLLECTION_NOT_FOUND', errors: [] })
    return
  }
  collection.set(input)
  collection.history.push({ actorId: user.id, ...input, at: new Date() })
  await collection.save()
  await recordAudit({ user, action: 'collection.updated', entityType: 'collection_case', entityId: collection.id, branchId: collection.branchId, next: input })
  response.json({ success: true, message: 'Collection case updated successfully', data: collection })
}))
export default router
