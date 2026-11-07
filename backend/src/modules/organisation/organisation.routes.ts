import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute, HttpError } from '../../core/http.js'
import { currentUser } from '../../core/scope.js'
import { recordAudit } from '../audit/audit.service.js'
import { BranchModel, StaffAssignmentModel } from './organisation.model.js'
import { IdentityModel } from '../identity/identity.model.js'
import { pagination, paged } from '../../core/pagination.js'

const router = Router()
router.use(requireAuth)
router.get('/branches', requirePermission('branches.view'), asyncRoute(async (request: AuthRequest, response) => {
  const result = await paged(BranchModel, { tenantId: currentUser(request).tenantId }, pagination(request), { name: 1 })
  response.json({ success: true, message: 'Branches retrieved successfully', ...result })
}))
router.post('/branches', requirePermission('branches.manage'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ code: z.string().min(2), name: z.string().min(2), district: z.string().min(2), managerId: z.string().optional() }).parse(request.body)
  const user = currentUser(request)
  if (input.managerId) {
    const mgr = await IdentityModel.findOne({ _id: input.managerId, tenantId: user.tenantId }).select('_id').lean()
    if (!mgr) throw new HttpError(404, 'MANAGER_NOT_FOUND', 'Selected branch manager was not found.')
  }
  const branch = await BranchModel.create({ ...input, tenantId: user.tenantId })
  await recordAudit({ user, action: 'branch.created', entityType: 'branch', entityId: branch.id, next: { code: branch.code, name: branch.name, managerId: branch.managerId } })
  response.status(201).json({ success: true, message: 'Branch created successfully', data: branch })
}))
router.patch('/branches/:id', requirePermission('branches.manage'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ code: z.string().min(2).optional(), name: z.string().min(2).optional(), district: z.string().min(2).optional(), managerId: z.string().nullable().optional(), status: z.enum(['active', 'suspended']).optional() }).parse(request.body)
  const user = currentUser(request)
  if (input.managerId) {
    const mgr = await IdentityModel.findOne({ _id: input.managerId, tenantId: user.tenantId }).select('_id').lean()
    if (!mgr) throw new HttpError(404, 'MANAGER_NOT_FOUND', 'Selected branch manager was not found.')
  }
  const branch = await BranchModel.findOneAndUpdate({ _id: request.params.id, tenantId: user.tenantId }, { $set: input }, { new: true })
  if (!branch) throw new HttpError(404, 'BRANCH_NOT_FOUND', 'Branch was not found.')
  await recordAudit({ user, action: 'branch.updated', entityType: 'branch', entityId: branch.id, next: input })
  response.json({ success: true, message: 'Branch updated successfully', data: branch })
}))
router.get('/staff', requirePermission('identity.users.view'), asyncRoute(async (request: AuthRequest, response) => {
  const result = await paged(StaffAssignmentModel, { tenantId: currentUser(request).tenantId }, pagination(request), { createdAt: -1 })
  const data = await StaffAssignmentModel.populate(result.data, { path: 'userId', select: 'name email status' })
  response.json({ success: true, message: 'Staff assignments retrieved successfully', data, meta: result.meta })
}))
router.post('/staff', requirePermission('identity.users.update'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ userId: z.string().min(1), branchId: z.string().min(1), roles: z.array(z.string()).min(1) }).parse(request.body)
  const user = currentUser(request)
  const [identity, branch] = await Promise.all([IdentityModel.findOne({ _id: input.userId, tenantId: user.tenantId }), BranchModel.findOne({ _id: input.branchId, tenantId: user.tenantId })])
  if (!identity || !branch) throw new HttpError(404, 'ASSIGNMENT_TARGET_NOT_FOUND', 'Staff member or branch was not found.')
  const assignment = await StaffAssignmentModel.findOneAndUpdate({ tenantId: user.tenantId, userId: input.userId, branchId: input.branchId }, { $set: { roles: input.roles, status: 'active' } }, { upsert: true, new: true, setDefaultsOnInsert: true })
  await recordAudit({ user, action: 'staff.assigned', entityType: 'staff_assignment', entityId: assignment.id, branchId: input.branchId, next: { roles: input.roles } })
  response.status(201).json({ success: true, message: 'Staff assignment saved successfully', data: assignment })
}))
export default router
