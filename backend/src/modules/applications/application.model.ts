import { model, Schema } from 'mongoose'

const applicationSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true }, productId: { type: Schema.Types.ObjectId, ref: 'LoanProduct', required: true },
  productVersion: { type: Number, required: true }, amountMinor: { type: Number, required: true, min: 1 }, tenureMonths: { type: Number, required: true, min: 1 },
  purpose: { type: String, required: true }, incomeMinor: { type: Number, required: true, min: 0 }, obligationsMinor: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['draft', 'submitted', 'under_review', 'assessment_required', 'info_requested', 'approval_pending', 'approved', 'rejected', 'cancelled', 'withdrawn'], default: 'draft', index: true },
  officerId: { type: String, required: true }, version: { type: Number, default: 1 }, decisionHistory: { type: [Schema.Types.Mixed], default: [] },
  reviewComments: { type: [{ actorId: String, actorName: String, body: String, kind: String, at: Date }], default: [] },
  attachments: { type: [{ name: String, kind: String, reference: String, storageKey: String, mimeType: String, size: Number, status: { type: String, enum: ['pending_scan', 'available', 'rejected'], default: 'available' }, expiresAt: Date, legalHold: { type: Boolean, default: false }, deletedAt: Date, addedBy: String, addedAt: Date }], default: [] },
  loanAccountId: { type: Schema.Types.ObjectId, ref: 'LoanAccount' },
}, { timestamps: true })
applicationSchema.index({ tenantId: 1, branchId: 1, status: 1 })
applicationSchema.index({ tenantId: 1, branchId: 1, createdAt: -1 })
applicationSchema.index({ tenantId: 1, customerId: 1, status: 1 })
export const ApplicationModel = model('LoanApplication', applicationSchema)
