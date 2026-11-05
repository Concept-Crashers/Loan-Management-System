import { Router } from 'express'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute } from '../../core/http.js'
import { currentUser } from '../../core/scope.js'
import { AuditModel } from './audit.model.js'
import { pagination, paged } from '../../core/pagination.js'

const router = Router()
router.get('/', requireAuth, requirePermission('audit.view'), asyncRoute(async (request: AuthRequest, response) => {
  const query = { tenantId: currentUser(request).tenantId, ...(request.query.entityType ? { entityType: String(request.query.entityType) } : {}), ...(request.query.branchId ? { branchId: String(request.query.branchId) } : {}) }
  const result = await paged(AuditModel, query, pagination(request))
  response.json({ success: true, message: 'Audit events retrieved successfully', ...result })
}))
router.get('/entity/:entityType/:entityId', requireAuth, requirePermission('audit.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const result = await paged(AuditModel, { tenantId: user.tenantId, entityType: request.params.entityType, entityId: request.params.entityId }, pagination(request))
  response.json({ success: true, message: 'Entity audit history retrieved successfully', ...result })
}))
export default router
