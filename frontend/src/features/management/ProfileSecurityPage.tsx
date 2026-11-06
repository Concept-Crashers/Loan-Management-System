import { useEffect, useState } from 'react'
import { Check, KeyRound, LockKeyhole, MonitorSmartphone, Save, ShieldCheck } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useDispatch, useSelector } from 'react-redux'
import { Button, Card, Field, IconInput, Input, PasswordInput, Select } from '../../components/ui/primitives'
import { changePassword, disableMfa, enableMfa, getMe, startMfaEnrollment, updateProfile, logout } from '../../lib/api'
import { setUser, type RootState } from '../../store/store'

export function ProfileSecurityPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const user = useSelector((state: RootState) => state.session.user)
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [mfaEnabled, setMfaEnabled] = useState(!!user?.mfaEnabled)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaSecret, setMfaSecret] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getMe().then((me) => { if (!alive) return; setName(me.name ?? ''); setEmail(me.email ?? ''); setPhone(me.phone ?? ''); setMfaEnabled(!!me.mfaEnabled); dispatch(setUser(me)) }).catch((e) => toast.error(e instanceof Error ? e.message : 'Profile could not be loaded.')).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [dispatch])

  async function saveProfile() {
    setSavingProfile(true)
    try {
      const updated = await updateProfile({ name, phone, email })
      dispatch(setUser(updated))
      setEmail(updated.email ?? email)
      toast.success('Profile saved', { description: 'Your profile was updated on the server. Use your new email next time you sign in.' })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Profile could not be saved.')
    } finally { setSavingProfile(false) }
  }

  async function submitPassword() {
    if (!currentPassword || !newPassword) { toast.error('Enter your current and new password.'); return }
    if (newPassword !== confirmPassword) { toast.error('New password and confirmation do not match.'); return }
    setSavingPassword(true)
    try {
      await changePassword(currentPassword, newPassword)
      toast.success('Password changed', { description: 'Sign in again with your new password.' })
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      await logout(); dispatch(setUser(null)); navigate('/login', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Password could not be changed.')
    } finally { setSavingPassword(false) }
  }

  async function toggleMfa() {
    try {
      if (mfaEnabled) {
        await disableMfa(mfaCode)
        setMfaEnabled(false); setMfaCode(''); setMfaSecret(null)
        toast.success('MFA disabled')
      } else if (!mfaSecret) {
        const enrollment = await startMfaEnrollment()
        setMfaSecret(enrollment.secret)
        toast.success('MFA enrollment started', { description: 'Add the secret to your authenticator app, then enter a 6-digit code.' })
      } else {
        await enableMfa(mfaCode)
        setMfaEnabled(true); setMfaCode(''); setMfaSecret(null)
        toast.success('MFA enabled')
        try { const me = await getMe(); dispatch(setUser(me)) } catch {}
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'MFA update failed.')
    }
  }

  return <div className="settings-page profile-page">
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link to="/">WORKSPACE</Link><span className="eyebrow-separator">/</span> PROFILE & SECURITY</div>
        <h1>Profile & security</h1>
        <p>Manage your personal details and sign-in protection (saved to the server).</p>
      </div>
      <span className="settings-save-note"><span className="online-dot" /> {loading ? 'Loading profile…' : 'Authenticated account'}</span>
    </div>

    <div className="settings-tab-content profile-security-grid">
      <Card className="settings-panel">
        <div className="settings-panel-header"><div className="settings-panel-icon"><ShieldCheck size={18} /></div><div><h2>Personal details</h2><p>Information shown to colleagues and on activity records.</p></div></div>
        <div className="settings-form-grid"><Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Work email"><IconInput icon={ShieldCheck} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field><Field label="Phone number"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+256..." /></Field><Field label="Role"><Select value={user?.roles?.[0] ?? ''} disabled><option>{user?.roles?.join(', ') || '—'}</option></Select></Field></div>
        <div className="settings-panel-footer"><span>Updates your account on the server.</span><Button icon={Save} loading={savingProfile} onClick={() => void saveProfile()}>Save changes</Button></div>
      </Card>

      <Card className="settings-panel">
        <div className="settings-panel-header"><div className="settings-panel-icon"><KeyRound size={18} /></div><div><h2>Password & MFA</h2><p>Use a strong password and a second factor to protect sensitive data.</p></div></div>
        <div className="settings-form-grid"><Field label="Current password"><PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" autoComplete="current-password" /></Field><Field label="New password"><PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 12 characters (upper, lower, number)" autoComplete="new-password" /></Field><Field label="Confirm new password"><PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat new password" autoComplete="new-password" /></Field></div>
        <div className="settings-panel-footer"><span>Password changes are applied immediately on the server.</span><Button icon={Save} loading={savingPassword} onClick={() => void submitPassword()}>Change password</Button></div>
        <div className="security-toggle-row" style={{ marginTop: 12 }}><span className="security-toggle-icon"><LockKeyhole size={16} /></span><span><strong>Multi-factor authentication</strong><small>Configure here (not on sign-in). Enrollment requires an authenticator code.</small>{mfaSecret && <small>Setup secret: <code style={{ userSelect: 'all' }}>{mfaSecret}</code></small>}</span><button type="button" className={`toggle-switch ${mfaEnabled ? 'toggle-on' : ''}`} role="switch" aria-checked={mfaEnabled} onClick={() => void toggleMfa()}><span /></button></div>
        {(mfaSecret || mfaEnabled) && <Field label={mfaEnabled ? 'Authenticator code to disable MFA' : 'Authenticator code to confirm MFA'}><Input inputMode="numeric" pattern="[0-9]{6}" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} placeholder="6-digit code" /></Field>}
        <div className="settings-panel-footer"><span>{mfaEnabled ? 'MFA is enabled.' : mfaSecret ? 'Enter a code from your authenticator to enable MFA.' : 'MFA is disabled.'}</span></div>
      </Card>

      <Card className="settings-panel profile-sessions-panel">
        <div className="settings-panel-header"><div className="settings-panel-icon"><MonitorSmartphone size={18} /></div><div><h2>Active sessions</h2><p>Session management</p></div></div>
        <div className="session-list"><div className="session-row"><span className="session-icon"><MonitorSmartphone size={16} /></span><span><strong>Current session</strong><small>This browser · authenticated via access/refresh tokens</small></span><span className="session-current"><Check size={12} /> Current</span></div></div>
        <div className="notification-future-note" style={{ marginTop: 10 }}><ShieldCheck size={15} /> Per-device session listing/revocation is not exposed by the current backend; changing your password invalidates refresh tokens.</div>
      </Card>
    </div>
  </div>
}
