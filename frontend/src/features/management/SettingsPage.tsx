import { useEffect, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { Building2, Check, ChevronRight, CreditCard, FileText, LockKeyhole, Mail, Save, ShieldCheck, Smartphone, SlidersHorizontal, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, Button, Card, Field, Input, Select } from '../../components/ui/primitives'
import { useDispatch, useSelector } from 'react-redux'
import { setBranding, type RootState } from '../../store/store'
import { getOrganisationSettings, saveOrganisationSettings, type OrganisationSettings } from '../../lib/api'
import { api } from '../../lib/services'
import type { StaffMember } from '../../lib/types'
import type { BranchRecord } from '../../lib/services'
import { PhoneNumberInput } from '../../components/ui/PhoneNumberInput'

const roles = ['Super Admin', 'Admin', 'Manager', 'Loan Officer', 'Credit Officer', 'Approver', 'Cashier', 'Accountant', 'Collections Officer']
const permissionRows = [
  ['Manage system settings', 'Super Admin, Admin'], ['Register & update customers', 'Super Admin, Admin, Loan Officer'], ['Create loan applications', 'Super Admin, Admin, Loan Officer'], ['Assess applications', 'Super Admin, Credit Officer, Manager'], ['Approve / reject applications', 'Super Admin, Approver'], ['Record repayments & receipts', 'Super Admin, Cashier, Accountant'], ['Collections follow-ups', 'Super Admin, Collections Officer, Manager'], ['View financial reports', 'Super Admin, Admin, Manager, Accountant'],
]
const defaultToggles = { appSubmitted: true, repaymentSoon: true, paymentReceived: true, repaymentOverdue: true, weeklySummary: false }

export function SettingsPage() {
  const dispatch = useDispatch()
  const branding = useSelector((state: RootState) => state.branding)
  const [teamMembers, setTeamMembers] = useState<StaffMember[]>([])
  const [branches, setBranches] = useState<BranchRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState(branding.companyName)
  const [tagline, setTagline] = useState(branding.tagline)
  const [country, setCountry] = useState(branding.country)
  const [currency, setCurrency] = useState(branding.currency)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(branding.logoDataUrl)
  const [legalName, setLegalName] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [primaryContact, setPrimaryContact] = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [address, setAddress] = useState('')
  const [defaultBranchId, setDefaultBranchId] = useState('')
  const [defaultFrequency, setDefaultFrequency] = useState('Monthly')
  const [receiptFormat, setReceiptFormat] = useState('RCT-{YYYY}-{SEQ}')
  const [toggles, setToggles] = useState(defaultToggles)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const [staffRes, branchRes, settingsRes] = await Promise.allSettled([api.listStaff(), api.listBranches(), getOrganisationSettings()])
      if (!alive) return
      if (staffRes.status === 'fulfilled') setTeamMembers(staffRes.value); else setTeamMembers([])
      if (branchRes.status === 'fulfilled') setBranches(branchRes.value)
      if (settingsRes.status === 'fulfilled') {
        const s = settingsRes.value
        setCompanyName(s.organisation.name || branding.companyName)
        setLegalName(s.organisation.legalName ?? '')
        setRegistrationNumber(s.organisation.registrationNumber ?? '')
        setPrimaryContact(s.organisation.phone ?? '')
        setSupportEmail(s.organisation.email ?? '')
        setAddress(s.organisation.address ?? '')
        setCurrency((s.branding.currency ?? branding.currency) || 'UGX')
        if (s.branding.logoUrl) setLogoDataUrl(s.branding.logoUrl)
        setDefaultBranchId(s.preferences?.defaultBranchId ?? '')
        setDefaultFrequency(s.preferences?.defaultRepaymentFrequency ?? 'Monthly')
        setReceiptFormat(s.preferences?.receiptReferenceFormat ?? 'RCT-{YYYY}-{SEQ}')
        if (s.preferences?.notifications) setToggles({ ...defaultToggles, ...s.preferences.notifications })
      } else {
        toast.error(settingsRes.reason instanceof Error ? settingsRes.reason.message : 'Settings could not be loaded from server.')
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  function toggle(key: keyof typeof toggles) { setToggles((current) => ({ ...current, [key]: !current[key] })) }

  function buildPayload(): OrganisationSettings {
    return {
      organisation: { name: companyName, legalName, registrationNumber, address, phone: primaryContact, email: supportEmail },
      branding: { currency, logoUrl: logoDataUrl ?? '', primaryColor: '#2563eb', secondaryColor: '#0f172a' },
      preferences: { defaultBranchId, defaultRepaymentFrequency: defaultFrequency, receiptReferenceFormat: receiptFormat, notifications: toggles },
    }
  }

  async function save(label: string) {
    setSaving(label)
    try {
      const saved = await saveOrganisationSettings(buildPayload())
      dispatch(setBranding({ companyName: saved.organisation.name, tagline, country, currency: saved.branding.currency ?? currency, logoDataUrl: saved.branding.logoUrl || null }))
      toast.success(`${label} saved`, { description: 'Settings persisted to the server for this tenant.' })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${label} could not be saved.`)
    } finally {
      setSaving(null)
    }
  }

  return <div className="settings-page"><div className="page-heading"><div><div className="eyebrow">MANAGEMENT <span className="eyebrow-separator">/</span> CONFIGURATION</div><h1>Settings</h1><p>Configure the workspace profile, notifications and team responsibilities.</p></div><div className="heading-actions"><span className="settings-save-note"><span className="online-dot" /> {loading ? 'Loading server settings…' : 'Tenant settings synced from server'}</span></div></div>
    <Tabs.Root className="settings-tabs" defaultValue="company"><Tabs.List className="settings-tab-list"><Tabs.Trigger value="company"><Building2 size={15} /> Company</Tabs.Trigger><Tabs.Trigger value="notifications"><Mail size={15} /> Notifications</Tabs.Trigger><Tabs.Trigger value="roles"><Users size={15} /> Roles & access</Tabs.Trigger><Tabs.Trigger value="payments"><CreditCard size={15} /> Loan defaults</Tabs.Trigger></Tabs.List>
      <Tabs.Content value="company" className="settings-tab-content"><Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><Building2 size={18} /></div><div><h2>Company profile</h2><p>Business identity shown across customer records, authentication and receipts.</p></div></div><div className="company-logo-row"><div className="company-logo-mark">{logoDataUrl ? <img className="brand-logo-image" src={logoDataUrl} alt="Company logo preview" /> : <span className="brand-mark"><span /><span /><span /></span>}</div><div><strong>Logo and identity</strong><small>PNG, JPG or SVG · stored on the server (max 2 MB)</small></div><label className="lf-button lf-button-outline lf-button-sm">Change logo<input hidden type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be 2 MB or smaller.'); return }; const reader = new FileReader(); reader.onload = () => setLogoDataUrl(String(reader.result)); reader.readAsDataURL(file) }} /></label></div><div className="settings-form-grid"><Field label="Company name"><Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></Field><Field label="Brand tagline"><Input value={tagline} onChange={(event) => setTagline(event.target.value)} /></Field><Field label="Registration number"><Input value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} placeholder="e.g. UMRA registration" /></Field><Field label="Primary contact" hint="Choose a calling code and enter the local number."><PhoneNumberInput value={primaryContact} onChange={setPrimaryContact} /></Field><Field label="Support email"><Input type="email" value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} placeholder="support@example.com" /></Field><Field label="Country"><Input value={country} onChange={(event) => setCountry(event.target.value)} /></Field><Field label="Legal name"><Input value={legalName} onChange={(event) => setLegalName(event.target.value)} /></Field><Field label="Default currency"><Input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} /></Field><Field label="Address" className="field-span-2"><Input value={address} onChange={(event) => setAddress(event.target.value)} /></Field></div><div className="settings-panel-footer"><span><ShieldCheck size={14} /> Branding updates apply system-wide after saving.</span><Button icon={Save} loading={saving === 'Company profile'} onClick={() => save('Company profile')}>Save changes</Button></div></Card>
        <Card className="settings-panel settings-branch-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><Building2 size={18} /></div><div><h2>Branch defaults</h2><p>Select a default branch from branches configured in the system.</p></div></div><div className="settings-inline-row"><div><strong>Default operational branch</strong><small>Saved with tenant preferences.</small></div><Select value={defaultBranchId} onChange={(event) => setDefaultBranchId(event.target.value)}><option value="">No default branch</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.district}</option>)}</Select></div></Card></Tabs.Content>
      <Tabs.Content value="notifications" className="settings-tab-content"><Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><Mail size={18} /></div><div><h2>Notification preferences</h2><p>Choose which events staff see; preferences are saved to the server.</p></div></div><div className="notification-settings-list">{([{ key: 'appSubmitted', title: 'Application submitted', description: 'Alert the review team when a borrower request enters the queue.', icon: FileText }, { key: 'repaymentSoon', title: 'Upcoming repayment', description: 'Surface reminders ahead of a scheduled payment date.', icon: Smartphone }, { key: 'paymentReceived', title: 'Repayment received', description: 'Confirm recorded payment activity for the servicing team.', icon: Check }, { key: 'repaymentOverdue', title: 'Repayment overdue', description: 'Show a follow-up task when an installment becomes overdue.', icon: ShieldCheck }, { key: 'weeklySummary', title: 'Weekly portfolio summary', description: 'Prepare a weekly management digest for authorized staff.', icon: SlidersHorizontal }] as const).map(({ key, title, description, icon: Icon }) => <div className="notification-setting" key={key}><span className="notification-setting-icon"><Icon size={17} /></span><span className="notification-setting-copy"><strong>{title}</strong><small>{description}</small></span><button className={`toggle-switch ${toggles[key] ? 'toggle-on' : ''}`} role="switch" aria-checked={toggles[key]} onClick={() => toggle(key)} aria-label={`Toggle ${title}`}><span /></button></div>)}</div><div className="notification-future-note"><Mail size={15} /> SMS and email delivery requires provider configuration; preferences are stored now.</div><div className="settings-panel-footer"><span>Save to persist preferences for this tenant.</span><Button icon={Save} loading={saving === 'Notification preferences'} onClick={() => save('Notification preferences')}>Save preferences</Button></div></Card></Tabs.Content>
      <Tabs.Content value="roles" className="settings-tab-content"><Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><LockKeyhole size={18} /></div><div><h2>Role-based responsibilities</h2><p>Keep sensitive data access and financial decisions assigned by role.</p></div></div><div className="role-chips">{roles.map((role) => <span className="role-chip" key={role}><span className="role-chip-dot" />{role}<ChevronRight size={13} /></span>)}</div><div className="permission-table-wrap"><table className="lf-table permission-table"><thead><tr><th>Permission group</th><th>Roles shown in this workspace</th><th>Control</th></tr></thead><tbody>{permissionRows.map(([permission, allowed]) => <tr key={permission}><td><strong>{permission}</strong></td><td>{allowed}</td><td><span className="permission-enabled"><Check size={13} /> Separate</span></td></tr>)}</tbody></table></div><div className="access-warning"><LockKeyhole size={15} />Authorization is enforced by the backend; UI roles are informational.</div></Card><Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><Users size={18} /></div><div><h2>Team members</h2><p>Staff assignment by branch and role (loaded from server).</p></div></div><div className="staff-mini-list">{teamMembers.length ? teamMembers.slice(0, 6).map((person) => <div key={person.id}><Avatar name={person.name} size="sm" /><span><strong>{person.name}</strong><small>{person.role} · {person.branch}</small></span><span className="staff-mini-status">{person.status}</span></div>) : <div className="table-empty"><p>{loading ? 'Loading team members…' : 'No team members assigned yet.'}</p></div>}</div></Card></Tabs.Content>
      <Tabs.Content value="payments" className="settings-tab-content"><Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><CreditCard size={18} /></div><div><h2>Loan & payment defaults</h2><p>Tenant preferences saved to the server; product terms remain configured per loan product.</p></div></div><div className="settings-form-grid"><Field label="Default currency"><Input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} /></Field><Field label="Default repayment frequency"><Select value={defaultFrequency} onChange={(event) => setDefaultFrequency(event.target.value)}><option>Daily</option><option>Weekly</option><option>Bi-weekly</option><option>Monthly</option></Select></Field><Field label="Receipt reference format"><Input value={receiptFormat} onChange={(event) => setReceiptFormat(event.target.value)} /></Field></div><div className="payment-channel-list"><strong>Enabled channels (manual recording)</strong><div><span><Check size={14} />MTN Mobile Money</span><span><Check size={14} />Airtel Money</span><span><Check size={14} />Bank transfer</span><span><Check size={14} />Cash</span></div></div><div className="notification-future-note"><Smartphone size={15} />Live mobile-money/bank/SMS/email integrations require provider setup; preferences are stored.</div><div className="settings-panel-footer"><span>Saved to tenant settings.</span><Button icon={Save} loading={saving === 'Loan defaults'} onClick={() => save('Loan defaults')}>Save defaults</Button></div></Card></Tabs.Content>
    </Tabs.Root>
  </div>
}
