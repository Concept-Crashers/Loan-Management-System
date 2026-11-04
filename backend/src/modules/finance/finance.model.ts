import { model, Schema } from 'mongoose'

const loanAccountSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true }, applicationId: { type: Schema.Types.ObjectId, ref: 'LoanApplication', required: true },
  principalMinor: { type: Number, required: true, min: 1 }, outstandingPrincipalMinor: { type: Number, required: true, min: 0 },
  outstandingInterestMinor: { type: Number, required: true, min: 0 }, outstandingFeesMinor: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pending_disbursement', 'active', 'in_arrears', 'restructured', 'settled', 'written_off', 'closed'], default: 'pending_disbursement', index: true },
  productSnapshot: { type: Schema.Types.Mixed, required: true }, version: { type: Number, default: 1 },
}, { timestamps: true })
loanAccountSchema.index({ tenantId: 1, applicationId: 1 }, { unique: true })
loanAccountSchema.index({ tenantId: 1, branchId: 1, status: 1, createdAt: -1 })
loanAccountSchema.index({ tenantId: 1, customerId: 1, status: 1 })
export const LoanAccountModel = model('LoanAccount', loanAccountSchema)

const repaymentScheduleSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  loanAccountId: { type: Schema.Types.ObjectId, ref: 'LoanAccount', required: true }, installmentNumber: { type: Number, required: true },
  dueDate: { type: Date, required: true }, principalMinor: { type: Number, required: true, min: 0 },
  interestMinor: { type: Number, required: true, min: 0 }, feesMinor: { type: Number, required: true, min: 0 },
  totalMinor: { type: Number, required: true, min: 0 }, status: { type: String, enum: ['pending', 'partially_paid', 'paid', 'overdue'], default: 'pending' },
}, { timestamps: true })
repaymentScheduleSchema.index({ tenantId: 1, loanAccountId: 1, installmentNumber: 1 }, { unique: true })
repaymentScheduleSchema.index({ tenantId: 1, branchId: 1, dueDate: 1, status: 1 })
export const RepaymentScheduleModel = model('RepaymentSchedule', repaymentScheduleSchema)

const paymentSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  loanAccountId: { type: Schema.Types.ObjectId, ref: 'LoanAccount', required: true }, reference: { type: String, required: true },
  amountMinor: { type: Number, required: true, min: 1 }, method: { type: String, required: true },
  status: { type: String, enum: ['pending_verification', 'confirmed', 'reversed'], default: 'pending_verification', index: true },
  allocations: { type: [Schema.Types.Mixed], default: [] }, reversalReason: { type: String }, confirmedBy: { type: String },
}, { timestamps: true })
paymentSchema.index({ tenantId: 1, reference: 1 }, { unique: true })
paymentSchema.index({ tenantId: 1, branchId: 1, status: 1, createdAt: -1 })
paymentSchema.index({ tenantId: 1, loanAccountId: 1, createdAt: -1 })
export const PaymentModel = model('Repayment', paymentSchema)

const journalSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  sourceType: { type: String, required: true }, sourceId: { type: String, required: true },
  periodId: { type: Schema.Types.ObjectId, ref: 'AccountingPeriod' }, postedAt: { type: Date, default: Date.now },
  lines: { type: [Schema.Types.Mixed], required: true },
  immutable: { type: Boolean, default: true },
}, { timestamps: true })
journalSchema.path('lines').validate((lines: Array<{ debitMinor?: number; creditMinor?: number }>) => {
  if (!Array.isArray(lines) || lines.length < 2) return false
  const debit = lines.reduce((sum, line) => sum + (Number(line.debitMinor) || 0), 0)
  const credit = lines.reduce((sum, line) => sum + (Number(line.creditMinor) || 0), 0)
  return debit > 0 && debit === credit && lines.every((line) => (Number(line.debitMinor) || 0) >= 0 && (Number(line.creditMinor) || 0) >= 0)
}, 'Journal entry must contain at least two balanced, non-negative lines')
export const JournalModel = model('JournalEntry', journalSchema)

const chartAccountSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, code: { type: String, required: true },
  name: { type: String, required: true }, type: { type: String, enum: ['asset', 'liability', 'equity', 'income', 'expense'], required: true },
  active: { type: Boolean, default: true }, system: { type: Boolean, default: false },
}, { timestamps: true })
chartAccountSchema.index({ tenantId: 1, code: 1 }, { unique: true })
export const ChartAccountModel = model('ChartAccount', chartAccountSchema)

const accountingPeriodSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  periodStart: { type: Date, required: true }, periodEnd: { type: Date, required: true },
  status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
  openedBy: { type: String, required: true }, closedBy: String, closedAt: Date,
}, { timestamps: true })
accountingPeriodSchema.index({ tenantId: 1, branchId: 1, periodStart: 1, periodEnd: 1 }, { unique: true })
export const AccountingPeriodModel = model('AccountingPeriod', accountingPeriodSchema)

const disbursementSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  applicationId: { type: Schema.Types.ObjectId, ref: 'LoanApplication', required: true },
  loanAccountId: { type: Schema.Types.ObjectId, ref: 'LoanAccount', required: true },
  amountMinor: { type: Number, required: true, min: 1 }, idempotencyKey: { type: String, required: true },
  status: { type: String, enum: ['authorized', 'completed', 'cancelled'], default: 'authorized', index: true },
  authorizedBy: { type: String, required: true }, completedBy: { type: String }, completedAt: { type: Date },
}, { timestamps: true })
disbursementSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true })
disbursementSchema.index({ tenantId: 1, applicationId: 1 }, { unique: true })
disbursementSchema.index({ tenantId: 1, branchId: 1, status: 1, createdAt: -1 })
export const DisbursementModel = model('Disbursement', disbursementSchema)

const cashbookSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  account: { type: String, required: true }, direction: { type: String, enum: ['in', 'out'], required: true },
  amountMinor: { type: Number, required: true, min: 1 }, reference: { type: String, required: true },
  status: { type: String, enum: ['open', 'settled', 'void'], default: 'open', index: true }, settledAt: Date, settledBy: String,
}, { timestamps: true })
cashbookSchema.index({ tenantId: 1, branchId: 1, status: 1, createdAt: -1 })
cashbookSchema.index({ tenantId: 1, reference: 1 }, { unique: true })
export const CashbookModel = model('CashbookEntry', cashbookSchema)

const loanEventSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  loanAccountId: { type: Schema.Types.ObjectId, ref: 'LoanAccount', required: true }, type: { type: String, required: true },
  reason: { type: String, required: true }, metadata: Schema.Types.Mixed, createdBy: { type: String, required: true },
}, { timestamps: true })
loanEventSchema.index({ tenantId: 1, loanAccountId: 1, createdAt: -1 })
export const LoanEventModel = model('LoanEvent', loanEventSchema)
