import { Router } from 'express'
import { requireAuth, requirePermission, type AuthRequest } from '../../core/auth.js'
import { asyncRoute } from '../../core/http.js'
import { assertBranchAccess, currentUser } from '../../core/scope.js'
import { ApplicationModel } from '../applications/application.model.js'
import { CustomerModel } from '../customers/customer.model.js'
import { LoanAccountModel, PaymentModel } from '../finance/finance.model.js'

const router = Router()
router.use(requireAuth, requirePermission('reports.view'))
router.get('/summary', asyncRoute(async (request: AuthRequest, response) => {
  const tenantId = currentUser(request).tenantId
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  if (branchId) assertBranchAccess(request, branchId)
  const dateScope = request.query.from || request.query.to ? { createdAt: { ...(request.query.from ? { $gte: new Date(String(request.query.from)) } : {}), ...(request.query.to ? { $lte: new Date(String(request.query.to)) } : {}) } } : {}
  const scope = { tenantId, ...(branchId ? { branchId } : {}), ...dateScope }
  const [customers, applications, statuses, loans, payments, outstanding] = await Promise.all([
    CustomerModel.countDocuments(scope),
    ApplicationModel.countDocuments(scope),
    ApplicationModel.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    LoanAccountModel.countDocuments({ ...scope, status: { $in: ['active', 'in_arrears', 'restructured'] } }),
    PaymentModel.aggregate([{ $match: scope }, { $group: { _id: '$status', amountMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } }]),
    LoanAccountModel.aggregate([{ $match: scope }, { $group: { _id: null, principalMinor: { $sum: '$outstandingPrincipalMinor' }, interestMinor: { $sum: '$outstandingInterestMinor' }, feesMinor: { $sum: '$outstandingFeesMinor' } } }]),
  ])
  const balance = outstanding[0] ?? { principalMinor: 0, interestMinor: 0, feesMinor: 0 }
  response.json({ success: true, message: 'Report summary retrieved successfully', data: { generatedAt: new Date().toISOString(), scope: branchId ? { branchId } : { tenantId }, customers, applications, loans, applicationsByStatus: statuses, payments, outstanding: balance } })
}))
router.get('/summary/export', asyncRoute(async (request: AuthRequest, response) => {
  const tenantId = currentUser(request).tenantId
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  if (branchId) assertBranchAccess(request, branchId)
  const scope = { tenantId, ...(branchId ? { branchId } : {}) }
  const [customers, applications, loans, payments] = await Promise.all([
    CustomerModel.countDocuments(scope),
    ApplicationModel.countDocuments(scope),
    LoanAccountModel.countDocuments(scope),
    PaymentModel.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 }, amountMinor: { $sum: '$amountMinor' } } }]),
  ])
  const csv = ['metric,value', `customers,${customers}`, `applications,${applications}`, `loans,${loans}`, ...payments.map((row) => `payments_${row._id},${row.count}:${row.amountMinor}`)].join('\n')
  response.type('text/csv').setHeader('Content-Disposition', 'attachment; filename="portfolio-summary.csv"').send(csv)
}))
router.get('/dashboard', asyncRoute(async (request: AuthRequest, response) => {
  const tenantId = currentUser(request).tenantId
  const branchId = request.query.branchId ? String(request.query.branchId) : undefined
  if (branchId) assertBranchAccess(request, branchId)
  const scope = { tenantId, ...(branchId ? { branchId } : {}) }
  const [activeLoans, repayments, overdueLoans] = await Promise.all([
    LoanAccountModel.countDocuments({ ...scope, status: { $in: ['active', 'in_arrears'] } }),
    PaymentModel.aggregate([{ $match: { ...scope, status: 'confirmed' } }, { $group: { _id: null, amountMinor: { $sum: '$amountMinor' } } }]),
    LoanAccountModel.countDocuments({ ...scope, status: 'in_arrears' }),
  ])
  response.json({ success: true, message: 'Dashboard summary retrieved successfully', data: { generatedAt: new Date().toISOString(), activeLoans, confirmedRepaymentsMinor: repayments[0]?.amountMinor ?? 0, overdueLoans } })
}))
export default router
