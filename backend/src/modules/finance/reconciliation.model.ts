import { model, Schema } from 'mongoose'

const reconciliationSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  periodStart: { type: Date, required: true }, periodEnd: { type: Date, required: true },
  expectedMinor: { type: Number, required: true }, actualMinor: { type: Number, required: true },
  status: { type: String, enum: ['open', 'balanced', 'exception', 'closed'], default: 'open', index: true },
  discrepancyMinor: { type: Number, required: true, default: 0 },
  notes: { type: String, default: '' }, closedBy: { type: String }, resolvedBy: { type: String }, resolvedAt: { type: Date },
}, { timestamps: true })
reconciliationSchema.index({ tenantId: 1, branchId: 1, periodStart: 1, periodEnd: 1 }, { unique: true })
export const ReconciliationModel = model('Reconciliation', reconciliationSchema)
