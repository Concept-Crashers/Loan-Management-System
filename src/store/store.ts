import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'

type Theme = 'light' | 'dark'
interface SessionState { role: string; sidebarOpen: boolean; theme: Theme }
const initialTheme: Theme = typeof window !== 'undefined' && window.localStorage.getItem('lendflow-theme') === 'dark' ? 'dark' : 'light'
const initialState: SessionState = { role: 'Manager', sidebarOpen: false, theme: initialTheme }
const sessionSlice = createSlice({
  name: 'session', initialState,
  reducers: {
    setRole(state, action: PayloadAction<string>) { state.role = action.payload },
    setTheme(state, action: PayloadAction<Theme>) { state.theme = action.payload },
    toggleTheme(state) { state.theme = state.theme === 'light' ? 'dark' : 'light' },
    toggleSidebar(state) { state.sidebarOpen = !state.sidebarOpen },
    closeSidebar(state) { state.sidebarOpen = false },
  },
})

export const { setRole, setTheme, toggleTheme, toggleSidebar, closeSidebar } = sessionSlice.actions
export const store = configureStore({ reducer: { session: sessionSlice.reducer } })
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
