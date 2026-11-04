import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'

type Theme = 'light' | 'dark'
interface SessionState { role: string; sidebarOpen: boolean; theme: Theme; user: { id: string; tenantId: string; branchIds: string[]; roles: string[]; permissions: string[] } | null; authStatus: 'unknown' | 'authenticated' | 'anonymous' }
const initialTheme: Theme = typeof window !== 'undefined' && window.localStorage.getItem('lendflow-theme') === 'dark' ? 'dark' : 'light'
const initialState: SessionState = { role: '', sidebarOpen: false, theme: initialTheme, user: null, authStatus: 'unknown' }
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
export const store = configureStore({ reducer: { session: sessionSlice.reducer } })
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
