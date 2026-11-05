import { model, Schema } from 'mongoose'

const collectionSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  loanAccountId: { type: Schema.Types.ObjectId, ref: 'LoanAccount', required: true }, assignedTo: { type: String, required: true },
  status: { type: String, enum: ['open', 'contacted', 'promise_to_pay', 'escalated', 'resolved'], default: 'open', index: true },
  followUpAt: { type: Date }, promiseAmountMinor: { type: Number, min: 0 }, promiseDueAt: { type: Date }, notes: { type: String, default: '' },
  history: { type: [Schema.Types.Mixed], default: [] },
}, { timestamps: true })
export const CollectionModel = model('CollectionCase', collectionSchema)
