import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'

interface SessionState { role: string; sidebarOpen: boolean }
const initialState: SessionState = { role: 'Manager', sidebarOpen: false }
const sessionSlice = createSlice({
  name: 'session', initialState,
  reducers: {
    setRole(state, action: PayloadAction<string>) { state.role = action.payload },
    toggleSidebar(state) { state.sidebarOpen = !state.sidebarOpen },
    closeSidebar(state) { state.sidebarOpen = false },
  },
})

export const { setRole, toggleSidebar, closeSidebar } = sessionSlice.actions
export const store = configureStore({ reducer: { session: sessionSlice.reducer } })
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
