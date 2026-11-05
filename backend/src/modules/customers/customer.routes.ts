import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute, HttpError } from '../../core/http.js'
import { assertBranchAccess, currentUser } from '../../core/scope.js'
import { recordAudit } from '../audit/audit.service.js'
import { CustomerModel } from './customer.model.js'

const router = Router()
const customerInput = z.object({
  branchId: z.string().min(1), name: z.string().min(3), phone: z.string().min(7), email: z.email().optional().or(z.literal('')),
  address: z.string().min(3), district: z.string().min(2), idType: z.string().min(1), nationalId: z.string().min(3),
  occupation: z.string().min(2), employer: z.string().min(2), monthlyIncomeMinor: z.number().int().nonnegative(),
  nextOfKin: z.string().min(3), nextOfKinRelationship: z.string().min(2), nextOfKinPhone: z.string().min(7), dateOfBirth: z.coerce.date().optional(),
})

router.use(requireAuth)
router.get('/:id', requirePermission('customers.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const customer = await CustomerModel.findOne({ tenantId: user.tenantId, $or: [{ _id: request.params.id }, { customerNumber: request.params.id }] }).select('-nationalId').lean()
  if (!customer) throw new HttpError(404, 'CUSTOMER_NOT_FOUND', 'Customer was not found.')
  assertBranchAccess(request, customer.branchId)
  response.json({ success: true, message: 'Customer retrieved successfully', data: customer })
}))
router.get('/', requirePermission('customers.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const query = z.object({ branchId: z.string().optional(), search: z.string().optional(), page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(request.query)
  const branchId = query.branchId ?? user.branchIds[0]
  if (!branchId) throw new HttpError(403, 'NO_BRANCH', 'No branch is assigned to this user.')
  assertBranchAccess(request, branchId)
  const filter = { tenantId: user.tenantId, branchId, ...(query.search ? { $or: [{ name: new RegExp(query.search, 'i') }, { phone: new RegExp(query.search, 'i') }, { customerNumber: new RegExp(query.search, 'i') }] } : {}) }
  const [data, total] = await Promise.all([CustomerModel.find(filter).select('-nationalId').sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(), CustomerModel.countDocuments(filter)])
  response.json({ success: true, message: 'Customers retrieved successfully', data, meta: { page: query.page, limit: query.limit, total } })
}))

router.post('/', requirePermission('customers.create'), asyncRoute(async (request: AuthRequest, response) => {
  const input = customerInput.parse(request.body)
  assertBranchAccess(request, input.branchId)
  const user = currentUser(request)
  const customer = await CustomerModel.create({ ...input, tenantId: user.tenantId, customerNumber: `CUS-${Date.now()}` })
  await recordAudit({ user, action: 'customer.created', entityType: 'customer', entityId: customer.id, branchId: input.branchId, next: { name: customer.name, phone: customer.phone } })
  const { nationalId: _nationalId, ...data } = customer.toObject()
  response.status(201).json({ success: true, message: 'Customer created successfully', data })
}))

router.patch('/:id', requirePermission('customers.update'), asyncRoute(async (request: AuthRequest, response) => {
  const input = customerInput.partial().extend({ version: z.number().int().positive() }).parse(request.body)
  const user = currentUser(request)
  const customer = await CustomerModel.findOne({ _id: request.params.id, tenantId: user.tenantId })
  if (!customer) throw new HttpError(404, 'CUSTOMER_NOT_FOUND', 'Customer was not found.')
  if (customer.version !== input.version) throw new HttpError(409, 'STALE_VERSION', 'The customer changed elsewhere. Refresh before saving.')
  if (input.branchId) assertBranchAccess(request, input.branchId)
  const previous = customer.toObject()
  Object.assign(customer, input, { version: customer.version + 1 })
  await customer.save()
  await recordAudit({ user, action: 'customer.updated', entityType: 'customer', entityId: customer.id, branchId: customer.branchId, previous: { status: previous.status }, next: { status: customer.status } })
  response.json({ success: true, message: 'Customer updated successfully', data: customer.toObject() })
}))

export default router
