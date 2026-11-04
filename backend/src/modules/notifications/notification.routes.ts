import { Router } from 'express'
import { requireAuth, type AuthRequest } from '../../core/auth.js'
import { asyncRoute } from '../../core/http.js'
import { currentUser } from '../../core/scope.js'
import { NotificationDeliveryModel, NotificationModel } from './notification.model.js'

const router = Router()
router.use(requireAuth)
router.get('/', asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const data = await NotificationModel.find({ tenantId: user.tenantId, recipientId: user.id }).sort({ createdAt: -1 }).limit(50).lean()
  response.json({ success: true, message: 'Notifications retrieved successfully', data })
}))
router.post('/:id/read', asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const notification = await NotificationModel.findOneAndUpdate({ _id: request.params.id, tenantId: user.tenantId, recipientId: user.id }, { readAt: new Date() }, { new: true }).lean()
  response.json({ success: true, message: 'Notification marked as read', data: notification })
}))
router.get('/deliveries/dead-letter', asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const data = await NotificationDeliveryModel.find({ tenantId: user.tenantId, status: 'dead_letter' }).sort({ updatedAt: -1 }).limit(100).lean()
  response.json({ success: true, message: 'Dead-letter notifications retrieved successfully', data })
}))
router.post('/deliveries/:id/retry', asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const delivery = await NotificationDeliveryModel.findOneAndUpdate({ _id: request.params.id, tenantId: user.tenantId, status: 'dead_letter' }, { $set: { status: 'queued', attempts: 0, nextAttemptAt: new Date(), lastError: undefined } }, { new: true }).lean()
  if (!delivery) {
    response.status(404).json({ success: false, message: 'Dead-letter notification was not found.', code: 'DELIVERY_NOT_FOUND' })
    return
  }
  response.json({ success: true, message: 'Notification delivery queued for retry', data: delivery })
}))
export default router
