import { model, Schema } from 'mongoose'

const reconciliationSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  periodStart: { type: Date, required: true }, periodEnd: { type: Date, required: true },
  expectedMinor: { type: Number, required: true }, actualMinor: { type: Number, required: true },
  status: { type: String, enum: ['open', 'balanced', 'exception', 'closed'], default: 'open', index: true },
  notes: { type: String, default: '' }, closedBy: { type: String },
}, { timestamps: true })
export const ReconciliationModel = model('Reconciliation', reconciliationSchema)
