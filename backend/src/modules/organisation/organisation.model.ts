import { model, Schema } from 'mongoose'

const branchSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, code: { type: String, required: true },
  name: { type: String, required: true }, district: { type: String, required: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
  managerId: { type: String }, settings: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true })
branchSchema.index({ tenantId: 1, code: 1 }, { unique: true })
export const BranchModel = model('Branch', branchSchema)

const staffAssignmentSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, userId: { type: Schema.Types.ObjectId, ref: 'Identity', required: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true }, roles: { type: [String], default: [] },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
}, { timestamps: true })
staffAssignmentSchema.index({ tenantId: 1, userId: 1, branchId: 1 }, { unique: true })
export const StaffAssignmentModel = model('StaffAssignment', staffAssignmentSchema)
