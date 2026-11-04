import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute, HttpError } from '../../core/http.js'
import { assertBranchAccess, currentUser } from '../../core/scope.js'
import { ReconciliationModel } from './reconciliation.model.js'

const router = Router()
router.use(requireAuth, requirePermission('accounting.reconciliation.manage'))
router.get('/', asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  if (branchId) assertBranchAccess(request, branchId)
  const data = await ReconciliationModel.find({ tenantId: user.tenantId, ...(branchId ? { branchId } : { branchId: { $in: user.branchIds } }) }).sort({ periodEnd: -1 }).limit(200).lean()
  response.json({ success: true, message: 'Reconciliations retrieved successfully', data })
}))
router.post('/', asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ branchId: z.string(), periodStart: z.coerce.date(), periodEnd: z.coerce.date(), expectedMinor: z.number().int().nonnegative(), actualMinor: z.number().int().nonnegative(), notes: z.string().max(2000).default('') }).refine((value) => value.periodEnd >= value.periodStart, { message: 'periodEnd must be on or after periodStart', path: ['periodEnd'] }).parse(request.body)
  const user = currentUser(request)
  assertBranchAccess(request, input.branchId)
  const status = input.expectedMinor === input.actualMinor ? 'balanced' : 'exception'
  const record = await ReconciliationModel.create({ ...input, tenantId: user.tenantId, discrepancyMinor: input.actualMinor - input.expectedMinor, status })
  response.status(201).json({ success: true, message: 'Reconciliation recorded', data: record })
}))
router.post('/:id/resolve', asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ notes: z.string().min(1).max(2000) }).parse(request.body)
  const user = currentUser(request)
  const record = await ReconciliationModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!record) throw new HttpError(404, 'RECONCILIATION_NOT_FOUND', 'Reconciliation was not found.')
  assertBranchAccess(request, record.branchId)
  if (record.status !== 'exception') throw new HttpError(409, 'RECONCILIATION_NOT_EXCEPTION', 'Only exception reconciliations can be resolved.')
  record.status = 'balanced'; record.notes = input.notes; record.resolvedBy = user.id; record.resolvedAt = new Date(); await record.save()
  response.json({ success: true, message: 'Reconciliation exception resolved', data: record })
}))
router.post('/:id/close', asyncRoute(async (request: AuthRequest, response) => {
  const record = await ReconciliationModel.findOne({ _id: request.params.id, tenantId: currentUser(request).tenantId })
  if (!record) throw new HttpError(404, 'RECONCILIATION_NOT_FOUND', 'Reconciliation was not found.')
  assertBranchAccess(request, record.branchId)
  if (record.status === 'exception') throw new HttpError(409, 'RECONCILIATION_EXCEPTION', 'Resolve reconciliation exceptions before closing.')
  record.status = 'closed'; record.closedBy = currentUser(request).id; await record.save()
  response.json({ success: true, message: 'Reconciliation closed', data: record })
}))
export default router
