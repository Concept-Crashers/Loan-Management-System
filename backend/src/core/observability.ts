import crypto from 'node:crypto'
import pino from 'pino'
import type { NextFunction, Request, Response } from 'express'

export const logger = pino({ redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'passwordHash', 'token', 'refreshToken'], censor: '[REDACTED]' } })
const counters = new Map<string, number>()

export function correlationMiddleware(request: Request, response: Response, next: NextFunction) {
  const correlationId = request.header('x-correlation-id')?.slice(0, 128) || crypto.randomUUID()
  response.setHeader('X-Correlation-ID', correlationId)
  const started = Date.now()
  response.on('finish', () => {
    const key = `${request.method} ${request.route?.path ?? request.path} ${response.statusCode}`
    counters.set(key, (counters.get(key) ?? 0) + 1)
    logger.info({ correlationId, method: request.method, path: request.path, statusCode: response.statusCode, durationMs: Date.now() - started }, 'request completed')
  })
  next()
}

export function metricsText() {
  const lines = ['# HELP lendflow_http_requests_total Total HTTP requests by route and status.', '# TYPE lendflow_http_requests_total counter']
  for (const [key, value] of counters) {
    const [method, route, status] = key.split(' ')
    lines.push(`lendflow_http_requests_total{method="${method}",route="${route}",status="${status}"} ${value}`)
  }
  return `${lines.join('\n')}\n`
}
