import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import pinoHttp from 'pino-http'
import { env } from './config/env.js'
import { asyncRoute, errorHandler } from './core/http.js'
import identityRoutes from './modules/identity/identity.routes.js'

export const app = express()
app.use(helmet())
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true }))
app.use(pinoHttp())

app.get('/health', asyncRoute(async (_request, response) => {
  response.json({ success: true, message: 'LendFlow API is healthy', data: { status: 'ok', timestamp: new Date().toISOString() } })
}))
app.use('/api/v1/auth', identityRoutes)
app.use(errorHandler)
