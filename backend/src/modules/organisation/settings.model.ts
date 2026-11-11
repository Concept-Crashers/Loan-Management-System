import { model, Schema } from 'mongoose'

const settingsSchema = new Schema({
  tenantId: { type: String, required: true, unique: true, index: true },
  organisation: {
    name: { type: String, required: true, default: 'Trust Loans' },
    legalName: { type: String, default: '' },
    registrationNumber: { type: String, default: '' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
  },
  branding: {
    logoUrl: { type: String, default: '' },
    signatureUrl: { type: String, default: '' },
    primaryColor: { type: String, default: '#2563eb' },
    secondaryColor: { type: String, default: '#0f172a' },
    currency: { type: String, default: 'UGX' },
  },
  preferences: {
    defaultBranchId: { type: String, default: '' },
    defaultRepaymentFrequency: { type: String, default: 'Monthly' },
    receiptReferenceFormat: { type: String, default: 'RCT-{YYYY}-{SEQ}' },
    notifications: { type: Schema.Types.Mixed, default: {} },
  },
  updatedBy: { type: String },
}, { timestamps: true })

export const TenantSettingsModel = model('TenantSettings', settingsSchema)
