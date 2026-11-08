import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { HttpError, asyncRoute } from '../../core/http.js'
import { signAccessToken, type AuthUser, requireAuth, type AuthRequest, requirePermission } from '../../core/auth.js'
import { currentUser } from '../../core/scope.js'
import { IdentityModel } from './identity.model.js'
import { RolePermissionModel } from './role-permission.model.js'
import { ALL_PERMISSIONS, DEFAULT_ROLES, PERMISSION_GROUPS, displayRoleName, normalizeRoleName } from './permissions.js'
import { emailProvider } from '../../infrastructure/messaging/providers.js'
import { recordAudit } from '../audit/audit.service.js'

const router = Router()
const loginSchema = z.object({ email: z.email(), password: z.string().min(1), mfaCode: z.string().optional() })
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters.').regex(/[A-Z]/, 'Password must contain an uppercase letter.').regex(/[a-z]/, 'Password must contain a lowercase letter.').regex(/[0-9]/, 'Password must contain a number.')
const token = () => crypto.randomBytes(32).toString('base64url')
const tokenHash = (value: string) => crypto.createHash('sha256').update(value).digest('hex')
const encryptionKey = () => crypto.createHash('sha256').update(env.JWT_ACCESS_SECRET).digest()
function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`
}
function decryptSecret(value: string) {
  const [iv, tag, encrypted] = value.split('.')
  if (!iv || !tag || !encrypted) throw new Error('Invalid encrypted MFA secret.')
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8')
}
function base32Decode(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of value.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, '0')
  const bytes: number[] = []
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2))
  return Buffer.from(bytes)
}
function validTotp(secret: string, input: string) {
  if (!/^\d{6}$/.test(input)) return false
  const counter = Math.floor(Date.now() / 1000 / 30)
  return [-1, 0, 1].some((offset) => {
    const message = Buffer.alloc(8)
    message.writeBigInt64BE(BigInt(counter + offset))
    const digest = crypto.createHmac('sha1', base32Decode(secret)).update(message).digest()
    const start = digest[digest.length - 1]! & 15
    const value = (digest[start]! & 127) * 2 ** 24 + digest[start + 1]! * 2 ** 16 + digest[start + 2]! * 2 ** 8 + digest[start + 3]!
    return String(value % 1_000_000).padStart(6, '0') === input
  })
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
    if (role === 'admin') return [...ALL_PERMISSIONS]
    return []
  })
  return [...new Set([...(explicit ?? []), ...rolePerms].filter(Boolean))]
}

function publicUser(identity: { id: string; name?: string; email?: string; phone?: string; tenantId: string; branchIds: string[]; roles: string[]; permissions: string[]; mfaEnabled?: boolean }): AuthUser & { mfaEnabled?: boolean; phone?: string } {
  return { id: identity.id, name: identity.name, email: identity.email, phone: identity.phone, tenantId: identity.tenantId, branchIds: identity.branchIds, roles: identity.roles, permissions: identity.permissions, mfaEnabled: identity.mfaEnabled }
}

router.post('/login', asyncRoute(async (request, response) => {
  const input = loginSchema.parse(request.body)
  const identity = await IdentityModel.findOne({ email: input.email }).select('+passwordHash +mfaSecret')
  if (!identity) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.')
  const valid = identity.status === 'active' && (!identity.lockedUntil || identity.lockedUntil <= new Date()) && await bcrypt.compare(input.password, identity.passwordHash)
  if (!valid) {
    if (identity) {
      identity.failedLoginCount += 1
      if (identity.failedLoginCount >= 5) identity.lockedUntil = new Date(Date.now() + 15 * 60 * 1000)
      await identity.save()
    }
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.')
  }
  if (identity.mfaEnabled && (!input.mfaCode || !identity.mfaSecret || !validTotp(decryptSecret(identity.mfaSecret), input.mfaCode))) throw new HttpError(401, 'MFA_REQUIRED', 'A valid MFA code is required.')
  const permissions = await resolveEffectivePermissions(identity.tenantId, identity.roles, identity.permissions)
  const user = publicUser({ id: identity.id, name: identity.name, email: identity.email, phone: (identity as any).phone, tenantId: identity.tenantId, branchIds: identity.branchIds, roles: identity.roles, permissions, mfaEnabled: identity.mfaEnabled })
  const accessToken = signAccessToken(user)
  const refreshToken = jwt.sign({ sub: identity.id }, env.JWT_REFRESH_SECRET, { expiresIn: env.REFRESH_TOKEN_TTL as jwt.SignOptions['expiresIn'] })
  identity.refreshTokenHash = await bcrypt.hash(refreshToken, 12)
  identity.failedLoginCount = 0
  await identity.save()
  response.cookie('lendflow_refresh', refreshToken, { httpOnly: true, secure: true, sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 30 * 24 * 60 * 60 * 1000, path: '/api/v1/auth' })
  response.json({ success: true, message: 'Signed in successfully', data: { accessToken, user } })
}))

router.post('/mfa/enrol', requireAuth, asyncRoute(async (request: AuthRequest, response) => {
  const identity = await IdentityModel.findById(request.user?.id)
  if (!identity) throw new HttpError(404, 'IDENTITY_NOT_FOUND', 'Account was not found.')
  const secret = crypto.randomBytes(20).toString('base64').replace(/[^A-Z2-7]/gi, '').slice(0, 32).toUpperCase()
  identity.mfaSecret = encryptSecret(secret)
  identity.mfaEnabled = false
  await identity.save()
  response.json({ success: true, message: 'MFA enrollment started.', data: { secret, issuer: 'Trust Loans', account: identity.email } })
}))

router.post('/mfa/enable', requireAuth, asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(request.body)
  const identity = await IdentityModel.findById(request.user?.id).select('+mfaSecret')
  if (!identity?.mfaSecret || !validTotp(decryptSecret(identity.mfaSecret), input.code)) throw new HttpError(400, 'INVALID_MFA_CODE', 'The MFA code is invalid.')
  identity.mfaEnabled = true
  await identity.save()
  response.json({ success: true, message: 'MFA enabled successfully.', data: null })
}))

router.post('/mfa/disable', requireAuth, asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(request.body)
  const identity = await IdentityModel.findById(request.user?.id).select('+mfaSecret')
  if (!identity?.mfaSecret || !validTotp(decryptSecret(identity.mfaSecret), input.code)) throw new HttpError(400, 'INVALID_MFA_CODE', 'The MFA code is invalid.')
  identity.mfaEnabled = false
  identity.mfaSecret = undefined
  await identity.save()
  response.json({ success: true, message: 'MFA disabled successfully.', data: null })
}))

router.post('/forgot-password', asyncRoute(async (request, response) => {
  const input = z.object({ email: z.email() }).parse(request.body)
  const identity = await IdentityModel.findOne({ email: input.email })
  if (identity) {
    const rawToken = token()
    identity.passwordResetTokenHash = tokenHash(rawToken)
    identity.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000)
    await identity.save()
    await emailProvider.send({ to: identity.email, subject: 'Reset your Trust Loans password', body: `Use this one-time reset token: ${rawToken}` })
  }
  response.json({ success: true, message: 'If the account exists, password reset instructions have been sent.', data: null })
}))

router.post('/reset-password', asyncRoute(async (request, response) => {
  const input = z.object({ token: z.string().min(20), password: passwordSchema }).parse(request.body)
  const identity = await IdentityModel.findOne({ passwordResetTokenHash: tokenHash(input.token), passwordResetExpiresAt: { $gt: new Date() } }).select('+passwordHash')
  if (!identity) throw new HttpError(400, 'INVALID_RESET_TOKEN', 'The password reset token is invalid or expired.')
  identity.passwordHash = await bcrypt.hash(input.password, 12)
  identity.passwordResetTokenHash = undefined
  identity.passwordResetExpiresAt = undefined
  identity.refreshTokenHash = undefined
  await identity.save()
  response.json({ success: true, message: 'Password reset successfully. Sign in again on your devices.', data: null })
}))

router.post('/change-password', requireAuth, asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }).parse(request.body)
  const identity = await IdentityModel.findById(request.user?.id).select('+passwordHash')
  if (!identity || !await bcrypt.compare(input.currentPassword, identity.passwordHash)) throw new HttpError(400, 'INVALID_PASSWORD', 'The current password is incorrect.')
  identity.passwordHash = await bcrypt.hash(input.newPassword, 12)
  identity.refreshTokenHash = undefined
  await identity.save()
  response.json({ success: true, message: 'Password changed successfully. Sign in again.', data: null })
}))

router.post('/verify-email/request', requireAuth, asyncRoute(async (request: AuthRequest, response) => {
  const identity = await IdentityModel.findById(request.user?.id)
  if (!identity) throw new HttpError(404, 'IDENTITY_NOT_FOUND', 'Account was not found.')
  const rawToken = token()
  identity.emailVerificationTokenHash = tokenHash(rawToken)
  identity.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  await identity.save()
  await emailProvider.send({ to: identity.email, subject: 'Verify your Trust Loans email', body: `Use this one-time verification token: ${rawToken}` })
  response.json({ success: true, message: 'Verification instructions sent.', data: null })
}))

router.post('/verify-email', asyncRoute(async (request, response) => {
  const input = z.object({ token: z.string().min(20) }).parse(request.body)
  const identity = await IdentityModel.findOne({ emailVerificationTokenHash: tokenHash(input.token), emailVerificationExpiresAt: { $gt: new Date() } })
  if (!identity) throw new HttpError(400, 'INVALID_VERIFICATION_TOKEN', 'The email verification token is invalid or expired.')
  identity.emailVerifiedAt = new Date()
  identity.emailVerificationTokenHash = undefined
  identity.emailVerificationExpiresAt = undefined
  await identity.save()
  response.json({ success: true, message: 'Email verified successfully.', data: null })
}))

router.get('/me', requireAuth, asyncRoute(async (request: AuthRequest, response) => {
  const identity = await IdentityModel.findById(request.user?.id).lean()
  if (!identity) throw new HttpError(404, 'IDENTITY_NOT_FOUND', 'Account was not found.')
  const permissions = await resolveEffectivePermissions(identity.tenantId, identity.roles ?? [], identity.permissions ?? [])
  response.json({ success: true, message: 'Identity retrieved successfully', data: publicUser({ id: String(identity._id), name: identity.name, email: identity.email, phone: (identity as any).phone, tenantId: identity.tenantId, branchIds: identity.branchIds ?? [], roles: identity.roles ?? [], permissions, mfaEnabled: identity.mfaEnabled }) })
}))

router.patch('/me', requireAuth, asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ name: z.string().min(2).max(120).optional(), phone: z.string().max(40).optional(), email: z.email().optional() }).parse(request.body)
  const identity = await IdentityModel.findById(request.user?.id)
  if (!identity) throw new HttpError(404, 'IDENTITY_NOT_FOUND', 'Account was not found.')
  if (input.email !== undefined && input.email.toLowerCase() !== identity.email) {
    const exists = await IdentityModel.findOne({ tenantId: identity.tenantId, email: input.email.toLowerCase(), _id: { $ne: identity._id } }).lean()
    if (exists) throw new HttpError(409, 'EMAIL_IN_USE', 'That email address is already in use.')
    identity.email = input.email.toLowerCase()
    ;(identity as any).emailVerifiedAt = undefined
  }
  if (input.name !== undefined) identity.name = input.name
  if (input.phone !== undefined) (identity as any).phone = input.phone
  await identity.save()
  response.json({ success: true, message: 'Profile updated successfully', data: publicUser({ id: identity.id, name: identity.name, email: identity.email, phone: (identity as any).phone, tenantId: identity.tenantId, branchIds: identity.branchIds, roles: identity.roles, permissions: identity.permissions, mfaEnabled: identity.mfaEnabled }) })
}))

router.post('/users', requireAuth, requirePermission('identity.users.create'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ name: z.string().min(2).max(120), email: z.email(), password: passwordSchema, phone: z.string().max(40).optional(), roles: z.array(z.string()).min(1), branchIds: z.array(z.string()).optional(), permissions: z.array(z.string()).optional() }).parse(request.body)
  const admin = currentUser(request)
  const exists = await IdentityModel.findOne({ tenantId: admin.tenantId, email: input.email.toLowerCase() }).lean()
  if (exists) throw new HttpError(409, 'EMAIL_IN_USE', 'That email address is already in use.')
  const identity = await IdentityModel.create({ tenantId: admin.tenantId, name: input.name, email: input.email.toLowerCase(), phone: input.phone ?? '', passwordHash: await bcrypt.hash(input.password, 12), roles: input.roles, branchIds: input.branchIds ?? [], permissions: input.permissions ?? [], status: 'active' })
  response.status(201).json({ success: true, message: 'Staff user created successfully', data: publicUser({ id: identity.id, name: identity.name, email: identity.email, phone: (identity as any).phone, tenantId: identity.tenantId, branchIds: identity.branchIds, roles: identity.roles, permissions: identity.permissions, mfaEnabled: identity.mfaEnabled }) })
}))

router.get('/users', requireAuth, requirePermission('identity.users.view'), asyncRoute(async (request: AuthRequest, response) => {
  const admin = currentUser(request)
  const users = await IdentityModel.find({ tenantId: admin.tenantId }).select('name email phone roles branchIds status createdAt').sort({ createdAt: -1 }).limit(200).lean()
  response.json({ success: true, message: 'Users retrieved successfully', data: users.map((u) => ({ id: String(u._id), name: u.name, email: u.email, phone: (u as any).phone ?? '', roles: u.roles ?? [], branchIds: u.branchIds ?? [], status: u.status })) })
}))

router.patch('/users/:id', requireAuth, requirePermission('identity.users.update'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ name: z.string().min(2).max(120).optional(), email: z.email().optional(), phone: z.string().max(40).optional(), roles: z.array(z.string()).min(1).optional(), branchIds: z.array(z.string()).optional(), status: z.enum(['active', 'inactive', 'suspended']).optional() }).parse(request.body)
  const admin = currentUser(request)
  const identity = await IdentityModel.findOne({ _id: request.params.id, tenantId: admin.tenantId })
  if (!identity) throw new HttpError(404, 'IDENTITY_NOT_FOUND', 'Staff user was not found.')
  if (input.email !== undefined && input.email.toLowerCase() !== identity.email) {
    const exists = await IdentityModel.findOne({ tenantId: admin.tenantId, email: input.email.toLowerCase(), _id: { $ne: identity._id } }).lean()
    if (exists) throw new HttpError(409, 'EMAIL_IN_USE', 'That email address is already in use.')
    identity.email = input.email.toLowerCase()
  }
  if (input.name !== undefined) identity.name = input.name
  if (input.phone !== undefined) (identity as any).phone = input.phone
  if (input.roles !== undefined) identity.roles = input.roles
  if (input.branchIds !== undefined) identity.branchIds = input.branchIds
  if (input.status !== undefined) (identity as any).status = input.status
  await identity.save()
  response.json({ success: true, message: 'Staff user updated successfully', data: publicUser({ id: identity.id, name: identity.name, email: identity.email, phone: (identity as any).phone, tenantId: identity.tenantId, branchIds: identity.branchIds, roles: identity.roles, permissions: identity.permissions, mfaEnabled: identity.mfaEnabled }) })
}))

router.post('/logout', requireAuth, asyncRoute(async (request: AuthRequest, response) => {
  await IdentityModel.updateOne({ _id: request.user?.id }, { $unset: { refreshTokenHash: 1 } })
  response.clearCookie('lendflow_refresh', { httpOnly: true, secure: true, sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax', path: '/api/v1/auth' })
  response.json({ success: true, message: 'Signed out successfully', data: null })
}))

router.post('/refresh', asyncRoute(async (request, response) => {
  const cookieHeader = request.header('cookie') ?? ''
  const cookieToken = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith('lendflow_refresh='))?.slice('lendflow_refresh='.length)
  const token = cookieToken ?? z.object({ refreshToken: z.string().min(1) }).parse(request.body).refreshToken
  let payload: jwt.JwtPayload
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as jwt.JwtPayload
  } catch {
    throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'The refresh token is invalid or expired.')
  }
  if (typeof payload.sub !== 'string') throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'The refresh token is invalid.')
  const identity = await IdentityModel.findById(payload.sub).select('+refreshTokenHash')
  if (!identity?.refreshTokenHash || !await bcrypt.compare(token, identity.refreshTokenHash) || identity.status !== 'active') throw new HttpError(401, 'REVOKED_REFRESH_TOKEN', 'The refresh token has been revoked.')
  const permissions = await resolveEffectivePermissions(identity.tenantId, identity.roles, identity.permissions)
  const user: AuthUser = { id: identity.id, tenantId: identity.tenantId, branchIds: identity.branchIds, roles: identity.roles, permissions }
  const accessToken = signAccessToken(user)
  const rotatedToken = jwt.sign({ sub: identity.id }, env.JWT_REFRESH_SECRET, { expiresIn: env.REFRESH_TOKEN_TTL as jwt.SignOptions['expiresIn'] })
  identity.refreshTokenHash = await bcrypt.hash(rotatedToken, 12)
  await identity.save()
  response.cookie('lendflow_refresh', rotatedToken, { httpOnly: true, secure: true, sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 30 * 24 * 60 * 60 * 1000, path: '/api/v1/auth' })
  response.json({ success: true, message: 'Token refreshed successfully', data: { accessToken, user } })
}))

router.post('/users/:id/reset-password', requireAuth, requirePermission('identity.users.update'), asyncRoute(async (request: AuthRequest, response) => {
  const admin = currentUser(request)
  const identity = await IdentityModel.findOne({ _id: request.params.id, tenantId: admin.tenantId })
  if (!identity) throw new HttpError(404, 'IDENTITY_NOT_FOUND', 'Staff user was not found.')
  const rawToken = token()
  identity.passwordResetTokenHash = tokenHash(rawToken)
  identity.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000)
  identity.refreshTokenHash = undefined
  await identity.save()
  await emailProvider.send({ to: identity.email, subject: 'Reset your Trust Loans password', body: `An administrator initiated a password reset for your Trust Loans account. Use this one-time reset token: ${rawToken}` }).catch(() => {})
  response.json({ success: true, message: 'Password reset initiated. Share the reset instructions securely if email delivery is unavailable.', data: { resetToken: rawToken, email: identity.email } })
}))

router.get('/roles/catalog', requireAuth, requirePermission('identity.roles.view'), asyncRoute(async (request: AuthRequest, response) => {
  const admin = currentUser(request)
  const mappings = await RolePermissionModel.find({ tenantId: admin.tenantId }).select('role normalizedRole permissions description updatedAt updatedBy').lean()
  const mapByRole = new Map(mappings.map((m) => [m.normalizedRole, m]))
  const roles = [...new Set([...DEFAULT_ROLES, ...mappings.map((m) => m.normalizedRole)])].map((normalized) => {
    const mapped = mapByRole.get(normalized)
    const permissions = normalized === 'super_admin' || normalized === 'superadmin'
      ? ['*', ...ALL_PERMISSIONS]
      : (mapped?.permissions ?? (normalized === 'admin' ? [...ALL_PERMISSIONS] : []))
    return { role: mapped?.role || displayRoleName(normalized), normalizedRole: normalized, permissions: [...new Set(permissions)], description: mapped?.description ?? '', updatedAt: mapped?.updatedAt ?? null, locked: ['super_admin', 'superadmin'].includes(normalized), defaulted: !mapped && normalized === 'admin' }
  })
  response.json({ success: true, message: 'Role permissions retrieved successfully', data: { roles, permissions: ALL_PERMISSIONS, groups: PERMISSION_GROUPS } })
}))

router.put('/roles/:role', requireAuth, requirePermission('identity.roles.manage'), asyncRoute(async (request: AuthRequest, response) => {
  const admin = currentUser(request)
  const normalized = normalizeRoleName(String(request.params.role ?? ''))
  if (!normalized) throw new HttpError(400, 'INVALID_ROLE', 'Role name is required.')
  if (['super_admin', 'superadmin'].includes(normalized)) throw new HttpError(400, 'ROLE_LOCKED', 'Super Admin is the overall system role and always has full access; it cannot be restricted here.')
  const input = z.object({ permissions: z.array(z.string()).default([]), description: z.string().max(500).optional(), roleLabel: z.string().max(120).optional() }).parse(request.body)
  const allowed = new Set(ALL_PERMISSIONS as readonly string[])
  const permissions = [...new Set((input.permissions ?? []).filter((p) => p && p !== '*' && allowed.has(p)))]
  const role = await RolePermissionModel.findOneAndUpdate(
    { tenantId: admin.tenantId, normalizedRole: normalized },
    { $set: { tenantId: admin.tenantId, role: input.roleLabel?.trim() || displayRoleName(normalized), normalizedRole: normalized, permissions, description: input.description ?? '', updatedBy: admin.id } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  await recordAudit({ user: admin, action: 'identity.role_permissions.updated', entityType: 'role_permission', entityId: String(role._id), next: { role: role.role, normalizedRole: normalized, permissions } })
  response.json({ success: true, message: 'Role permissions saved successfully', data: { role: role.role, normalizedRole: role.normalizedRole, permissions: role.permissions, description: role.description ?? '' } })
}))

export default router
