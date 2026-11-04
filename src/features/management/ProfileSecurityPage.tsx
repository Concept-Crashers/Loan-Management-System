import { useState } from 'react'
import { Check, KeyRound, LockKeyhole, MonitorSmartphone, Save, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Select } from '../../components/ui/primitives'
import { disableMfa, enableMfa, startMfaEnrollment } from '../../lib/api'

export function ProfileSecurityPage() {
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaSecret, setMfaSecret] = useState<string | null>(null)
  const [sessions, setSessions] = useState([
    { device: 'Chrome on Linux', location: 'Kampala, Uganda', lastSeen: 'Active now', current: true },
    { device: 'Mobile browser', location: 'Kampala, Uganda', lastSeen: 'Yesterday', current: false },
  ])

  async function toggleMfa() {
    try {
      if (mfaEnabled) {
        await disableMfa(mfaCode)
        setMfaEnabled(false)
        setMfaCode('')
        toast.success('MFA disabled')
      } else if (!mfaSecret) {
        const enrollment = await startMfaEnrollment()
        setMfaSecret(enrollment.secret)
        toast.success('MFA enrollment started', { description: 'Add the secret to your authenticator app, then enter a code to enable it.' })
      } else {
        await enableMfa(mfaCode)
        setMfaEnabled(true)
        setMfaCode('')
        toast.success('MFA enabled')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'MFA update failed.')
    }
  }

  function save(section: string) {
    toast.success(`${section} saved in the demo workspace`, {
      description: 'Connect the identity service before using this for live accounts.',
    })
  }

  return <div className="settings-page profile-page">
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link to="/">WORKSPACE</Link><span className="eyebrow-separator">/</span> PROFILE & SECURITY</div>
        <h1>Profile & security</h1>
        <p>Manage your personal details, sign-in protection and active sessions.</p>
      </div>
      <span className="settings-save-note"><span className="online-dot" /> Demo identity workspace</span>
    </div>

    <div className="settings-tab-content profile-security-grid">
      <Card className="settings-panel">
        <div className="settings-panel-header"><div className="settings-panel-icon"><ShieldCheck size={18} /></div><div><h2>Personal details</h2><p>Information shown to colleagues and on activity records.</p></div></div>
        <div className="settings-form-grid"><Field label="Full name"><Input defaultValue="Sarah Kiconco" /></Field><Field label="Work email"><Input type="email" defaultValue="sarah.kiconco@lendflow.ug" /></Field><Field label="Phone number"><Input defaultValue="+256 772 123 456" /></Field><Field label="Role"><Select defaultValue="Manager" disabled><option>Manager</option></Select></Field></div>
        <div className="settings-panel-footer"><span>Last updated today</span><Button icon={Save} onClick={() => save('Personal details')}>Save changes</Button></div>
      </Card>

      <Card className="settings-panel">
        <div className="settings-panel-header"><div className="settings-panel-icon"><KeyRound size={18} /></div><div><h2>Password & MFA</h2><p>Use a second factor to protect sensitive borrower and financial data.</p></div></div>
        <div className="settings-form-grid"><Field label="Current password"><Input type="password" placeholder="Enter current password" /></Field><Field label="New password"><Input type="password" placeholder="At least 12 characters" /></Field><Field label="Confirm new password"><Input type="password" placeholder="Repeat new password" /></Field></div>
        <div className="security-toggle-row"><span className="security-toggle-icon"><LockKeyhole size={16} /></span><span><strong>Multi-factor authentication</strong><small>MFA is disabled by default and is configured here, not on the sign-in form.</small>{mfaSecret && <small>Setup secret: <code>{mfaSecret}</code></small>}</span><button type="button" className={`toggle-switch ${mfaEnabled ? 'toggle-on' : ''}`} role="switch" aria-checked={mfaEnabled} onClick={() => void toggleMfa()}><span /></button></div>
        {mfaSecret && <Field label={mfaEnabled ? 'Authenticator code to disable MFA' : 'Authenticator code to confirm MFA'}><Input inputMode="numeric" pattern="[0-9]{6}" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} placeholder="6-digit code" /></Field>}
        <div className="settings-panel-footer"><span>{mfaEnabled ? 'MFA is enabled.' : 'MFA is currently disabled.'}</span><Button icon={Save} onClick={() => save('Security preferences')}>Save security</Button></div>
      </Card>

      <Card className="settings-panel profile-sessions-panel">
        <div className="settings-panel-header"><div className="settings-panel-icon"><MonitorSmartphone size={18} /></div><div><h2>Active sessions</h2><p>Review where your account is currently signed in.</p></div><Button variant="outline" size="sm" onClick={() => { setSessions((current) => current.filter((session) => session.current)); toast.success('Other demo sessions signed out') }}>Sign out others</Button></div>
        <div className="session-list">{sessions.map((session) => <div className="session-row" key={session.device}><span className="session-icon"><MonitorSmartphone size={16} /></span><span><strong>{session.device}</strong><small>{session.location} · {session.lastSeen}</small></span>{session.current ? <span className="session-current"><Check size={12} /> Current</span> : <Button variant="ghost" size="xs" onClick={() => setSessions((current) => current.filter((item) => item !== session))}>Revoke</Button>}</div>)}</div>
      </Card>
    </div>
  </div>
}
