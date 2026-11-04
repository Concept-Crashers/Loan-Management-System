import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { setAuthStatus, setBranding, setUser, type RootState } from '../store/store'
import { getOrganisationSettings, restoreSession } from '../lib/api'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch()
  const location = useLocation()
  const status = useSelector((state: RootState) => state.session.authStatus)
  const branding = useSelector((state: RootState) => state.branding)
  useEffect(() => {
    if (status !== 'unknown') return
    restoreSession().then(async (user) => {
      dispatch(setUser(user))
      if (!user) {
        dispatch(setAuthStatus('anonymous'))
        return
      }
      try {
        const settings = await getOrganisationSettings()
        dispatch(setBranding({
          companyName: settings.organisation.name,
          tagline: branding.tagline,
          country: branding.country,
          currency: settings.branding.currency ?? 'UGX',
          logoDataUrl: settings.branding.logoUrl || null,
        }))
      } catch {
        // Existing local branding remains available when the optional settings permission is absent.
      }
    })
  }, [branding.country, branding.tagline, dispatch, status])
  if (status === 'unknown') return <div className="page-loading">Restoring secure session…</div>
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}
