export const ALL_PERMISSIONS = [
  'accounting.journal.create', 'accounting.journal.view', 'accounting.reconciliation.manage',
  'applications.create', 'applications.decide', 'applications.view', // legacy/compat aliases (seeded previously)
  'audit.view',
  'branches.manage', 'branches.view',
  'collections.manage', 'collections.view',
  'customers.create', 'customers.documents.manage', 'customers.documents.view', 'customers.update', 'customers.view',
  'devices.register', 'devices.revoke',
  'identity.roles.manage', 'identity.roles.view', 'identity.users.create', 'identity.users.update', 'identity.users.view',
  'loan-products.manage', 'loan-products.view', // legacy/compat aliases (seeded previously)
  'loans.accounts.manage', 'loans.accounts.view',
  'loans.applications.approve', 'loans.applications.assess', 'loans.applications.create', 'loans.applications.view',
  'loans.disburse.authorize', 'loans.disburse.execute',
  'loans.products.create', 'loans.products.view',
  'notifications.manage', 'notifications.view',
  'organisation.settings.manage', 'organisation.settings.view',
  'repayments.capture', 'repayments.confirm', 'repayments.reverse',
  'reports.export', 'reports.view',
  'users.manage', 'users.view',
] as const

export type Permission = typeof ALL_PERMISSIONS[number]

export const PERMISSION_GROUPS: Array<{ key: string; label: string; permissions: string[] }> = [
  { key: 'identity', label: 'Identity & access', permissions: ['identity.users.view','identity.users.create','identity.users.update','identity.roles.view','identity.roles.manage','users.view','users.manage'] },
  { key: 'organisation', label: 'Organisation & branches', permissions: ['organisation.settings.view','organisation.settings.manage','branches.view','branches.manage'] },
  { key: 'customers', label: 'Customers & documents', permissions: ['customers.view','customers.create','customers.update','customers.documents.view','customers.documents.manage'] },
  { key: 'products', label: 'Loan products', permissions: ['loans.products.view','loans.products.create','loan-products.view','loan-products.manage'] },
  { key: 'applications', label: 'Loan applications', permissions: ['loans.applications.view','loans.applications.create','loans.applications.assess','loans.applications.approve','applications.view','applications.create','applications.decide'] },
  { key: 'loans', label: 'Loan accounts & disbursement', permissions: ['loans.accounts.view','loans.accounts.manage','loans.disburse.authorize','loans.disburse.execute'] },
  { key: 'repayments', label: 'Repayments', permissions: ['repayments.capture','repayments.confirm','repayments.reverse'] },
  { key: 'collections', label: 'Collections', permissions: ['collections.view','collections.manage'] },
  { key: 'accounting', label: 'Accounting & reconciliation', permissions: ['accounting.journal.view','accounting.journal.create','accounting.reconciliation.manage'] },
  { key: 'reports', label: 'Reports & audit', permissions: ['reports.view','reports.export','audit.view'] },
  { key: 'notifications', label: 'Notifications & devices', permissions: ['notifications.view','notifications.manage','devices.register','devices.revoke'] },
]

export const PERMISSION_ALIASES: Record<string, string[]> = {
  'loans.applications.view': ['applications.view'],
  'applications.view': ['loans.applications.view'],
  'loans.applications.create': ['applications.create'],
  'applications.create': ['loans.applications.create'],
  'loans.applications.approve': ['applications.decide'],
  'applications.decide': ['loans.applications.approve'],
  'loans.products.view': ['loan-products.view'],
  'loan-products.view': ['loans.products.view'],
  'loans.products.create': ['loan-products.manage'],
  'loan-products.manage': ['loans.products.create'],
  'identity.users.view': ['users.view'],
  'users.view': ['identity.users.view'],
  'identity.users.create': ['users.manage'],
  'identity.users.update': ['users.manage'],
  'users.manage': ['identity.users.create', 'identity.users.update'],
}

export function expandPermissionAliases(perms: string[]) {
  const out = new Set<string>()
  for (const raw of perms ?? []) {
    const p = String(raw || '').trim()
    if (!p) continue
    out.add(p)
    for (const alias of PERMISSION_ALIASES[p] ?? []) out.add(alias)
  }
  return [...out]
}

export const DEFAULT_ROLES = [
  'super_admin', 'admin', 'manager', 'loan_officer', 'credit_officer', 'approver', 'cashier', 'accountant', 'collections_officer',
]

export const OVERALL_ADMIN_ROLES = ['super_admin', 'superadmin'] as const
export const LOCKED_FULL_ACCESS_ROLES = ['super_admin', 'superadmin'] as const

export function isOverallAdminRole(role: string) {
  return (OVERALL_ADMIN_ROLES as readonly string[]).includes(normalizeRoleName(role))
}

export function normalizeRoleName(role: string) {
  return String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function displayRoleName(role: string) {
  return normalizeRoleName(role).split('_').map((p) => p ? p[0]!.toUpperCase() + p.slice(1) : '').join(' ').trim()
}
