import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute } from '../../core/http.js'
import { currentUser } from '../../core/scope.js'
import { recordAudit } from '../audit/audit.service.js'
import { TenantSettingsModel } from './settings.model.js'
import { env } from '../../config/env.js'

const router = Router()
const settingsInput = z.object({
  organisation: z.object({ name: z.string().min(2), legalName: z.string().max(200).optional(), registrationNumber: z.string().max(100).optional(), address: z.string().max(500).optional(), phone: z.string().max(50).optional(), email: z.string().email().or(z.literal('')).optional() }),
  branding: z.object({ logoUrl: z.string().max(2_000_000).optional(), signatureUrl: z.string().max(2_000_000).optional(), primaryColor: z.string().max(20).optional(), secondaryColor: z.string().max(20).optional(), currency: z.string().length(3).optional() }),
  preferences: z.object({ defaultBranchId: z.string().optional(), defaultRepaymentFrequency: z.string().optional(), receiptReferenceFormat: z.string().max(80).optional(), notifications: z.record(z.string(), z.boolean()).optional() }).optional(),
})

router.get('/branding', asyncRoute(async (_request, response) => {
  const settings = await TenantSettingsModel.findOne({}).select('organisation.name organisation.legalName branding.logoUrl branding.primaryColor branding.secondaryColor branding.currency preferences.receiptReferenceFormat updatedAt').sort({ updatedAt: -1 }).lean()
  response.setHeader('Cache-Control', 'no-store')
  response.json({ success: true, message: 'Branding retrieved successfully', data: {
    name: String((settings as any)?.organisation?.name || env.DEFAULT_ORG_NAME),
    tagline: env.DEFAULT_ORG_TAGLINE,
    legalName: String((settings as any)?.organisation?.legalName || ''),
    logoUrl: String((settings as any)?.branding?.logoUrl || ''),
    primaryColor: String((settings as any)?.branding?.primaryColor || '#17365d'),
    secondaryColor: String((settings as any)?.branding?.secondaryColor || '#2563eb'),
    currency: String((settings as any)?.branding?.currency || 'UGX'),
    receiptReferenceFormat: String((settings as any)?.preferences?.receiptReferenceFormat || 'RCT-{YYYY}-{SEQ}'),
    updatedAt: (settings as any)?.updatedAt ?? null,
  } })
}))

router.get('/manifest.webmanifest', asyncRoute(async (request, response) => {
  const settings = await TenantSettingsModel.findOne({}).select('organisation.name branding.logoUrl branding.primaryColor updatedAt').sort({ updatedAt: -1 }).lean()
  const name = String((settings as any)?.organisation?.name || env.DEFAULT_ORG_NAME)
  const theme = String((settings as any)?.branding?.primaryColor || '#17365d')
  const version = encodeURIComponent(String((settings as any)?.updatedAt || '1'))
  const logo = String((settings as any)?.branding?.logoUrl || '')
  const icons = logo
    ? [{ src: logo, sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: logo, sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
    : [
      { src: `/icons/icon-192.svg?v=${version}`, sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
      { src: `/icons/icon-512.svg?v=${version}`, sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
      { src: `/icons/icon-192-maskable.svg?v=${version}`, sizes: '192x192', type: 'image/svg+xml', purpose: 'maskable' },
      { src: `/icons/icon-512-maskable.svg?v=${version}`, sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
    ]
  response.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.json({ name: `${name} — Loan Operations`, short_name: name.slice(0, 24), description: `${name} secure loan operations workspace.`, start_url: '/', scope: '/', display: 'standalone', background_color: '#f7f9fc', theme_color: theme, orientation: 'portrait-primary', icons })
}))

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
