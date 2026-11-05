import type { Response } from 'express'
import type { AuthRequest } from './auth.js'
import { HttpError } from './http.js'

export function currentUser(request: AuthRequest) {
  if (!request.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.')
  return request.user
}

export function tenantFilter(request: AuthRequest, response?: Response) {
  const user = currentUser(request)
  if (response) response.setHeader('X-Tenant-Scope', user.tenantId)
  return { tenantId: user.tenantId }
}

export function assertBranchAccess(request: AuthRequest, branchId: string) {
  const user = currentUser(request)
  if (!user.branchIds.includes(branchId)) throw new HttpError(403, 'BRANCH_FORBIDDEN', 'You do not have access to this branch.')
}
