import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { setAuthStatus, setUser, type RootState } from '../store/store'
import { restoreSession } from '../lib/api'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch()
  const location = useLocation()
  const status = useSelector((state: RootState) => state.session.authStatus)
  useEffect(() => {
    if (status !== 'unknown') return
    restoreSession().then((user) => { dispatch(setUser(user)); if (!user) dispatch(setAuthStatus('anonymous')) })
  }, [dispatch, status])
  if (status === 'unknown') return <div className="page-loading">Restoring secure session…</div>
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}
