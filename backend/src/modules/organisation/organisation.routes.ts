import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute, HttpError } from '../../core/http.js'
import { currentUser } from '../../core/scope.js'
import { recordAudit } from '../audit/audit.service.js'
import { BranchModel, StaffAssignmentModel } from './organisation.model.js'
import { IdentityModel } from '../identity/identity.model.js'

const router = Router()
router.use(requireAuth)
router.get('/branches', requirePermission('branches.view'), asyncRoute(async (request: AuthRequest, response) => {
  const data = await BranchModel.find({ tenantId: currentUser(request).tenantId }).sort({ name: 1 }).lean()
  response.json({ success: true, message: 'Branches retrieved successfully', data })
}))
router.post('/branches', requirePermission('branches.manage'), asyncRoute(async (request: AuthRequest, response) => {
  const input = z.object({ code: z.string().min(2), name: z.string().min(2), district: z.string().min(2) }).parse(request.body)
  const user = currentUser(request)
  const branch = await BranchModel.create({ ...input, tenantId: user.tenantId })
  await recordAudit({ user, action: 'branch.created', entityType: 'branch', entityId: branch.id, next: { code: branch.code, name: branch.name } })
  response.status(201).json({ success: true, message: 'Branch created successfully', data: branch })
}))
router.get('/staff', requirePermission('identity.users.view'), asyncRoute(async (request: AuthRequest, response) => {
  const data = await StaffAssignmentModel.find({ tenantId: currentUser(request).tenantId }).populate('userId', 'name email status').lean()
  response.json({ success: true, message: 'Staff assignments retrieved successfully', data })
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
