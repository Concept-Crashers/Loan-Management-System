import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Bell, BookOpen, Building2, Check, ChevronDown, CircleHelp, Command, CreditCard, FileText, History, LayoutDashboard, Menu, Moon, PanelLeftClose, Plus, Search, ShieldCheck, Sun, UploadCloud, Users, Wallet, X, Settings2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { closeSidebar, setUser, toggleSidebar, toggleTheme, type RootState } from '../store/store'
import { Avatar } from './ui/primitives'
import { toast } from 'sonner'
import { logout } from '../lib/api'
import { api } from '../lib/services'
import type { Customer, LoanAccount } from '../lib/types'

interface NavItem { label: string; to: string; icon: LucideIcon; badge?: string; permission?: string }
const groups: { label: string; items: NavItem[] }[] = [
  { label: 'WORKSPACE', items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard }] },
  { label: 'CUSTOMER MANAGEMENT', items: [{ label: 'Customers', to: '/customers', icon: Users, permission: 'customers.view' }, { label: 'Register customer', to: '/customers/new', icon: Plus, permission: 'customers.create' }] },
  { label: 'LOAN OPERATIONS', items: [{ label: 'Loan products', to: '/products', icon: CreditCard, permission: 'loans.products.view' }, { label: 'Applications', to: '/applications', icon: Command, permission: 'loans.applications.view' }, { label: 'Approvals', to: '/approvals', icon: ShieldCheck, permission: 'loans.applications.approve' }, { label: 'Active loans', to: '/loans', icon: Wallet, permission: 'loans.accounts.view' }, { label: 'Repayment schedules', to: '/schedules', icon: PanelLeftClose, permission: 'loans.accounts.view' }] },
  { label: 'FINANCIAL OPERATIONS', items: [{ label: 'Disbursements', to: '/disbursements', icon: Building2, permission: 'loans.disburse.execute' }, { label: 'Repayments', to: '/repayments', icon: Wallet, permission: 'repayments.capture' }, { label: 'Transactions', to: '/transactions', icon: CreditCard, permission: 'accounting.journal.view' }, { label: 'Collections', to: '/collections', icon: Bell, permission: 'collections.view' }] },
  { label: 'MANAGEMENT', items: [{ label: 'Reports', to: '/reports', icon: LayoutDashboard, permission: 'reports.view' }, { label: 'Accounting', to: '/accounting', icon: BookOpen, permission: 'accounting.journal.view' }, { label: 'Documents', to: '/documents', icon: FileText, permission: 'customers.view' }, { label: 'Bulk imports', to: '/imports', icon: UploadCloud, permission: 'customers.create' }, { label: 'Activity centre', to: '/activity', icon: History, permission: 'audit.view' }, { label: 'Enterprise operations', to: '/enterprise-operations', icon: Settings2, permission: 'accounting.journal.view' }, { label: 'Branches', to: '/branches', icon: Building2, permission: 'branches.view' }, { label: 'Staff & users', to: '/staff', icon: Users, permission: 'identity.users.view' }, { label: 'Audit logs', to: '/audit-logs', icon: ShieldCheck, permission: 'audit.view' }, { label: 'Settings', to: '/settings', icon: CircleHelp, permission: 'organisation.settings.view' }] },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const dispatch = useDispatch()
  const sidebarOpen = useSelector((state: RootState) => state.session.sidebarOpen)
  const role = useSelector((state: RootState) => state.session.role)
  const currentUser = useSelector((state: RootState) => state.session.user)
  const theme = useSelector((state: RootState) => state.session.theme)
  const branding = useSelector((state: RootState) => state.branding)
  const permissions = useSelector((state: RootState) => state.session.user?.permissions ?? [])
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const [searchCustomers, setSearchCustomers] = useState<Customer[]>([])
  const [searchLoans, setSearchLoans] = useState<LoanAccount[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('lendflow-theme', theme)
  }, [theme])

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        requestAnimationFrame(() => searchInputRef.current?.focus())
      }
    }
    window.addEventListener('keydown', handleSearchShortcut)
    return () => window.removeEventListener('keydown', handleSearchShortcut)
  }, [])

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (searchOpen && !searchCustomers.length && !searchLoans.length) {
      void Promise.all([
        api.listCustomers().catch(() => []),
        api.listLoans().catch(() => []),
      ]).then(([c, l]) => {
        setSearchCustomers(c)
        setSearchLoans(l)
      })
    }
  }, [searchOpen, searchCustomers.length, searchLoans.length])

  const results = useMemo(() => {
    if (query.trim().length < 2) return []
    const q = query.toLowerCase()
    return [
      ...searchCustomers.filter((person) => [person.name, person.id, person.phone, person.email, person.district].some((field) => String(field ?? '').toLowerCase().includes(q))).slice(0, 4).map((person) => ({ title: person.name, meta: `Customer · ${person.id} · ${person.phone}`, path: `/customers/${encodeURIComponent(person.id)}` })),
      ...searchLoans.filter((loan) => [loan.ref, loan.customer, loan.customerId, loan.product].some((field) => String(field ?? '').toLowerCase().includes(q))).slice(0, 3).map((loan) => ({ title: loan.ref, meta: `Loan · ${loan.customer} · ${loan.product}`, path: `/loans/${encodeURIComponent(loan.ref)}` })),
    ].slice(0, 6)
  }, [query, searchCustomers, searchLoans])

  const current = groups.flatMap((group) => group.items).find((item) => item.to === location.pathname || (item.to !== '/' && location.pathname.startsWith(item.to)))
  const canSee = (item: NavItem) => !item.permission || permissions.includes(item.permission) || permissions.includes('*')

  function selectResult(path: string) { navigate(path); setQuery(''); setSearchOpen(false) }

  const displayName = currentUser?.name || 'Staff User'
  const displayRole = role || currentUser?.roles?.[0] || 'User'

  return (
    <div className="app-frame">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          {branding.logoDataUrl ? <img className="brand-logo-image" src={branding.logoDataUrl} alt="" /> : <div className="brand-mark"><span /><span /><span /></div>}
          <div className="brand-copy"><strong>{branding.companyName}</strong><small>{branding.tagline}</small></div>
          <button className="mobile-close" onClick={() => dispatch(closeSidebar())} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="branch-switcher">
          <span className="branch-avatar"><Building2 size={15} /></span>
          <span><strong>Branch Operations</strong><small>Active branch</small></span>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {groups.map((group) => {
            const visibleItems = group.items.filter(canSee)
            return visibleItems.length ? (
              <div className="nav-group" key={group.label}>
                <button className="nav-group-label nav-group-toggle" onClick={() => setCollapsedGroups((cur) => ({ ...cur, [group.label]: !cur[group.label] }))} aria-expanded={!collapsedGroups[group.label]}>
                  {group.label}<ChevronDown size={11} />
                </button>
                {!collapsedGroups[group.label] && visibleItems.map(({ label, to, icon: Icon, badge }) => (
                  <NavLink key={to} to={to} end={to === '/'} onClick={() => dispatch(closeSidebar())} className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
                    <Icon size={17} strokeWidth={1.8} />
                    <span>{label}</span>
                    {badge && <span className="nav-badge">{badge}</span>}
                  </NavLink>
                ))}
              </div>
            ) : null
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-version">
            <span className={`online-dot ${online ? '' : 'offline-dot'}`} />
            {online ? 'Connected' : 'Offline'}
          </div>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => dispatch(closeSidebar())} aria-label="Close navigation" />}
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => dispatch(toggleSidebar())} aria-label="Open menu"><Menu size={20} /></button>
            {location.pathname !== '/' && (
              <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{current?.label ?? 'Overview'}</strong></div>
            )}
          </div>
          <div className="topbar-right">
            <div className="global-search-wrap">
              <Search size={16} className="search-icon" />
              <input ref={searchInputRef} value={query} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true) }} onFocus={() => setSearchOpen(true)} onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false); if (event.key === 'Enter' && results[0]) selectResult(results[0].path) }} placeholder="Search customers or loans..." aria-label="Search customers and loans" />
              <kbd>⌘ K</kbd>
              {searchOpen && query.length >= 2 && (
                <div className="search-results">
                  {results.length ? results.map((result) => (
                    <button key={result.path} onMouseDown={() => selectResult(result.path)}>
                      <span className="search-result-icon"><Search size={15} /></span>
                      <span><strong>{result.title}</strong><small>{result.meta}</small></span>
                      <span className="search-enter">↵</span>
                    </button>
                  )) : <p>No matching records found.</p>}
                </div>
              )}
            </div>
            <button className="topbar-icon-button" onClick={() => dispatch(toggleTheme())} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="topbar-icon-button" aria-label="Notifications"><Bell size={18} /></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="notification-menu dropdown-content" align="end" sideOffset={8}>
                  <div className="notification-menu-head">
                    <span><strong>Notifications</strong></span>
                    <button onClick={() => toast.success('Notifications up to date')}><Check size={14} /> Mark read</button>
                  </div>
                  <DropdownMenu.Separator className="dropdown-separator" />
                  <DropdownMenu.Item className="notification-view-all" onSelect={() => navigate('/audit-logs')}>
                    View audit activity <span>→</span>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <span className="topbar-divider" />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="profile-trigger">
                  <Avatar name={displayName} size="sm" />
                  <span className="profile-meta"><strong>{displayName}</strong><small>{displayRole}</small></span>
                  <ChevronDown size={14} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="dropdown-content" align="end" sideOffset={8}>
                  <div className="dropdown-label">{displayName} ({displayRole})</div>
                  <DropdownMenu.Separator className="dropdown-separator" />
                  <DropdownMenu.Item className="dropdown-item" onSelect={() => navigate('/profile-security')}>Profile & security</DropdownMenu.Item>
                  <DropdownMenu.Item className="dropdown-item" onSelect={() => navigate('/settings')}>Workspace settings</DropdownMenu.Item>
                  <DropdownMenu.Item className="dropdown-item dropdown-danger" onSelect={() => { void logout().finally(() => { dispatch(setUser(null)); navigate('/login', { replace: true }) }) }}>Sign out</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>
        <main className="workspace-content container-fluid" onClick={() => searchOpen && setSearchOpen(false)}>{children}</main>
        <footer className="app-footer"><span>© 2026 {branding.companyName}</span><span>{branding.country} · {branding.currency}</span></footer>
      </div>
    </div>
  )
}
