import bcrypt from 'bcryptjs'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { IdentityModel } from '../src/modules/identity/identity.model.js'

const required = (name: string) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

const email = required('SYSTEM_ADMIN_EMAIL').toLowerCase()
const password = required('SYSTEM_ADMIN_PASSWORD')
const name = required('SYSTEM_ADMIN_NAME')
const tenantId = required('SYSTEM_ADMIN_TENANT_ID')
const branchIds = (process.env.SYSTEM_ADMIN_BRANCH_IDS ?? '').split(',').map((value) => value.trim()).filter(Boolean)

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('SYSTEM_ADMIN_EMAIL must be a valid email address.')
if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
  throw new Error('SYSTEM_ADMIN_PASSWORD must be at least 12 characters and contain upper, lower and numeric characters.')
}
if (!branchIds.length) throw new Error('SYSTEM_ADMIN_BRANCH_IDS must contain at least one branch id.')

const permissions = [
  'customers.view', 'customers.create', 'customers.update', 'customers.documents.view', 'customers.documents.manage',
  'loan-products.view', 'loan-products.manage', 'applications.view', 'applications.create', 'applications.decide',
  'loans.accounts.view', 'loans.accounts.manage', 'loans.disburse.authorize', 'loans.disburse.execute',
  'repayments.capture', 'repayments.confirm', 'repayments.reverse', 'collections.view', 'collections.manage',
  'accounting.journal.view', 'accounting.journal.create', 'accounting.reconciliation.manage',
  'reports.view', 'reports.export', 'audit.view', 'notifications.view', 'notifications.manage',
  'organisation.settings.view', 'organisation.settings.manage', 'users.view', 'users.manage',
]

await connectDatabase()
try {
  const existing = await IdentityModel.findOne({ tenantId, email })
  if (existing) throw new Error('A user with this email already exists in the tenant.')
  const identity = await IdentityModel.create({
    tenantId, email, name, branchIds, roles: ['Super Admin'], permissions,
    passwordHash: await bcrypt.hash(password, 12), status: 'active', emailVerifiedAt: new Date(),
  })
  console.log(`Created system administrator ${identity.email} for tenant ${tenantId}.`)
} finally {
  await disconnectDatabase()
}
