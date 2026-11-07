import { Router } from 'express'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute } from '../../core/http.js'
import { currentUser } from '../../core/scope.js'
import { AuditModel } from './audit.model.js'
import { IdentityModel } from '../identity/identity.model.js'
import { pagination, paged } from '../../core/pagination.js'

function describeAudit(event: { action?: string; entityType?: string; entityId?: string; previous?: unknown; next?: unknown; reason?: string }) {
  const action = String(event.action ?? '').replace(/[._]/g, ' ')
  const detail: string[] = []
  const next = (event.next ?? {}) as Record<string, unknown>
  if (event.reason) detail.push(String(event.reason))
  if (next.name) detail.push(`name: ${String(next.name)}`)
  if (next.email) detail.push(`email: ${String(next.email)}`)
  if (next.roles && Array.isArray(next.roles)) detail.push(`roles: ${next.roles.join(', ')}`)
  if (next.status) detail.push(`status: ${String(next.status)}`)
  if (next.code) detail.push(`code: ${String(next.code)}`)
  return detail.length ? `${action} (${detail.join('; ')})` : action
}

async function enrichAudit(result: { data: any[]; meta: unknown }) {
  const ids = [...new Set(result.data.map((e) => String(e.actorId ?? '')).filter(Boolean))]
  const actors = ids.length ? await IdentityModel.find({ _id: { $in: ids } }).select('name email').lean() : []
  const nameById = new Map(actors.map((a: any) => [String(a._id), String(a.name || a.email || a._id)]))
  return { ...result, data: result.data.map((e) => ({ ...(typeof e.toObject === 'function' ? e.toObject() : e), actorName: nameById.get(String(e.actorId)) ?? 'System', detail: describeAudit(e) })) }
}

const router = Router()
router.get('/', requireAuth, requirePermission('audit.view'), asyncRoute(async (request: AuthRequest, response) => {
  const query = { tenantId: currentUser(request).tenantId, ...(request.query.entityType ? { entityType: String(request.query.entityType) } : {}), ...(request.query.branchId ? { branchId: String(request.query.branchId) } : {}) }
  const result = await paged(AuditModel, query, pagination(request))
  response.json({ success: true, message: 'Audit events retrieved successfully', ...(await enrichAudit(result as any)) })
}))
router.get('/entity/:entityType/:entityId', requireAuth, requirePermission('audit.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const result = await paged(AuditModel, { tenantId: user.tenantId, entityType: request.params.entityType, entityId: request.params.entityId }, pagination(request))
  response.json({ success: true, message: 'Entity audit history retrieved successfully', ...(await enrichAudit(result as any)) })
}))
export default router
