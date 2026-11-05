import { model, Schema } from 'mongoose'

const settingsSchema = new Schema({
  tenantId: { type: String, required: true, unique: true, index: true },
  organisation: {
    name: { type: String, required: true, default: 'LendFlow Organisation' },
    legalName: { type: String, default: '' },
    registrationNumber: { type: String, default: '' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
  },
  branding: {
    logoUrl: { type: String, default: '' },
    primaryColor: { type: String, default: '#2563eb' },
    secondaryColor: { type: String, default: '#0f172a' },
    currency: { type: String, default: 'UGX' },
  },
  updatedBy: { type: String },
}, { timestamps: true })

export const TenantSettingsModel = model('TenantSettings', settingsSchema)
