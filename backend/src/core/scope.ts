import type { Response } from 'express'
import type { AuthRequest } from './auth.js'
import { HttpError } from './http.js'
import { normalizeRoleName } from '../modules/identity/permissions.js'

export function currentUser(request: AuthRequest) {
  if (!request.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.')
  return request.user
}

export function isOverallAdmin(request: AuthRequest) {
  return (currentUser(request).roles ?? []).some((r) => ['super_admin', 'superadmin', 'admin'].includes(normalizeRoleName(r)))
}

export function tenantFilter(request: AuthRequest, response?: Response) {
  const user = currentUser(request)
  if (response) response.setHeader('X-Tenant-Scope', user.tenantId)
  return { tenantId: user.tenantId }
}

export function assertBranchAccess(request: AuthRequest, branchId: string) {
  const user = currentUser(request)
  if (isOverallAdmin(request)) return
  if (!user.branchIds.includes(branchId)) throw new HttpError(403, 'BRANCH_FORBIDDEN', 'You do not have access to this branch.')
}

export function branchFilter(request: AuthRequest, branchId?: string) {
  const user = currentUser(request)
  if (branchId) { assertBranchAccess(request, branchId); return { branchId } }
  if (isOverallAdmin(request)) return {}
  return user.branchIds?.length ? { branchId: { $in: user.branchIds } } : { branchId: { $in: [] } }
}
