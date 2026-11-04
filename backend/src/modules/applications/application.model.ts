import { model, Schema } from 'mongoose'

const applicationSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true }, productId: { type: Schema.Types.ObjectId, ref: 'LoanProduct', required: true },
  productVersion: { type: Number, required: true }, amountMinor: { type: Number, required: true, min: 1 }, tenureMonths: { type: Number, required: true, min: 1 },
  purpose: { type: String, required: true }, incomeMinor: { type: Number, required: true, min: 0 }, obligationsMinor: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['draft', 'submitted', 'under_review', 'assessment_required', 'approval_pending', 'approved', 'rejected', 'cancelled'], default: 'draft', index: true },
  officerId: { type: String, required: true }, version: { type: Number, default: 1 }, decisionHistory: { type: [Schema.Types.Mixed], default: [] },
  loanAccountId: { type: Schema.Types.ObjectId, ref: 'LoanAccount' },
}, { timestamps: true })
applicationSchema.index({ tenantId: 1, branchId: 1, status: 1 })
applicationSchema.index({ tenantId: 1, branchId: 1, createdAt: -1 })
applicationSchema.index({ tenantId: 1, customerId: 1, status: 1 })
export const ApplicationModel = model('LoanApplication', applicationSchema)
