import express from 'express'
import crypto from 'node:crypto'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
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
import settingsRoutes from './modules/organisation/settings.routes.js'
import { correlationMiddleware, metricsText } from './core/observability.js'

export const app = express()
app.set('trust proxy', 1)
app.use(helmet())
const allowedOrigins = env.FRONTEND_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
const allowAllOrigins = allowedOrigins.includes('*')
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowAllOrigins) return cb(null, true)
    if (allowedOrigins.includes(origin)) return cb(null, true)
    return cb(null, false)
  },
  credentials: true,
}))
app.use(express.json({ limit: '1mb' }))
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true }))
app.use(correlationMiddleware)
app.use((request, response, next) => {
  const cookie = request.header('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith('lendflow_csrf='))?.slice('lendflow_csrf='.length)
  const csrfToken = cookie ?? crypto.randomBytes(24).toString('base64url')
  if (!cookie) response.cookie('lendflow_csrf', csrfToken, { httpOnly: false, secure: true, sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 30 * 24 * 60 * 60 * 1000, path: '/' })
  const exempt = request.path.includes('/auth/login') || request.path.includes('/auth/refresh') || request.path.includes('/auth/forgot-password') || request.path.includes('/auth/reset-password') || request.path.includes('/auth/verify-email')
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS' && !exempt && request.path.startsWith('/api/')) {
    if (request.header('x-csrf-token') !== csrfToken) {
      response.status(403).json({ success: false, message: 'CSRF validation failed.', code: 'CSRF_INVALID', errors: [] })
      return
    }
  }
  next()
})

app.get('/', (_request, response) => {
  response.json({ success: true, message: 'LendFlow API is running', data: { service: 'backend', docs: '/openapi.json', health: '/health' } })
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
app.get('/metrics', (_request, response) => {
  response.type('text/plain').send(metricsText())
})
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
app.use('/api/v1/organisation', settingsRoutes)
app.use('/api/v1/credit-assessments', creditRoutes)
app.use('/api/v1/collections', collectionRoutes)
app.use('/api/v1/finance', financeRoutes)
app.use('/api/v1/reconciliation', reconciliationRoutes)
app.get('/openapi.json', (_request, response) => response.json(openApiDocument))
app.use(errorHandler)
