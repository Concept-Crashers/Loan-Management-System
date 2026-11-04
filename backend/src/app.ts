import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import pino from 'pino'
import { env } from './config/env.js'
import { asyncRoute, errorHandler } from './core/http.js'
import identityRoutes from './modules/identity/identity.routes.js'
import customerRoutes from './modules/customers/customer.routes.js'
import loanRoutes from './modules/loans/loan.routes.js'
import applicationRoutes from './modules/applications/application.routes.js'
import auditRoutes from './modules/audit/audit.routes.js'
import reportRoutes from './modules/reports/report.routes.js'
import syncRoutes from './modules/synchronisation/sync.routes.js'
import notificationRoutes from './modules/notifications/notification.routes.js'
import organisationRoutes from './modules/organisation/organisation.routes.js'
import creditRoutes from './modules/credit/credit.routes.js'
import collectionRoutes from './modules/collections/collection.routes.js'
import financeRoutes from './modules/finance/finance.routes.js'
import { openApiDocument } from './openapi.js'
import documentRoutes from './modules/customers/document.routes.js'
import reconciliationRoutes from './modules/finance/reconciliation.routes.js'
import { databaseReadiness } from './config/database.js'

export const app = express()
app.use(helmet())
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true }))
const logger = pino()
app.use((request, _response, next) => {
  logger.info({ method: request.method, url: request.originalUrl }, 'request')
  next()
})

app.get('/health', asyncRoute(async (_request, response) => {
  response.json({ success: true, message: 'LendFlow API is healthy', data: { status: 'ok', timestamp: new Date().toISOString() } })
}))
app.get('/health/ready', asyncRoute(async (_request, response) => {
  const data = databaseReadiness()
  if (!data.connected || (env.NODE_ENV === 'production' && !data.replicaSet)) {
    response.status(503).json({ success: false, message: 'Service is not ready', data })
    return
  }
  response.json({ success: true, message: 'Service is ready', data })
}))
app.use('/api/v1/auth', identityRoutes)
app.use('/api/v1/customers', customerRoutes)
app.use('/api/v1/documents', documentRoutes)
app.use('/api/v1/loan-products', loanRoutes)
app.use('/api/v1/applications', applicationRoutes)
app.use('/api/v1/audit', auditRoutes)
app.use('/api/v1/reports', reportRoutes)
app.use('/api/v1/sync', syncRoutes)
app.use('/api/v1/notifications', notificationRoutes)
app.use('/api/v1/organisation', organisationRoutes)
app.use('/api/v1/credit-assessments', creditRoutes)
app.use('/api/v1/collections', collectionRoutes)
app.use('/api/v1/finance', financeRoutes)
app.use('/api/v1/reconciliation', reconciliationRoutes)
app.get('/openapi.json', (_request, response) => response.json(openApiDocument))
app.use(errorHandler)
