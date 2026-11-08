import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute, HttpError } from '../../core/http.js'
import { assertBranchAccess, currentUser } from '../../core/scope.js'
import { recordAudit } from '../audit/audit.service.js'
import { CustomerModel } from './customer.model.js'
import { LoanAccountModel, RepaymentScheduleModel } from '../finance/finance.model.js'

const router = Router()
const customerInput = z.object({
  branchId: z.string().min(1), name: z.string().min(3), phone: z.string().min(7), email: z.email().optional().or(z.literal('')),
  address: z.string().min(3), district: z.string().min(2), idType: z.string().min(1), nationalId: z.string().min(3),
  occupation: z.string().min(2), employer: z.string().min(2), monthlyIncomeMinor: z.number().int().nonnegative(),
  nextOfKin: z.string().min(3), nextOfKinRelationship: z.string().min(2), nextOfKinPhone: z.string().min(7), dateOfBirth: z.coerce.date().optional(),
  status: z.enum(['active', 'inactive', 'watchlist', 'archived']).optional(),
})

router.use(requireAuth)
router.get('/:id', requirePermission('customers.view'), asyncRoute(async (request: AuthRequest, response) => {
  const user = currentUser(request)
  const id = String(request.params.id || '')
  const or: any[] = [{ customerNumber: id }]
  if (mongoose.isValidObjectId(id)) or.push({ _id: id })
  const customer = await CustomerModel.findOne({ tenantId: user.tenantId, $or: or }).select('-nationalId').lean()
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
  const ids = data.map((c: any) => c._id).filter(Boolean)
  const loans = ids.length ? await LoanAccountModel.find({ tenantId: user.tenantId, branchId, customerId: { $in: ids }, status: { $nin: ['written_off','closed'] } }).select('customerId status principalMinor outstandingPrincipalMinor outstandingInterestMinor outstandingFeesMinor productSnapshot').lean() : []
  const loanIds = loans.map((l: any) => l._id)
  const schedAgg = loanIds.length ? await RepaymentScheduleModel.aggregate([{ $match: { tenantId: user.tenantId, loanAccountId: { $in: loanIds } } }, { $group: { _id: '$loanAccountId', interestMinor: { $sum: '$interestMinor' }, feesMinor: { $sum: '$feesMinor' } } }]) : []
  const schedByLoan = new Map(schedAgg.map((r: any) => [String(r._id), r]))
  const byCustomer = new Map<string, { loans: number; outstandingMinor: number }>()
  for (const loan of loans as any[]) {
    const key = String(loan.customerId)
    const cur = byCustomer.get(key) ?? { loans: 0, outstandingMinor: 0 }
    const principalOut = Number(loan.outstandingPrincipalMinor ?? 0)
    const sched = schedByLoan.get(String(loan._id))
    const interestOut = Number(loan.outstandingInterestMinor ?? 0) > 0 ? Number(loan.outstandingInterestMinor ?? 0) : (principalOut > 0 && !['settled','written_off','closed'].includes(String(loan.status)) ? Number(sched?.interestMinor ?? 0) : 0)
    const feesOut = Number(loan.outstandingFeesMinor ?? 0) > 0 ? Number(loan.outstandingFeesMinor ?? 0) : (principalOut > 0 && !['settled','written_off','closed'].includes(String(loan.status)) ? Number(sched?.feesMinor ?? 0) : 0)
    const stored = principalOut + interestOut + feesOut
    if (['active','in_arrears','restructured','pending_disbursement'].includes(String(loan.status))) cur.outstandingMinor += Math.max(0, stored)
    if (!['settled','written_off','closed'].includes(String(loan.status))) cur.loans += 1
    byCustomer.set(key, cur)
  }
  const enriched = data.map((c: any) => ({ ...c, loans: byCustomer.get(String(c._id))?.loans ?? 0, outstandingMinor: byCustomer.get(String(c._id))?.outstandingMinor ?? 0 }))
  response.json({ success: true, message: 'Customers retrieved successfully', data: enriched, meta: { page: query.page, limit: query.limit, total } })
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
  const id = request.params.id
  const or: Record<string, unknown>[] = [{ customerNumber: id }, { phone: id }]
  if (mongoose.isValidObjectId(id)) or.push({ _id: id })
  const customer = await CustomerModel.findOne({ tenantId: user.tenantId, $or: or })
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
