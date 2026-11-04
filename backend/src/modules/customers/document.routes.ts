import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute, HttpError } from '../../core/http.js'
import { assertBranchAccess, currentUser } from '../../core/scope.js'
import { createDocumentUploadSignature, inspectUploadedDocument } from '../../infrastructure/storage/cloudinary.js'
import { CustomerModel } from './customer.model.js'
import { recordAudit } from '../audit/audit.service.js'
import { env } from '../../config/env.js'
import { v2 as cloudinary } from 'cloudinary'

const router = Router()
router.use(requireAuth)
router.post('/upload-signature', requirePermission('customers.update'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ customerId: z.string().optional(), branchId: z.string().optional(), mimeType: z.string().min(1), size: z.number().int().positive().max(15 * 1024 * 1024) }).parse(request.body)
  const user = currentUser(request)
  if (input.branchId) assertBranchAccess(request, input.branchId)
  if (input.customerId && !await CustomerModel.exists({ _id: input.customerId, tenantId: user.tenantId, ...(input.branchId ? { branchId: input.branchId } : {}) })) throw new HttpError(404, 'CUSTOMER_NOT_FOUND', 'Customer was not found.')
  response.json({ success: true, message: 'Secure document upload signature created', data: createDocumentUploadSignature({ tenantId: user.tenantId, customerId: input.customerId }) })
}))

router.post('/metadata', requirePermission('customers.update'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ customerId: z.string(), branchId: z.string(), key: z.string().min(3), name: z.string().min(1), mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png']), size: z.number().int().positive().max(15 * 1024 * 1024), storageKey: z.string().min(3) }).parse(request.body)
  const user = currentUser(request)
  assertBranchAccess(request, input.branchId)
  const customer = await CustomerModel.findOne({ _id: input.customerId, tenantId: user.tenantId, branchId: input.branchId })
  if (!customer) throw new HttpError(404, 'CUSTOMER_NOT_FOUND', 'Customer was not found.')
  customer.documents.push({ ...input, status: 'pending_scan' })
  customer.version += 1
  await customer.save()
  await recordAudit({ user, action: 'customer.document_uploaded', entityType: 'customer_document', entityId: input.key, branchId: input.branchId, next: { customerId: input.customerId, status: 'pending_scan' } })
  response.status(201).json({ success: true, message: 'Document metadata recorded pending scan', data: customer.documents[customer.documents.length - 1] })
}))

router.get('/:customerId/:key', requirePermission('customers.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const customer = await CustomerModel.findOne({ _id: request.params.customerId, tenantId: user.tenantId })
  const document = customer?.documents.find((item) => item.key === request.params.key)
  if (!customer || !document || document.status !== 'available') throw new HttpError(404, 'DOCUMENT_NOT_AVAILABLE', 'The document is not available for download.')
  const resource = await inspectUploadedDocument(document.storageKey)
  await recordAudit({ user, action: 'customer.document_downloaded', entityType: 'customer_document', entityId: document.key, branchId: customer.branchId, next: { status: document.status } })
  response.json({ success: true, message: 'Secure document metadata retrieved', data: { url: resource.secure_url, expiresInSeconds: 300 } })
}))

router.post('/webhook', asyncRoute(async (request, response) => {
  const timestamp = request.header('x-cld-timestamp')
  const signature = request.header('x-cld-signature')
  if (!timestamp || !signature || !env.CLOUDINARY_API_SECRET) throw new HttpError(401, 'INVALID_WEBHOOK', 'Cloudinary webhook signature is missing.')
  const payload = request.body as Record<string, unknown>
  const expected = cloudinary.utils.api_sign_request({ ...payload, timestamp }, env.CLOUDINARY_API_SECRET)
  if (expected !== signature) throw new HttpError(401, 'INVALID_WEBHOOK', 'Cloudinary webhook signature is invalid.')
  const storageKey = typeof payload.public_id === 'string' ? payload.public_id : ''
  const status = payload.moderation_status === 'approved' || payload.scan_status === 'clean' ? 'available' : payload.moderation_status === 'rejected' || payload.scan_status === 'infected' ? 'rejected' : 'pending_scan'
  if (storageKey) await CustomerModel.updateMany({ 'documents.storageKey': storageKey }, { $set: { 'documents.$.status': status } })
  response.json({ success: true, message: 'Cloudinary webhook processed', data: null })
}))
export default router
