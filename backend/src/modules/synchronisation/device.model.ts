import { model, Schema } from 'mongoose'

const deviceSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, userId: { type: String, required: true, index: true },
  branchId: { type: String, required: true, index: true }, deviceId: { type: String, required: true },
  label: { type: String, required: true }, status: { type: String, enum: ['active', 'revoked'], default: 'active' },
  lastSeenAt: { type: Date },
}, { timestamps: true })
deviceSchema.index({ tenantId: 1, deviceId: 1 }, { unique: true })
deviceSchema.index({ tenantId: 1, userId: 1, status: 1, lastSeenAt: -1 })
export const DeviceModel = model('SyncDevice', deviceSchema)
