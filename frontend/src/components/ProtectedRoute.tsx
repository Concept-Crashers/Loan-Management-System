import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { setAuthStatus, setBranding, setUser, type RootState } from '../store/store'
import { getOrganisationSettings, getPublicBranding, restoreSession } from '../lib/api'

function applyBrandingToDocument(input: { name: string; logoUrl?: string | null; primaryColor?: string | null }) {
  const name = (input.name || 'Trust Loans').trim() || 'Trust Loans'
  document.title = `${name} — Loan Operations`
  const theme = (input.primaryColor || '#17365d').trim() || '#17365d'
  const themeMeta = document.querySelector('meta[name="theme-color"]') || (() => { const m = document.createElement('meta'); m.setAttribute('name', 'theme-color'); document.head.appendChild(m); return m })()
  themeMeta.setAttribute('content', theme)
  let manifest = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null
  if (!manifest) { manifest = document.createElement('link'); manifest.rel = 'manifest'; document.head.appendChild(manifest) }
  manifest.href = `/api/v1/organisation/manifest.webmanifest?v=${encodeURIComponent(name)}`
  const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]') || (() => { const m = document.createElement('meta'); m.setAttribute('name', 'apple-mobile-web-app-title'); document.head.appendChild(m); return m })()
  appleTitle.setAttribute('content', name.slice(0, 24))
  if (input.logoUrl) {
    let icon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null
    if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon) }
    icon.href = input.logoUrl
    icon.removeAttribute('type')
    const apple = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null
    if (apple) apple.href = input.logoUrl
  }
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch()
  const location = useLocation()
  const status = useSelector((state: RootState) => state.session.authStatus)
  const branding = useSelector((state: RootState) => state.branding)

  useEffect(() => {
    getPublicBranding().then((b) => {
      if (!b) return
      dispatch(setBranding({ companyName: b.name || 'Trust Loans', tagline: b.tagline || 'LOAN OPERATIONS', country: branding.country, currency: b.currency || branding.currency, logoDataUrl: b.logoUrl || branding.logoDataUrl, signatureDataUrl: branding.signatureDataUrl }))
      applyBrandingToDocument({ name: b.name, logoUrl: b.logoUrl, primaryColor: b.primaryColor })
    }).catch(() => {})
  }, [branding.country, branding.currency, branding.logoDataUrl, branding.signatureDataUrl, dispatch])

  useEffect(() => {
    if (status !== 'unknown') return
    restoreSession().then(async (user) => {
      dispatch(setUser(user))
      if (!user) { dispatch(setAuthStatus('anonymous')); return }
      try {
        const settings = await getOrganisationSettings()
        const next = { companyName: settings.organisation.name, tagline: branding.tagline, country: branding.country, currency: settings.branding.currency ?? 'UGX', logoDataUrl: settings.branding.logoUrl || null, signatureDataUrl: settings.branding.signatureUrl || null }
        dispatch(setBranding(next))
        applyBrandingToDocument({ name: next.companyName, logoUrl: next.logoDataUrl, primaryColor: settings.branding.primaryColor })
      } catch {}
    })
  }, [branding.country, branding.tagline, dispatch, status])
  if (status === 'unknown') return <div className="page-loading">Restoring secure session…</div>
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}
