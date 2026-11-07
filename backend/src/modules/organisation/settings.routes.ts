import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute } from '../../core/http.js'
import { currentUser } from '../../core/scope.js'
import { recordAudit } from '../audit/audit.service.js'
import { TenantSettingsModel } from './settings.model.js'

const router = Router()
const settingsInput = z.object({
  organisation: z.object({ name: z.string().min(2), legalName: z.string().max(200).optional(), registrationNumber: z.string().max(100).optional(), address: z.string().max(500).optional(), phone: z.string().max(50).optional(), email: z.string().email().or(z.literal('')).optional() }),
  branding: z.object({ logoUrl: z.string().max(2_000_000).optional(), primaryColor: z.string().max(20).optional(), secondaryColor: z.string().max(20).optional(), currency: z.string().length(3).optional() }),
  preferences: z.object({ defaultBranchId: z.string().optional(), defaultRepaymentFrequency: z.string().optional(), receiptReferenceFormat: z.string().max(80).optional(), notifications: z.record(z.string(), z.boolean()).optional() }).optional(),
})
router.use(requireAuth)
router.get('/settings', requirePermission('organisation.settings.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const settings = await TenantSettingsModel.findOneAndUpdate({ tenantId: user.tenantId }, { $setOnInsert: { tenantId: user.tenantId } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean()
  response.json({ success: true, message: 'Organisation settings retrieved successfully', data: settings })
}))
router.put('/settings', requirePermission('organisation.settings.manage'), asyncRoute(async (request: AuthRequest, response) => {
  const input = settingsInput.parse(request.body)
  const user = currentUser(request)
  const settings = await TenantSettingsModel.findOneAndUpdate({ tenantId: user.tenantId }, { $set: { ...input, updatedBy: user.id } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true })
  await recordAudit({ user, action: 'organisation.settings.updated', entityType: 'tenant_settings', entityId: settings.id, next: input })
  response.json({ success: true, message: 'Organisation settings saved successfully', data: settings })
}))
export default router
