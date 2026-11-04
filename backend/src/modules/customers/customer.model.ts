import { model, Schema } from 'mongoose'

const documentSchema = new Schema({
  key: { type: String, required: true }, name: { type: String, required: true },
  mimeType: { type: String, required: true }, size: { type: Number, required: true },
  storageKey: { type: String, required: true }, status: { type: String, enum: ['pending_scan', 'available', 'rejected'], default: 'pending_scan' },
}, { timestamps: true })

const customerSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  customerNumber: { type: String, required: true }, name: { type: String, required: true, trim: true },
  dateOfBirth: { type: Date }, phone: { type: String, required: true, trim: true }, email: { type: String, lowercase: true, trim: true },
  address: { type: String, required: true }, district: { type: String, required: true },
  idType: { type: String, required: true }, nationalId: { type: String, required: true, select: false },
  occupation: { type: String, required: true }, employer: { type: String, required: true },
  monthlyIncomeMinor: { type: Number, required: true, min: 0 }, nextOfKin: { type: String, required: true },
  nextOfKinRelationship: { type: String, required: true }, nextOfKinPhone: { type: String, required: true },
  status: { type: String, enum: ['active', 'inactive', 'watchlist', 'archived'], default: 'active', index: true },
  kycStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending', index: true },
  documents: { type: [documentSchema], default: [] }, version: { type: Number, default: 1 },
}, { timestamps: true })

customerSchema.index({ tenantId: 1, branchId: 1, customerNumber: 1 }, { unique: true })
customerSchema.index({ tenantId: 1, phone: 1 })
customerSchema.index({ tenantId: 1, branchId: 1, status: 1, createdAt: -1 })
customerSchema.index({ tenantId: 1, branchId: 1, name: 1 })
export const CustomerModel = model('Customer', customerSchema)
