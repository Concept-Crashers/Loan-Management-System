import type { AuthUser } from '../../core/auth.js'
import { AuditModel } from './audit.model.js'
import type { ClientSession } from 'mongoose'

export async function recordAudit(input: { user: AuthUser; action: string; entityType: string; entityId: string; branchId?: string; previous?: unknown; next?: unknown; reason?: string; correlationId?: string; session?: ClientSession }) {
  const [event] = await AuditModel.create([{
    tenantId: input.user.tenantId, actorId: input.user.id, action: input.action, entityType: input.entityType,
    entityId: input.entityId, branchId: input.branchId, previous: input.previous, next: input.next,
    reason: input.reason, correlationId: input.correlationId,
  }], { session: input.session })
  return event
}
