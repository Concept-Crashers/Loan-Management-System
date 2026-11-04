import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute } from '../../core/http.js'
import { assertBranchAccess, currentUser } from '../../core/scope.js'
import { SyncCounterModel, SyncOperationModel } from './sync.model.js'
import { DeviceModel } from './device.model.js'

const router = Router()
router.use(requireAuth)
const operation = z.object({ operationId: z.string().min(1), batchId: z.string().min(1), deviceId: z.string().min(1), branchId: z.string().min(1), entityType: z.string().min(1), entityId: z.string().min(1), operation: z.enum(['create', 'update', 'capture']), payload: z.record(z.string(), z.unknown()), createdAtClient: z.coerce.date() })

router.post('/register-device', requirePermission('devices.register'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ deviceId: z.string().min(3), branchId: z.string().min(1), label: z.string().min(2) }).parse(request.body)
  const user = currentUser(request)
  assertBranchAccess(request, input.branchId)
  const device = await DeviceModel.findOneAndUpdate({ tenantId: user.tenantId, deviceId: input.deviceId }, { $set: { userId: user.id, branchId: input.branchId, label: input.label, status: 'active', lastSeenAt: new Date() } }, { upsert: true, new: true, setDefaultsOnInsert: true })
  response.status(201).json({ success: true, message: 'Device registered successfully', data: device })
}))

router.post('/revoke-device', requirePermission('devices.revoke'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ deviceId: z.string().min(3) }).parse(request.body)
  const user = currentUser(request)
  const device = await DeviceModel.findOneAndUpdate({ tenantId: user.tenantId, deviceId: input.deviceId }, { $set: { status: 'revoked' } }, { new: true })
  response.json({ success: true, message: 'Device revoked successfully', data: device })
}))

router.post('/push', requirePermission('devices.register'), asyncRoute(async (request: AuthRequest, response) => {
  const parsed = z.object({ operations: z.array(operation).min(1).max(100) }).parse(request.body)
  const user = currentUser(request)
  const acknowledgements = []
  for (const item of parsed.operations) {
    assertBranchAccess(request, item.branchId)
    const device = await DeviceModel.findOne({ tenantId: user.tenantId, deviceId: item.deviceId, userId: user.id, branchId: item.branchId, status: 'active' })
    if (!device) { acknowledgements.push({ operationId: item.operationId, status: 'rejected', reason: 'DEVICE_NOT_REGISTERED' }); continue }
    const existing = await SyncOperationModel.findOne({ tenantId: user.tenantId, operationId: item.operationId }).lean()
    if (existing) { acknowledgements.push({ operationId: item.operationId, status: existing.status, duplicate: true }); continue }
    const counter = await SyncCounterModel.findOneAndUpdate({ tenantId: user.tenantId }, { $inc: { value: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true })
    const created = await SyncOperationModel.create({ ...item, tenantId: user.tenantId, sequence: counter.value, status: item.operation === 'capture' ? 'pending_review' : 'accepted' })
    acknowledgements.push({ operationId: item.operationId, status: created.status, duplicate: false })
  }
  response.json({ success: true, message: 'Synchronisation batch processed', data: { acknowledgements } })
}))

router.get('/status', requirePermission('devices.register'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const data = await SyncOperationModel.aggregate([{ $match: { tenantId: user.tenantId } }, { $group: { _id: '$status', count: { $sum: 1 } } }])
  response.json({ success: true, message: 'Synchronisation status retrieved successfully', data })
}))

router.get('/pull', requirePermission('devices.register'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const cursor = request.query.cursor ? Number(request.query.cursor) : 0
  if (!Number.isSafeInteger(cursor) || cursor < 0) {
    response.status(400).json({ success: false, message: 'Cursor must be a non-negative sequence number.', code: 'INVALID_CURSOR', errors: [] })
    return
  }
  const deviceId = z.string().min(3).parse(request.query.deviceId)
  const device = await DeviceModel.findOne({ tenantId: user.tenantId, deviceId, userId: user.id, status: 'active' })
  if (!device) { response.status(403).json({ success: false, message: 'Device is not registered.', code: 'DEVICE_NOT_REGISTERED' }); return }
  const data = await SyncOperationModel.find({ tenantId: user.tenantId, status: 'accepted', branchId: { $in: user.branchIds }, sequence: { $gt: cursor } }).sort({ sequence: 1 }).limit(100).lean()
  const last = data[data.length - 1]
  response.json({ success: true, message: 'Synchronisation changes retrieved successfully', data, meta: { nextCursor: last?.sequence ?? cursor } })
}))

router.post('/acknowledge', requirePermission('devices.register'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ deviceId: z.string().min(3), operationIds: z.array(z.string()).min(1) }).parse(request.body)
  const user = currentUser(request)
  const device = await DeviceModel.exists({ tenantId: user.tenantId, deviceId: input.deviceId, userId: user.id, status: 'active' })
  if (!device) { response.status(403).json({ success: false, message: 'Device is not registered.', code: 'DEVICE_NOT_REGISTERED' }); return }
  const result = await SyncOperationModel.updateMany({ tenantId: user.tenantId, operationId: { $in: input.operationIds }, deviceId: input.deviceId }, { $set: { status: 'accepted' } })
  response.json({ success: true, message: 'Synchronisation operations acknowledged', data: { acknowledged: result.modifiedCount } })
}))

router.post('/retry', requirePermission('devices.register'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ deviceId: z.string().min(3), operationIds: z.array(z.string()).min(1) }).parse(request.body)
  const user = currentUser(request)
  const device = await DeviceModel.exists({ tenantId: user.tenantId, deviceId: input.deviceId, userId: user.id, status: 'active' })
  if (!device) { response.status(403).json({ success: false, message: 'Device is not registered.', code: 'DEVICE_NOT_REGISTERED' }); return }
  const result = await SyncOperationModel.updateMany({ tenantId: user.tenantId, operationId: { $in: input.operationIds }, deviceId: input.deviceId, status: 'rejected' }, { $set: { status: 'pending_review' } })
  response.json({ success: true, message: 'Synchronisation retries queued', data: { queued: result.modifiedCount } })
}))

export default router
