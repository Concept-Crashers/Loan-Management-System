import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'

type Theme = 'light' | 'dark'
interface SessionState { role: string; sidebarOpen: boolean; theme: Theme; user: { id: string; tenantId: string; branchIds: string[]; roles: string[]; permissions: string[] } | null; authStatus: 'unknown' | 'authenticated' | 'anonymous' }
export interface BrandingState { companyName: string; tagline: string; country: string; currency: string; logoDataUrl: string | null }
const defaultBranding: BrandingState = { companyName: 'LendFlow Microfinance', tagline: 'LOAN OPERATIONS', country: 'Uganda', currency: 'UGX', logoDataUrl: null }
function loadBranding(): BrandingState {
  if (typeof window === 'undefined') return defaultBranding
  try { return { ...defaultBranding, ...JSON.parse(window.localStorage.getItem('lendflow-branding') ?? '{}') } as BrandingState } catch { return defaultBranding }
}
const initialTheme: Theme = typeof window !== 'undefined' && window.localStorage.getItem('lendflow-theme') === 'dark' ? 'dark' : 'light'
const initialState: SessionState = { role: '', sidebarOpen: false, theme: initialTheme, user: null, authStatus: 'unknown' }
const brandingSlice = createSlice({
  name: 'branding',
  initialState: loadBranding(),
  reducers: {
    setBranding(_state, action: PayloadAction<BrandingState>) {
      if (typeof window !== 'undefined') window.localStorage.setItem('lendflow-branding', JSON.stringify(action.payload))
      return action.payload
    },
  },
})
const sessionSlice = createSlice({
  name: 'session', initialState,
  reducers: {
    setRole(state, action: PayloadAction<string>) { state.role = action.payload },
    setTheme(state, action: PayloadAction<Theme>) { state.theme = action.payload },
    toggleTheme(state) { state.theme = state.theme === 'light' ? 'dark' : 'light' },
    toggleSidebar(state) { state.sidebarOpen = !state.sidebarOpen },
    closeSidebar(state) { state.sidebarOpen = false },
    setUser(state, action: PayloadAction<SessionState['user']>) { state.user = action.payload; state.role = action.payload?.roles[0] ?? ''; state.authStatus = action.payload ? 'authenticated' : 'anonymous' },
    setAuthStatus(state, action: PayloadAction<SessionState['authStatus']>) { state.authStatus = action.payload },
  },
})

export const { setRole, setTheme, toggleTheme, toggleSidebar, closeSidebar, setUser, setAuthStatus } = sessionSlice.actions
export const { setBranding } = brandingSlice.actions
export const store = configureStore({ reducer: { session: sessionSlice.reducer, branding: brandingSlice.reducer } })
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
