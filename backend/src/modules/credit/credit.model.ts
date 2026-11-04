import { model, Schema } from 'mongoose'

const assessmentSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, applicationId: { type: Schema.Types.ObjectId, ref: 'LoanApplication', required: true, index: true },
  assessorId: { type: String, required: true }, incomeMinor: { type: Number, required: true, min: 0 }, expensesMinor: { type: Number, required: true, min: 0 },
  existingExposureMinor: { type: Number, required: true, min: 0 }, repaymentCapacityMinor: { type: Number, required: true, min: 0 },
  riskIndicators: { type: [String], default: [] }, recommendation: { type: String, enum: ['proceed', 'review', 'decline'], required: true },
  notes: { type: String, required: true }, version: { type: Number, default: 1 },
}, { timestamps: true })
assessmentSchema.index({ tenantId: 1, applicationId: 1, version: -1 })
export const CreditAssessmentModel = model('CreditAssessment', assessmentSchema)
