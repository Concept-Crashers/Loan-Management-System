import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { IdentityModel } from '../modules/identity/identity.model.js'
import { RolePermissionModel } from '../modules/identity/role-permission.model.js'
import { ALL_PERMISSIONS, normalizeRoleName } from '../modules/identity/permissions.js'
import { env } from '../config/env.js'
import { HttpError } from './http.js'

export type AuthUser = { id: string; name?: string; email?: string; tenantId: string; branchIds: string[]; roles: string[]; permissions: string[] }
export type AuthRequest = Request & { user?: AuthUser }

export function signAccessToken(user: AuthUser) {
  return jwt.sign({ sub: user.id, name: user.name, email: user.email, tenantId: user.tenantId, branchIds: user.branchIds, roles: user.roles, permissions: user.permissions }, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'] })
}

function isOverallAdmin(roles: string[] = []) {
  const norm = (r: unknown) => normalizeRoleName(String(r ?? ''))
  return roles.some((r) => ['super_admin', 'superadmin'].includes(norm(r)))
}

function isPrivileged(roles: string[] = []) {
  const norm = (r: unknown) => normalizeRoleName(String(r ?? ''))
  return roles.some((r) => ['super_admin', 'superadmin'].includes(norm(r)))
}

async function resolveEffectivePermissions(tenantId: string, roles: string[] = [], explicit: string[] = []) {
  const normalized = [...new Set((roles ?? []).map(normalizeRoleName).filter(Boolean))]
  if (normalized.some((r) => ['super_admin', 'superadmin'].includes(r))) return ['*', ...ALL_PERMISSIONS]
  if (!normalized.length) return [...new Set((explicit ?? []).filter(Boolean))]
  const mapped = await RolePermissionModel.find({ tenantId, normalizedRole: { $in: normalized } }).select('permissions normalizedRole').lean()
  const mappedByRole = new Map(mapped.map((m) => [m.normalizedRole, (m.permissions ?? []).filter(Boolean)]))
  const rolePerms = normalized.flatMap((role) => {
    const perms = mappedByRole.get(role)
    if (perms) return perms
    if (role === 'admin') return [...ALL_PERMISSIONS] // legacy default: admin keeps full access until super admin configures it
    return []
  })
  return [...new Set([...(explicit ?? []), ...rolePerms].filter(Boolean))]
}

export async function requireAuth(request: AuthRequest, _response: Response, next: NextFunction) {
  const header = request.header('authorization')
  if (!header?.startsWith('Bearer ')) return next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.'))
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as jwt.JwtPayload
    if (typeof payload.sub !== 'string') throw new Error('Invalid subject')
    const identity = await IdentityModel.findById(payload.sub).select('name email tenantId branchIds roles permissions status').lean()
    if (!identity || identity.status !== 'active') throw new Error('Inactive identity')
    const permissions = await resolveEffectivePermissions(identity.tenantId, identity.roles ?? [], identity.permissions ?? [])
    request.user = { id: identity._id.toString(), name: identity.name, email: identity.email, tenantId: identity.tenantId, branchIds: identity.branchIds ?? [], roles: identity.roles ?? [], permissions }
    next()
  } catch {
    next(new HttpError(401, 'INVALID_TOKEN', 'The access token is invalid or expired.'))
  }
}

export function requirePermission(permission: string) {
  return (request: AuthRequest, _response: Response, next: NextFunction) => {
    if (isPrivileged(request.user?.roles ?? [])) return next()
    const permissions = request.user?.permissions ?? []
    if (permissions.includes('*') || permissions.includes(permission)) return next()
    return next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'))
  }
}
