import { Router } from 'express'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute } from '../../core/http.js'
import { currentUser } from '../../core/scope.js'
import { AuditModel } from './audit.model.js'

const router = Router()
router.get('/', requireAuth, requirePermission('audit.view'), asyncRoute(async (request: AuthRequest, response) => {
  const query = { tenantId: currentUser(request).tenantId, ...(request.query.entityType ? { entityType: String(request.query.entityType) } : {}), ...(request.query.branchId ? { branchId: String(request.query.branchId) } : {}) }
  const data = await AuditModel.find(query).sort({ createdAt: -1 }).limit(100).lean()
  response.json({ success: true, message: 'Audit events retrieved successfully', data })
}))
export default router
