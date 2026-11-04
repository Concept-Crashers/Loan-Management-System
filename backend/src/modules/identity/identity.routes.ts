import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { HttpError, asyncRoute } from '../../core/http.js'
import { signAccessToken, type AuthUser, requireAuth, type AuthRequest } from '../../core/auth.js'
import { IdentityModel } from './identity.model.js'

const router = Router()
const loginSchema = z.object({ email: z.email(), password: z.string().min(1) })

router.post('/login', asyncRoute(async (request, response) => {
  const input = loginSchema.parse(request.body)
  const identity = await IdentityModel.findOne({ email: input.email }).select('+passwordHash')
  if (!identity || identity.status !== 'active' || identity.lockedUntil && identity.lockedUntil > new Date() || !await bcrypt.compare(input.password, identity.passwordHash)) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.')
  const user: AuthUser = { id: identity.id, tenantId: identity.tenantId, branchIds: identity.branchIds, roles: identity.roles, permissions: identity.permissions }
  const accessToken = signAccessToken(user)
  const refreshToken = jwt.sign({ sub: identity.id }, env.JWT_REFRESH_SECRET, { expiresIn: env.REFRESH_TOKEN_TTL as jwt.SignOptions['expiresIn'] })
  identity.refreshTokenHash = await bcrypt.hash(refreshToken, 12)
  identity.failedLoginCount = 0
  await identity.save()
  response.json({ success: true, message: 'Signed in successfully', data: { accessToken, refreshToken, user } })
}))

router.get('/me', requireAuth, asyncRoute(async (request: AuthRequest, response) => {
  response.json({ success: true, message: 'Identity retrieved successfully', data: request.user })
}))

router.post('/logout', requireAuth, asyncRoute(async (request: AuthRequest, response) => {
  await IdentityModel.updateOne({ _id: request.user?.id }, { $unset: { refreshTokenHash: 1 } })
  response.json({ success: true, message: 'Signed out successfully', data: null })
}))

router.post('/refresh', asyncRoute(async (request, response) => {
  const token = z.object({ refreshToken: z.string().min(1) }).parse(request.body).refreshToken
  let payload: jwt.JwtPayload
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as jwt.JwtPayload
  } catch {
    throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'The refresh token is invalid or expired.')
  }
  if (typeof payload.sub !== 'string') throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'The refresh token is invalid.')
  const identity = await IdentityModel.findById(payload.sub).select('+refreshTokenHash')
  if (!identity?.refreshTokenHash || !await bcrypt.compare(token, identity.refreshTokenHash) || identity.status !== 'active') throw new HttpError(401, 'REVOKED_REFRESH_TOKEN', 'The refresh token has been revoked.')
  const user: AuthUser = { id: identity.id, tenantId: identity.tenantId, branchIds: identity.branchIds, roles: identity.roles, permissions: identity.permissions }
  const accessToken = signAccessToken(user)
  const rotatedToken = jwt.sign({ sub: identity.id }, env.JWT_REFRESH_SECRET, { expiresIn: env.REFRESH_TOKEN_TTL as jwt.SignOptions['expiresIn'] })
  identity.refreshTokenHash = await bcrypt.hash(rotatedToken, 12)
  await identity.save()
  response.json({ success: true, message: 'Token refreshed successfully', data: { accessToken, refreshToken: rotatedToken, user } })
}))

export default router
