import { Router } from 'express'
import { requireAuth, type AuthRequest } from '../../core/auth.js'
import { asyncRoute } from '../../core/http.js'
import { currentUser } from '../../core/scope.js'
import { NotificationModel } from './notification.model.js'

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
export default router
