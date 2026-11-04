import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { app } from '../app.js'

let server: Server | undefined

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  server = undefined
})

describe('API integration foundation', () => {
  it('returns a correlation id and exposes metrics', async () => {
    server = createServer(app)
    await new Promise<void>((resolve) => server?.listen(0, resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const health = await fetch(`http://127.0.0.1:${port}/health`, { headers: { 'x-correlation-id': 'integration-test' } })
    expect(health.headers.get('x-correlation-id')).toBe('integration-test')
    expect((await health.json()).success).toBe(true)
    const metrics = await fetch(`http://127.0.0.1:${port}/metrics`)
    expect(await metrics.text()).toContain('lendflow_http_requests_total')
  })
})
