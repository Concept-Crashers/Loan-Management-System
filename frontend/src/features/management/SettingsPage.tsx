import { useEffect, useMemo, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { Building2, Check, CreditCard, FileText, LockKeyhole, Mail, Save, ShieldCheck, Smartphone, SlidersHorizontal, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, Button, Card, Field, Input, Select } from '../../components/ui/primitives'
import { useDispatch, useSelector } from 'react-redux'
import { setBranding, type RootState } from '../../store/store'
import { getOrganisationSettings, saveOrganisationSettings, type OrganisationSettings, getRoleCatalog, saveRolePermissions, type RoleCatalog, type RolePermissionEntry } from '../../lib/api'
import { api } from '../../lib/services'
import type { StaffMember } from '../../lib/types'
import type { BranchRecord } from '../../lib/services'
import { PhoneNumberInput } from '../../components/ui/PhoneNumberInput'

const defaultToggles = { appSubmitted: true, repaymentSoon: true, paymentReceived: true, repaymentOverdue: true, weeklySummary: false }

export function SettingsPage() {
  const dispatch = useDispatch()
  const branding = useSelector((state: RootState) => state.branding)
  const me = useSelector((state: RootState) => state.session.user)
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
  const [roleCatalog, setRoleCatalog] = useState<RoleCatalog | null>(null)
  const [roleLoading, setRoleLoading] = useState(false)
  const [roleSaving, setRoleSaving] = useState(false)
  const [selectedRole, setSelectedRole] = useState('')
  const [roleDraft, setRoleDraft] = useState<Record<string, string[]>>({})
  const [roleSearch, setRoleSearch] = useState('')

  const isSuperAdmin = (me?.roles ?? []).some((r) => ['super_admin','super-admin','superadmin'].includes(String(r).toLowerCase().replace(/[\s-]+/g, '_')))
  const canManageRoles = isSuperAdmin || (me?.permissions ?? []).includes('*') || (me?.permissions ?? []).includes('identity.roles.manage')
  const canViewRoles = isSuperAdmin || canManageRoles || (me?.permissions ?? []).includes('identity.roles.view')

  async function loadRoles() {
    if (!canViewRoles) return
    setRoleLoading(true)
    try {
      const catalog = await getRoleCatalog()
      setRoleCatalog(catalog)
      setRoleDraft(Object.fromEntries(catalog.roles.map((r) => [r.normalizedRole, [...new Set(r.permissions.filter((p) => p !== '*'))]])))
      setSelectedRole((current) => current && catalog.roles.some((r) => r.normalizedRole === current) ? current : (catalog.roles.find((r) => !r.locked)?.normalizedRole || catalog.roles[0]?.normalizedRole || ''))
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Role permissions could not be loaded.') }
    finally { setRoleLoading(false) }
  }

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

  useEffect(() => { void loadRoles() }, [canViewRoles])

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
    } catch (error) { toast.error(error instanceof Error ? error.message : `${label} could not be saved.`) }
    finally { setSaving(null) }
  }

  const selected = roleCatalog?.roles.find((r) => r.normalizedRole === selectedRole) ?? null
  const selectedPermissions = roleDraft[selectedRole] ?? []
  const allCatalogPermissions = roleCatalog?.permissions ?? []
  const filteredGroups = useMemo(() => {
    const q = roleSearch.trim().toLowerCase()
    return (roleCatalog?.groups ?? []).map((g) => ({ ...g, permissions: g.permissions.filter((p) => !q || p.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)) })).filter((g) => g.permissions.length)
  }, [roleCatalog, roleSearch])

  function setRolePerms(role: string, perms: string[]) { setRoleDraft((cur) => ({ ...cur, [role]: [...new Set(perms)] })) }
  function togglePerm(role: string, perm: string) { const set = new Set(roleDraft[role] ?? []); if (set.has(perm)) set.delete(perm); else set.add(perm); setRolePerms(role, [...set]) }
  function toggleGroup(role: string, perms: string[]) { const set = new Set(roleDraft[role] ?? []); const all = perms.every((p) => set.has(p)); perms.forEach((p) => all ? set.delete(p) : set.add(p)); setRolePerms(role, [...set]) }
  function roleSummary(role: RolePermissionEntry) { return role.locked ? 'Full access (locked)' : `${(roleDraft[role.normalizedRole] ?? []).length} / ${allCatalogPermissions.length} permissions` }

  async function saveSelectedRole() {
    if (!selected || selected.locked) return
    setRoleSaving(true)
    try {
      const saved = await saveRolePermissions(selected.normalizedRole, { permissions: selectedPermissions, roleLabel: selected.role })
      setRoleCatalog((cur) => cur ? { ...cur, roles: cur.roles.map((r) => r.normalizedRole === saved.normalizedRole ? { ...r, ...saved } : r) } : cur)
      toast.success(`${selected.role} permissions saved`, { description: 'Users with this role will receive these permissions on next login/token refresh.' })
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Role permissions could not be saved.') }
    finally { setRoleSaving(false) }
  }

  return <div className="settings-page"><div className="page-heading"><div><div className="eyebrow">MANAGEMENT <span className="eyebrow-separator">/</span> CONFIGURATION</div><h1>Settings</h1><p>Configure workspace branding, notifications, role permissions, and loan defaults.</p></div><div className="heading-actions"><span className="settings-save-note"><span className="online-dot" /> {loading ? 'Loading server settings…' : 'Tenant settings synced from server'}</span></div></div>
    <Tabs.Root className="settings-tabs" defaultValue="company"><Tabs.List className="settings-tab-list"><Tabs.Trigger value="company"><Building2 size={15} /> Company</Tabs.Trigger><Tabs.Trigger value="notifications"><Mail size={15} /> Notifications</Tabs.Trigger><Tabs.Trigger value="roles"><Users size={15} /> Roles & permissions</Tabs.Trigger><Tabs.Trigger value="payments"><CreditCard size={15} /> Loan defaults</Tabs.Trigger></Tabs.List>
      <Tabs.Content value="company" className="settings-tab-content"><Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><Building2 size={18} /></div><div><h2>Company profile</h2><p>Business identity shown across customer records, authentication and receipts.</p></div></div><div className="company-logo-row"><div className="company-logo-mark">{logoDataUrl ? <img className="brand-logo-image" src={logoDataUrl} alt="Company logo preview" /> : <span className="brand-mark"><span /><span /><span /></span>}</div><div><strong>Logo and identity</strong><small>PNG, JPG or SVG · stored on the server (max 2 MB)</small></div><label className="lf-button lf-button-outline lf-button-sm">Change logo<input hidden type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be 2 MB or smaller.'); return }; const reader = new FileReader(); reader.onload = () => setLogoDataUrl(String(reader.result)); reader.readAsDataURL(file) }} /></label></div><div className="settings-form-grid"><Field label="Company name"><Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></Field><Field label="Brand tagline"><Input value={tagline} onChange={(event) => setTagline(event.target.value)} /></Field><Field label="Registration number"><Input value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} placeholder="e.g. UMRA registration" /></Field><Field label="Primary contact" hint="Choose a calling code and enter the local number."><PhoneNumberInput value={primaryContact} onChange={setPrimaryContact} /></Field><Field label="Support email"><Input type="email" value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} placeholder="support@example.com" /></Field><Field label="Country"><Input value={country} onChange={(event) => setCountry(event.target.value)} /></Field><Field label="Legal name"><Input value={legalName} onChange={(event) => setLegalName(event.target.value)} /></Field><Field label="Default currency"><Input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} /></Field><Field label="Address" className="field-span-2"><Input value={address} onChange={(event) => setAddress(event.target.value)} /></Field></div><div className="settings-panel-footer"><span><ShieldCheck size={14} /> Branding updates apply system-wide after saving.</span><Button icon={Save} loading={saving === 'Company profile'} onClick={() => save('Company profile')}>Save changes</Button></div></Card>
        <Card className="settings-panel settings-branch-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><Building2 size={18} /></div><div><h2>Branch defaults</h2><p>Select a default branch from branches configured in the system.</p></div></div><div className="settings-inline-row"><div><strong>Default operational branch</strong><small>Saved with tenant preferences.</small></div><Select value={defaultBranchId} onChange={(event) => setDefaultBranchId(event.target.value)}><option value="">No default branch</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.district}</option>)}</Select></div></Card></Tabs.Content>
      <Tabs.Content value="notifications" className="settings-tab-content"><Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><Mail size={18} /></div><div><h2>Notification preferences</h2><p>Choose which events staff see; preferences are saved to the server.</p></div></div><div className="notification-settings-list">{([{ key: 'appSubmitted', title: 'Application submitted', description: 'Alert the review team when a borrower request enters the queue.', icon: FileText }, { key: 'repaymentSoon', title: 'Upcoming repayment', description: 'Surface reminders ahead of a scheduled payment date.', icon: Smartphone }, { key: 'paymentReceived', title: 'Repayment received', description: 'Confirm recorded payment activity for the servicing team.', icon: Check }, { key: 'repaymentOverdue', title: 'Repayment overdue', description: 'Show a follow-up task when an installment becomes overdue.', icon: ShieldCheck }, { key: 'weeklySummary', title: 'Weekly portfolio summary', description: 'Prepare a weekly management digest for authorized staff.', icon: SlidersHorizontal }] as const).map(({ key, title, description, icon: Icon }) => <div className="notification-setting" key={key}><span className="notification-setting-icon"><Icon size={17} /></span><span className="notification-setting-copy"><strong>{title}</strong><small>{description}</small></span><button className={`toggle-switch ${toggles[key] ? 'toggle-on' : ''}`} role="switch" aria-checked={toggles[key]} onClick={() => toggle(key)} aria-label={`Toggle ${title}`}><span /></button></div>)}</div><div className="notification-future-note"><Mail size={15} /> SMS and email delivery requires provider configuration; preferences are stored now.</div><div className="settings-panel-footer"><span>Save to persist preferences for this tenant.</span><Button icon={Save} loading={saving === 'Notification preferences'} onClick={() => save('Notification preferences')}>Save preferences</Button></div></Card></Tabs.Content>
      <Tabs.Content value="roles" className="settings-tab-content">
        {!canViewRoles ? <Card className="settings-panel"><div className="access-warning"><LockKeyhole size={15} />You do not have permission to view role permissions (`identity.roles.view`). Ask a super admin.</div></Card> : <>
        <Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><LockKeyhole size={18} /></div><div><h2>Roles & permissions</h2><p>Super Admin is the overall system role and always has full access to everything all roles can do. Use this page to assign permissions per non-super-admin role. All system permissions are listed below; backend always enforces access.</p></div><div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>{canManageRoles && selected && !selected.locked && <Button icon={Save} loading={roleSaving} onClick={() => void saveSelectedRole()}>Save {selected.role}</Button>}</div></div>
          {roleLoading ? <div className="page-loading">Loading role permissions…</div> : <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,280px) 1fr', gap: 16, alignItems: 'start' }}>
            <div style={{ border: '1px solid #e8edf3', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: 12, borderBottom: '1px solid #eef2f6' }}><Input placeholder="Search permissions…" value={roleSearch} onChange={(e) => setRoleSearch(e.target.value)} /></div>
              {(roleCatalog?.roles ?? []).map((role) => <button key={role.normalizedRole} type="button" onClick={() => setSelectedRole(role.normalizedRole)} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', border: 0, borderBottom: '1px solid #f2f5f8', background: role.normalizedRole === selectedRole ? '#eef5ff' : '#fff', cursor: 'pointer' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="role-chip-dot" /><strong style={{ fontSize: 13, color: '#17365d' }}>{role.role}</strong>{role.locked && <span style={{ fontSize: 10, color: '#8a5a00', background: '#fff6d8', padding: '1px 6px', borderRadius: 99 }}>locked</span>}</div><small style={{ color: '#6c8098' }}>{roleSummary(role)}</small></button>)}
            </div>
            <div>
              {!selected ? <div className="table-empty"><p>Select a role.</p></div> : <>
                <div className="settings-inline-row" style={{ marginBottom: 12 }}><div><strong>{selected.role}</strong><small>{selected.locked ? 'Super Admin is the overall system role: it has full access to every system action, including all permissions assigned to other roles, and cannot be restricted.' : 'Toggle permissions for this role. Every system permission is listed; unchecked permissions are denied for users who only have this role.'}</small></div>{!selected.locked && canManageRoles && <div style={{ display: 'flex', gap: 8 }}><Button variant="outline" size="sm" onClick={() => setRolePerms(selected.normalizedRole, [...allCatalogPermissions])}>Grant all</Button><Button variant="outline" size="sm" onClick={() => setRolePerms(selected.normalizedRole, [])}>Clear all</Button></div>}</div>
                {selected.locked ? <div className="access-warning"><ShieldCheck size={15} />{selected.role} is the overall system role with unrestricted full access and cannot be restricted from this UI.</div> : filteredGroups.map((group) => {
                  const checked = group.permissions.filter((p) => selectedPermissions.includes(p)).length
                  return <div key={group.key} style={{ border: '1px solid #e8edf3', borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#f8fbff', cursor: canManageRoles ? 'pointer' : 'default' }}>
                      <input type="checkbox" checked={checked === group.permissions.length && group.permissions.length > 0} disabled={!canManageRoles} onChange={() => toggleGroup(selected.normalizedRole, group.permissions)} />
                      <strong style={{ fontSize: 13, color: '#17365d' }}>{group.label}</strong>
                      <small style={{ color: '#6c8098', marginLeft: 'auto' }}>{checked}/{group.permissions.length}</small>
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 0 }}>
                      {group.permissions.map((perm) => <label key={perm} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 12px', borderTop: '1px solid #f1f4f8', cursor: canManageRoles ? 'pointer' : 'default' }}><input type="checkbox" checked={selectedPermissions.includes(perm)} disabled={!canManageRoles} onChange={() => togglePerm(selected.normalizedRole, perm)} /><span><code style={{ fontSize: 11, color: '#234' }}>{perm}</code></span></label>)}
                    </div>
                  </div>
                })}
              </>}
            </div>
          </div>}
          <div className="access-warning" style={{ marginTop: 12 }}><LockKeyhole size={15} />Backend remains the authority (`requirePermission`). Super Admin is overall system access and is not restricted by role toggles. After saving other roles, affected users get updated permissions on next login or token refresh.</div>
        </Card>
        <Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><Users size={18} /></div><div><h2>Team members</h2><p>Staff assignment by branch and role (loaded from server). Assign roles in Staff & Users; configure each role's permissions here.</p></div></div><div className="staff-mini-list">{teamMembers.length ? teamMembers.slice(0, 8).map((person) => <div key={person.id}><Avatar name={person.name} size="sm" /><span><strong>{person.name}</strong><small>{person.role} · {person.branch}</small></span><span className="staff-mini-status">{person.status}</span></div>) : <div className="table-empty"><p>{loading ? 'Loading team members…' : 'No team members assigned yet.'}</p></div>}</div></Card>
        </>}
      </Tabs.Content>
      <Tabs.Content value="payments" className="settings-tab-content"><Card className="settings-panel"><div className="settings-panel-header"><div className="settings-panel-icon"><CreditCard size={18} /></div><div><h2>Loan & payment defaults</h2><p>Tenant preferences saved to the server; product terms remain configured per loan product.</p></div></div><div className="settings-form-grid"><Field label="Default currency"><Input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} /></Field><Field label="Default repayment frequency"><Select value={defaultFrequency} onChange={(event) => setDefaultFrequency(event.target.value)}><option>Daily</option><option>Weekly</option><option>Bi-weekly</option><option>Monthly</option></Select></Field><Field label="Receipt reference format"><Input value={receiptFormat} onChange={(event) => setReceiptFormat(event.target.value)} /></Field></div><div className="payment-channel-list"><strong>Enabled channels (manual recording)</strong><div><span><Check size={14} />MTN Mobile Money</span><span><Check size={14} />Airtel Money</span><span><Check size={14} />Bank transfer</span><span><Check size={14} />Cash</span></div></div><div className="notification-future-note"><Smartphone size={15} />Live mobile-money/bank/SMS/email integrations require provider setup; preferences are stored.</div><div className="settings-panel-footer"><span>Saved to tenant settings.</span><Button icon={Save} loading={saving === 'Loan defaults'} onClick={() => save('Loan defaults')}>Save defaults</Button></div></Card></Tabs.Content>
    </Tabs.Root>
  </div>
}
