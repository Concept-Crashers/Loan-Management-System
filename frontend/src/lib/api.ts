const API_BASE_URL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.PROD ? 'https://lmss-drmr.onrender.com' : 'http://localhost:4000')

export interface AuthUser {
  id: string
  name?: string
  email?: string
  tenantId: string
  branchIds: string[]
  roles: string[]
  permissions: string[]
}

type ApiEnvelope<T> = { success: boolean; message: string; data: T; code?: string; errors?: unknown[] }
let accessToken: string | null = null
let authenticatedUser: AuthUser | null = null
let refreshPromise: Promise<boolean> | null = null

export function setAccessToken(token: string | null) { accessToken = token }
export function getAuthenticatedUser() { return authenticatedUser }
function csrfToken() {
  if (typeof document === 'undefined') return null
  return document.cookie.split('; ').find((cookie) => cookie.startsWith('lendflow_csrf='))?.slice('lendflow_csrf='.length) ?? null
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
  const csrf = csrfToken()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrf) headers.set('X-CSRF-Token', csrf)
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

export interface OrganisationSettings {
  organisation: { name: string; legalName?: string; registrationNumber?: string; address?: string; phone?: string; email?: string }
  branding: { logoUrl?: string; primaryColor?: string; secondaryColor?: string; currency?: string }
}

export function getOrganisationSettings() {
  return apiRequest<OrganisationSettings>('/api/v1/organisation/settings')
}

export function saveOrganisationSettings(settings: OrganisationSettings) {
  return apiRequest<OrganisationSettings>('/api/v1/organisation/settings', { method: 'PUT', body: JSON.stringify(settings) })
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
export type AuditEvent = { _id: string; action: string; entityType: string; entityId: string; actorId: string; branchId?: string; previous?: unknown; next?: unknown; createdAt: string }
export function listAuditEvents(page = 1, params: { entityType?: string; branchId?: string } = {}) {
  return apiRequest<PagedResult<AuditEvent>>(`/api/v1/audit${queryString({ page, pageSize: 25, ...params })}`)
}
export function listEntityAudit(entityType: string, entityId: string) {
  return apiRequest<PagedResult<AuditEvent>>(`/api/v1/audit/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}?page=1&pageSize=50`)
}
export function getRecordDetail(kind: 'customers' | 'products' | 'applications' | 'loans' | 'payments', id: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/${kind === 'payments' ? 'finance/payments' : kind === 'loans' ? 'finance/loans' : kind}/${encodeURIComponent(id)}`)
}

export async function restoreSession() {
  if (!await refreshAccessToken()) return null
  authenticatedUser = await apiRequest<AuthUser>('/api/v1/auth/me', {}, false)
  return authenticatedUser
}

export async function logout() {
  try { await apiRequest('/api/v1/auth/logout', { method: 'POST' }, false) } finally { setAccessToken(null); authenticatedUser = null }
}
