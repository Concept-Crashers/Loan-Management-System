import { model, Schema } from 'mongoose'

const rolePermissionSchema = new Schema({
  tenantId: { type: String, required: true, index: true },
  role: { type: String, required: true, trim: true },
  normalizedRole: { type: String, required: true, trim: true, index: true },
  permissions: { type: [String], default: [] },
  description: { type: String, default: '' },
  updatedBy: { type: String, default: '' },
}, { timestamps: true })

rolePermissionSchema.index({ tenantId: 1, normalizedRole: 1 }, { unique: true })
export const RolePermissionModel = model('RolePermission', rolePermissionSchema)
