import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { HttpError } from './http.js'

export type AuthUser = { id: string; tenantId: string; branchIds: string[]; roles: string[]; permissions: string[] }
export type AuthRequest = Request & { user?: AuthUser }

export function signAccessToken(user: AuthUser) {
  return jwt.sign({ sub: user.id, tenantId: user.tenantId, branchIds: user.branchIds, roles: user.roles, permissions: user.permissions }, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'] })
}

export function requireAuth(request: AuthRequest, _response: Response, next: NextFunction) {
  const header = request.header('authorization')
  if (!header?.startsWith('Bearer ')) return next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.'))
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as jwt.JwtPayload
    if (typeof payload.sub !== 'string') throw new Error('Invalid subject')
    request.user = { id: payload.sub, tenantId: String(payload.tenantId), branchIds: Array.isArray(payload.branchIds) ? payload.branchIds.map(String) : [], roles: Array.isArray(payload.roles) ? payload.roles.map(String) : [], permissions: Array.isArray(payload.permissions) ? payload.permissions.map(String) : [] }
    next()
  } catch {
    next(new HttpError(401, 'INVALID_TOKEN', 'The access token is invalid or expired.'))
  }
}

export function requirePermission(permission: string) {
  return (request: AuthRequest, _response: Response, next: NextFunction) => {
    if (!request.user?.permissions.includes(permission)) return next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'))
    next()
  }
}
