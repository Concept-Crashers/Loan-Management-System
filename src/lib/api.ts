const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export interface AuthUser {
  id: string
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

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return false
        const body = await response.json() as ApiEnvelope<{ accessToken: string }>
        setAccessToken(body.data.accessToken)
        authenticatedUser = (body.data as { user?: AuthUser }).user ?? authenticatedUser
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
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, credentials: 'include' })
  if (response.status === 401 && canRefresh && await refreshAccessToken()) return apiRequest<T>(path, init, false)
  const body = await response.json().catch(() => null) as ApiEnvelope<T> | null
  if (!response.ok || !body?.success) throw new Error(body?.message ?? 'The request could not be completed.')
  return body.data
}

export async function login(email: string, password: string, mfaCode?: string) {
  const data = await apiRequest<{ accessToken: string; user: AuthUser }>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password, mfaCode }) }, false)
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

export async function restoreSession() {
  if (!await refreshAccessToken()) return null
  authenticatedUser = await apiRequest<AuthUser>('/api/v1/auth/me', {}, false)
  return authenticatedUser
}

export async function logout() {
  try { await apiRequest('/api/v1/auth/logout', { method: 'POST' }, false) } finally { setAccessToken(null); authenticatedUser = null }
}
