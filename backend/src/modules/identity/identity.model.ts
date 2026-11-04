import { model, Schema } from 'mongoose'

const identitySchema = new Schema({
  tenantId: { type: String, required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  name: { type: String, required: true },
  branchIds: { type: [String], default: [] },
  roles: { type: [String], default: [] },
  permissions: { type: [String], default: [] },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
  refreshTokenHash: { type: String, select: false },
  failedLoginCount: { type: Number, default: 0 },
  lockedUntil: { type: Date },
}, { timestamps: true })

identitySchema.index({ tenantId: 1, email: 1 }, { unique: true })
export const IdentityModel = model('Identity', identitySchema)
