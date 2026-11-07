import { model, Schema } from 'mongoose'

const factorSchema = new Schema({
  code: { type: String, required: true },
  label: { type: String, required: true },
  impact: { type: String, enum: ['positive', 'neutral', 'negative'], required: true },
  points: { type: Number, required: true },
  value: { type: Schema.Types.Mixed },
}, { _id: false })

const assessmentSchema = new Schema({
  tenantId: { type: String, required: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  applicationId: { type: Schema.Types.ObjectId, ref: 'LoanApplication', index: true },
  assessorId: { type: String, required: true },
  incomeMinor: { type: Number, min: 0, default: 0 },
  expensesMinor: { type: Number, min: 0, default: 0 },
  existingExposureMinor: { type: Number, min: 0, default: 0 },
  repaymentCapacityMinor: { type: Number, min: 0, default: 0 },
  score: { type: Number, min: 0, max: 100 },
  grade: { type: String },
  riskLevel: { type: String, enum: ['low', 'medium', 'high', 'very_high'] },
  recommendation: { type: String, enum: ['approve', 'review', 'decline', 'proceed'], required: true },
  factors: { type: [factorSchema], default: [] },
  riskIndicators: { type: [String], default: [] },
  source: { type: String, enum: ['internal', 'manual'], default: 'manual' },
  modelVersion: { type: String, default: 'v1' },
  calculatedAt: { type: Date },
  notes: { type: String, default: '' },
  version: { type: Number, default: 1 },
}, { timestamps: true })
assessmentSchema.index({ tenantId: 1, applicationId: 1, version: -1 })
assessmentSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 })
export const CreditAssessmentModel = model('CreditAssessment', assessmentSchema)
