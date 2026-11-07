import { describe, expect, it, vi } from 'vitest'
import { requirePermission, type AuthRequest } from './auth.js'

describe('permission middleware', () => {
  it('rejects users without the requested permission', () => {
    const next = vi.fn()
    requirePermission('reports.export')({ user: { id: 'u1', tenantId: 't1', branchIds: ['b1'], roles: [], permissions: [] } } as unknown as AuthRequest, {} as never, next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403, code: 'FORBIDDEN' }))
  })

  it('allows users with the requested permission', () => {
    const next = vi.fn()
    requirePermission('reports.export')({ user: { id: 'u1', tenantId: 't1', branchIds: ['b1'], roles: [], permissions: ['reports.export'] } } as unknown as AuthRequest, {} as never, next)
    expect(next).toHaveBeenCalledWith()
  })

  it('allows super admin regardless of permissions', () => {
    const next = vi.fn()
    requirePermission('reports.export')({ user: { id: 'u1', tenantId: 't1', branchIds: ['b1'], roles: ['super_admin'], permissions: [] } } as unknown as AuthRequest, {} as never, next)
    expect(next).toHaveBeenCalledWith()
  })
})
