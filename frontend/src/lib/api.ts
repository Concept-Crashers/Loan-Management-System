// Use same-origin /api so CSRF cookies are first-party; Vercel rewrites /api to the backend.
// Set VITE_API_URL only when you intentionally need a direct cross-origin backend.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

export interface AuthUser {
  id: string
  name?: string
  email?: string
  phone?: string
  tenantId: string
  branchIds: string[]
  roles: string[]
  permissions: string[]
  mfaEnabled?: boolean
}

type ApiEnvelope<T> = { success: boolean; message: string; data: T; code?: string; errors?: unknown[] }
let accessToken: string | null = null
let authenticatedUser: AuthUser | null = null
let refreshPromise: Promise<boolean> | null = null
let csrfPromise: Promise<string | null> | null = null

export function setAccessToken(token: string | null) { accessToken = token }
export function getAuthenticatedUser() { return authenticatedUser }
function readCsrfToken() {
  if (typeof document === 'undefined') return null
  return document.cookie.split('; ').find((cookie) => cookie.startsWith('lendflow_csrf='))?.slice('lendflow_csrf='.length) ?? null
}
async function ensureCsrfToken() {
  const existing = readCsrfToken()
  if (existing) return existing
  if (!csrfPromise) {
    csrfPromise = fetch(`${API_BASE_URL}/health`, { credentials: 'include' })
      .then(() => readCsrfToken())
      .catch(() => null)
      .finally(() => { csrfPromise = null })
  }
  return csrfPromise
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return false
        const body = await response.json() as ApiEnvelope<{ accessToken: string; user?: AuthUser }>
        setAccessToken(body.data.accessToken)
        authenticatedUser = body.data.user ?? authenticatedUser
        return true
      })
      .catch(() => false)
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, canRefresh = true): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  const method = (init.method ?? 'GET').toUpperCase()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = (await ensureCsrfToken()) ?? readCsrfToken()
    if (csrf) headers.set('X-CSRF-Token', csrf)
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, credentials: 'include' })
  if (response.status === 401 && canRefresh && await refreshAccessToken()) return apiRequest<T>(path, init, false)
  if (response.ok && response.headers.get('content-type')?.includes('text/csv')) return await response.text() as T
  const body = await response.json().catch(() => null) as ApiEnvelope<T> | null
  if (!response.ok || !body?.success) throw new Error(body?.message ?? 'The request could not be completed.')
  return body.data
}

export async function login(email: string, password: string) {
  const data = await apiRequest<{ accessToken: string; user: AuthUser }>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false)
  setAccessToken(data.accessToken)
  authenticatedUser = data.user
  return data.user
}

export function requestPasswordReset(email: string) {
  return apiRequest<null>('/api/v1/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }, false)
}

export function startMfaEnrollment() {
  return apiRequest<{ secret: string; issuer: string; account: string }>('/api/v1/auth/mfa/enrol', { method: 'POST' })
}

export function enableMfa(code: string) {
  return apiRequest<null>('/api/v1/auth/mfa/enable', { method: 'POST', body: JSON.stringify({ code }) })
}

export function disableMfa(code: string) {
  return apiRequest<null>('/api/v1/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ code }) })
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiRequest<null>('/api/v1/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) })
}

export function updateProfile(input: { name?: string; phone?: string; email?: string }) {
  return apiRequest<AuthUser>('/api/v1/auth/me', { method: 'PATCH', body: JSON.stringify(input) })
}

export function getMe() {
  return apiRequest<AuthUser>('/api/v1/auth/me')
}

export interface OrganisationSettings {
  organisation: { name: string; legalName?: string; registrationNumber?: string; address?: string; phone?: string; email?: string }
  branding: { logoUrl?: string; primaryColor?: string; secondaryColor?: string; currency?: string }
  preferences?: { defaultBranchId?: string; defaultRepaymentFrequency?: string; receiptReferenceFormat?: string; notifications?: Record<string, boolean> }
}

export function getOrganisationSettings() {
  return apiRequest<OrganisationSettings>('/api/v1/organisation/settings')
}

export function saveOrganisationSettings(settings: OrganisationSettings) {
  return apiRequest<OrganisationSettings>('/api/v1/organisation/settings', { method: 'PUT', body: JSON.stringify(settings) })
}

export type PublicBranding = { name: string; tagline?: string; legalName?: string; logoUrl?: string; primaryColor?: string; secondaryColor?: string; currency?: string; receiptReferenceFormat?: string; updatedAt?: string | null }
export async function getPublicBranding(): Promise<PublicBranding | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/organisation/branding`, { credentials: 'include' })
    const body = await response.json().catch(() => null) as ApiEnvelope<PublicBranding> | null
    if (!response.ok || !body?.success) return null
    return body.data
  } catch { return null }
}

export function listCashbook() {
  return apiRequest<Array<Record<string, unknown>>>('/api/v1/finance/cashbook')
}

export function settleCashbookEntry(id: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/finance/cashbook/${encodeURIComponent(id)}/settle`, { method: 'POST' })
}

export function listSyncConflicts() {
  return apiRequest<Array<Record<string, unknown>>>('/api/v1/sync/conflicts')
}

export function resolveSyncConflict(id: string, resolution: 'accept_local' | 'accept_server' | 'manual') {
  return apiRequest<Record<string, unknown>>(`/api/v1/sync/conflicts/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: JSON.stringify({ resolution }) })
}

export function listDeadLetterDeliveries() {
  return apiRequest<Array<Record<string, unknown>>>('/api/v1/notifications/deliveries/dead-letter')
}

export function retryNotificationDelivery(id: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/notifications/deliveries/${encodeURIComponent(id)}/retry`, { method: 'POST' })
}

export type PagedResult<T> = { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }
export type ChartAccount = { _id: string; code: string; name: string; type: string; active: boolean; system?: boolean }
export type AccountingPeriod = { _id: string; branchId: string; periodStart: string; periodEnd: string; status: 'open' | 'closed'; closedAt?: string }
export type JournalEntry = { _id: string; postedAt: string; sourceType: string; sourceId: string; periodId?: string; lines: Array<{ account: string; debitMinor?: number; creditMinor?: number }> }

const queryString = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)) })
  return query.toString() ? `?${query.toString()}` : ''
}
export function listChartAccounts(page = 1, search = '') {
  return apiRequest<PagedResult<ChartAccount>>(`/api/v1/finance/accounts${queryString({ page, pageSize: 25, search })}`)
}
export function createChartAccount(input: { code: string; name: string; type: string }) {
  return apiRequest<ChartAccount>('/api/v1/finance/accounts', { method: 'POST', body: JSON.stringify(input) })
}
export function listAccountingPeriods(page = 1, branchId = '') {
  return apiRequest<PagedResult<AccountingPeriod>>(`/api/v1/finance/periods${queryString({ page, pageSize: 25, branchId })}`)
}
export function openAccountingPeriod(input: { branchId: string; periodStart: string; periodEnd: string }) {
  return apiRequest<AccountingPeriod>('/api/v1/finance/periods', { method: 'POST', body: JSON.stringify(input) })
}
export function closeAccountingPeriod(id: string) {
  return apiRequest<{ period: AccountingPeriod; closingEntry: JournalEntry | null }>(`/api/v1/finance/periods/${encodeURIComponent(id)}/close`, { method: 'POST' })
}
export function listLedger(page = 1, params: { branchId?: string; periodId?: string; account?: string } = {}) {
  return apiRequest<PagedResult<JournalEntry>>(`/api/v1/finance/ledger${queryString({ page, pageSize: 25, ...params })}`)
}
export function getTrialBalance(params: { branchId?: string; periodId?: string } = {}) {
  return apiRequest<Array<{ account: string; debitMinor: number; creditMinor: number; balanceMinor: number }>>(`/api/v1/finance/trial-balance${queryString(params)}`)
}
export function downloadFinanceCsv(path: string, filename: string) {
  return apiRequest<string>(path).then((content) => {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
  })
}
export function exportPortfolioSummary() {
  return downloadFinanceCsv('/api/v1/reports/summary/export', 'portfolio-summary.csv')
}
export function exportLedger(params: { branchId?: string; periodId?: string; account?: string } = {}) {
  return downloadFinanceCsv(`/api/v1/finance/ledger/export${queryString(params)}`, 'general-ledger.csv')
}
export type AuditEvent = { _id: string; action: string; entityType: string; entityId: string; actorId: string; actorName?: string; detail?: string; branchId?: string; previous?: unknown; next?: unknown; createdAt: string }
export function listAuditEvents(page = 1, params: { entityType?: string; branchId?: string } = {}) {
  return apiRequest<PagedResult<AuditEvent>>(`/api/v1/audit${queryString({ page, pageSize: 25, ...params })}`)
}
export function listEntityAudit(entityType: string, entityId: string) {
  return apiRequest<PagedResult<AuditEvent>>(`/api/v1/audit/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}?page=1&pageSize=50`)
}
export function getRecordDetail(kind: 'customers' | 'products' | 'applications' | 'loans' | 'payments' | 'disbursements' | 'branches', id: string) {
  const base = kind === 'payments' ? 'finance/payments' : kind === 'loans' ? 'finance/loans' : kind === 'products' ? 'loan-products' : kind === 'disbursements' ? 'finance/disbursements' : kind === 'branches' ? 'organisation/branches' : kind
  return apiRequest<Record<string, unknown>>(`/api/v1/${base}/${encodeURIComponent(id)}`)
}

export function getLoanStatement(id: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/finance/loans/${encodeURIComponent(id)}/statement`)
}

export type RolePermissionEntry = { role: string; normalizedRole: string; permissions: string[]; description?: string; updatedAt?: string | null; locked?: boolean }
export type RoleCatalog = { roles: RolePermissionEntry[]; permissions: string[]; groups: Array<{ key: string; label: string; permissions: string[] }> }
export function getRoleCatalog() { return apiRequest<RoleCatalog>('/api/v1/auth/roles/catalog') }
export function saveRolePermissions(role: string, input: { permissions: string[]; description?: string; roleLabel?: string }) {
  return apiRequest<RolePermissionEntry>(`/api/v1/auth/roles/${encodeURIComponent(role)}`, { method: 'PUT', body: JSON.stringify(input) })
}

export async function restoreSession() {
  if (!await refreshAccessToken()) return null
  authenticatedUser = await apiRequest<AuthUser>('/api/v1/auth/me', {}, false)
  return authenticatedUser
}

export async function logout() {
  try { await apiRequest('/api/v1/auth/logout', { method: 'POST' }, false) } finally { setAccessToken(null); authenticatedUser = null }
}

export type CreditFactor = { code: string; label: string; impact: 'positive' | 'neutral' | 'negative'; points: number; value?: unknown }
export type CreditAssessment = { _id: string; customerId?: string; applicationId?: string; score?: number; grade?: string; riskLevel?: 'low' | 'medium' | 'high' | 'very_high'; recommendation?: string; factors?: CreditFactor[]; riskIndicators?: string[]; source?: string; modelVersion?: string; calculatedAt?: string; createdAt?: string; version?: number; notes?: string }
export function getLatestCreditAssessment(params: { applicationId?: string; customerId?: string }) {
  const q = new URLSearchParams()
  if (params.applicationId) q.set('applicationId', params.applicationId)
  if (params.customerId) q.set('customerId', params.customerId)
  return apiRequest<CreditAssessment | null>(`/api/v1/credit-assessments/latest?${q.toString()}`)
}
export function calculateCreditScore(input: { applicationId?: string; customerId?: string }) {
  return apiRequest<CreditAssessment>('/api/v1/credit-assessments/calculate', { method: 'POST', body: JSON.stringify(input) })
}

export async function downloadAuthenticated(path: string, filename?: string) {
  const headers: Record<string, string> = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  const res = await fetch(path, { credentials: 'include', headers })
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/html')) {
    const html = await res.text()
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
    return
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'download'
  a.click()
  URL.revokeObjectURL(url)
}
export function exportDisbursementReceipt(id: string) { return downloadAuthenticated(`/api/v1/finance/disbursements/${encodeURIComponent(id)}/receipt`) }
export function exportPaymentReceipt(id: string) { return downloadAuthenticated(`/api/v1/finance/payments/${encodeURIComponent(id)}/receipt`) }
export function exportLoanStatementCsv(id: string) { return downloadAuthenticated(`/api/v1/finance/loans/${encodeURIComponent(id)}/statement/export`, `loan-statement-${id}.csv`) }

export async function uploadToCloudinary(signature: { cloudName: string; apiKey: string; timestamp: number; folder: string; type: string; signature: string }, file: File) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('api_key', signature.apiKey)
  fd.append('timestamp', String(signature.timestamp))
  fd.append('folder', signature.folder)
  fd.append('type', signature.type)
  fd.append('signature', signature.signature)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/auto/upload`, { method: 'POST', body: fd })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as any)?.error?.message || `Upload failed (${res.status})`)
  return json as { public_id: string; secure_url?: string; bytes?: number; format?: string; resource_type?: string }
}
