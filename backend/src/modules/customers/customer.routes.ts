import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute, HttpError } from '../../core/http.js'
import { assertBranchAccess, currentUser } from '../../core/scope.js'
import { recordAudit } from '../audit/audit.service.js'
import { CustomerModel } from './customer.model.js'
import { LoanAccountModel, PaymentModel, RepaymentScheduleModel } from '../finance/finance.model.js'
import { computeTermFeeMinor, computeTermInterestMinor } from '../finance/schedule.js'

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
  const { branchFilter } = await import('../../core/scope.js')
  const scope = branchFilter(request, query.branchId) as Record<string, unknown>
  if (!('branchId' in scope) && query.branchId) scope.branchId = query.branchId
  // Non-overall users must have at least one accessible branch scope unless a specific allowed branch was requested.
  const roles = (user.roles ?? []).map((r) => String(r).toLowerCase().replace(/[\s-]+/g, '_'))
  const overall = roles.some((r) => r === 'super_admin' || r === 'superadmin')
  if (!overall && !query.branchId && !user.branchIds?.length) throw new HttpError(403, 'NO_BRANCH', 'No branch is assigned to this user. Ask an administrator to assign a branch in Staff management.')
  const filter = { tenantId: user.tenantId, ...scope, ...(query.search ? { $or: [{ name: new RegExp(query.search, 'i') }, { phone: new RegExp(query.search, 'i') }, { customerNumber: new RegExp(query.search, 'i') }] } : {}) }
  const [data, total] = await Promise.all([CustomerModel.find(filter).select('-nationalId').sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(), CustomerModel.countDocuments(filter)])
  const ids = data.map((c: any) => c._id).filter(Boolean)
  const loanScope = { tenantId: user.tenantId, ...(scope.branchId ? { branchId: scope.branchId } : {}), customerId: { $in: ids }, status: { $nin: ['written_off','closed'] } }
  const loans = ids.length ? await LoanAccountModel.find(loanScope).select('customerId status principalMinor outstandingPrincipalMinor outstandingInterestMinor outstandingFeesMinor productSnapshot').lean() : []
  const loanIds = loans.map((l: any) => l._id)
  const [schedAgg, paidAgg] = loanIds.length ? await Promise.all([
    RepaymentScheduleModel.aggregate([{ $match: { tenantId: user.tenantId, loanAccountId: { $in: loanIds } } }, { $group: { _id: '$loanAccountId', interestMinor: { $sum: '$interestMinor' }, feesMinor: { $sum: '$feesMinor' }, totalMinor: { $sum: '$totalMinor' } } }]),
    (await import('../finance/finance.model.js')).PaymentModel.aggregate([{ $match: { tenantId: user.tenantId, loanAccountId: { $in: loanIds }, status: 'confirmed' } }, { $group: { _id: '$loanAccountId', paidMinor: { $sum: '$amountMinor' } } }]),
  ]) : [[], []]
  const schedByLoan = new Map((schedAgg as any[]).map((r) => [String(r._id), r]))
  const paidByLoan = new Map((paidAgg as any[]).map((r) => [String(r._id), Number(r.paidMinor ?? 0)]))
  const byCustomer = new Map<string, { loans: number; outstandingMinor: number }>()
  for (const loan of loans as any[]) {
    const key = String(loan.customerId)
    const cur = byCustomer.get(key) ?? { loans: 0, outstandingMinor: 0 }
    const sched = schedByLoan.get(String(loan._id))
    const principalMinor = Number(loan.principalMinor ?? 0)
    const storedInterest = Number(loan.outstandingInterestMinor ?? 0)
    const storedFees = Number(loan.outstandingFeesMinor ?? 0)
    const snap = (loan.productSnapshot ?? {}) as any
    const tenureMonths = Number(snap.maxTenureMonths ?? snap.minTenureMonths ?? 1) || 1
    const computedInterest = computeTermInterestMinor(principalMinor, { annualRateBps: Number(snap.annualRateBps ?? 0), interestMethod: snap.interestMethod === 'declining_balance' ? 'declining_balance' : 'flat' }, tenureMonths)
    const computedFees = computeTermFeeMinor(snap)
    const totalInterestMinor = Number(sched?.interestMinor ?? (storedInterest > 0 ? storedInterest : computedInterest))
    const totalFeesMinor = Number(sched?.feesMinor ?? (storedFees > 0 ? storedFees : computedFees))
    const totalRepayableMinor = Number(sched?.totalMinor ?? (principalMinor + totalInterestMinor + totalFeesMinor))
    const confirmedPaidMinor = paidByLoan.get(String(loan._id)) ?? 0
    const paymentDueMinor = Math.max(0, totalRepayableMinor - confirmedPaidMinor)
    const fullyCleared = !['written_off','closed'].includes(String(loan.status)) && totalRepayableMinor > 0 && confirmedPaidMinor >= totalRepayableMinor
    if (!['settled','written_off','closed'].includes(String(loan.status))) cur.loans += 1
    if (['active','in_arrears','restructured','pending_disbursement'].includes(String(loan.status)) && !fullyCleared) cur.outstandingMinor += paymentDueMinor
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
