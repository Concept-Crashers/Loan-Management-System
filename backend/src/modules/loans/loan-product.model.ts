import { model, Schema } from 'mongoose'

const termsSchema = new Schema({
  minAmountMinor: { type: Number, required: true, min: 0 }, maxAmountMinor: { type: Number, required: true, min: 0 },
  annualRateBps: { type: Number, required: true, min: 0 }, interestMethod: { type: String, enum: ['flat', 'declining_balance'], required: true },
  repaymentFrequency: { type: String, enum: ['daily', 'weekly', 'biweekly', 'monthly'], required: true },
  minTenureMonths: { type: Number, required: true, min: 1 }, maxTenureMonths: { type: Number, required: true, min: 1 },
  gracePeriodDays: { type: Number, required: true, min: 0 }, fees: { type: [Schema.Types.Mixed], default: [] }, requiredDocuments: { type: [String], default: [] },
}, { _id: false })

const loanProductSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, code: { type: String, required: true }, name: { type: String, required: true },
  category: { type: String, enum: ['individual', 'group'], required: true }, status: { type: String, enum: ['draft', 'active', 'inactive'], default: 'draft', index: true },
  version: { type: Number, default: 1 }, terms: { type: termsSchema, required: true }, approvalLimitMinor: { type: Number, required: true, min: 0 },
}, { timestamps: true })
loanProductSchema.index({ tenantId: 1, code: 1, version: 1 }, { unique: true })
export const LoanProductModel = model('LoanProduct', loanProductSchema)
