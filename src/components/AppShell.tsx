import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Bell, Building2, Check, ChevronDown, CircleHelp, Command, CreditCard, FileText, History, LayoutDashboard, Menu, Moon, PanelLeftClose, Plus, Search, ShieldCheck, Sun, UploadCloud, Users, Wallet, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { closeSidebar, setRole, setUser, toggleSidebar, toggleTheme, type RootState } from '../store/store'
import { customers, loans } from '../data/mock-data'
import { Avatar } from './ui/primitives'
import { toast } from 'sonner'
import { logout } from '../lib/api'

interface NavItem { label: string; to: string; icon: LucideIcon; badge?: string }
const groups: { label: string; items: NavItem[] }[] = [
  { label: 'WORKSPACE', items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard }] },
  { label: 'CUSTOMER MANAGEMENT', items: [{ label: 'Customers', to: '/customers', icon: Users }, { label: 'Register customer', to: '/customers/new', icon: Plus }] },
  { label: 'LOAN OPERATIONS', items: [{ label: 'Loan products', to: '/products', icon: CreditCard }, { label: 'Applications', to: '/applications', icon: Command, badge: '5' }, { label: 'Approvals', to: '/approvals', icon: ShieldCheck, badge: '3' }, { label: 'Active loans', to: '/loans', icon: Wallet }, { label: 'Repayment schedules', to: '/schedules', icon: PanelLeftClose }] },
  { label: 'FINANCIAL OPERATIONS', items: [{ label: 'Disbursements', to: '/disbursements', icon: Building2 }, { label: 'Repayments', to: '/repayments', icon: Wallet }, { label: 'Transactions', to: '/transactions', icon: CreditCard }, { label: 'Collections', to: '/collections', icon: Bell, badge: '2' }] },
  { label: 'MANAGEMENT', items: [{ label: 'Reports', to: '/reports', icon: LayoutDashboard }, { label: 'Documents', to: '/documents', icon: FileText }, { label: 'Bulk imports', to: '/imports', icon: UploadCloud }, { label: 'Activity centre', to: '/activity', icon: History }, { label: 'Branches', to: '/branches', icon: Building2 }, { label: 'Staff & users', to: '/staff', icon: Users }, { label: 'Audit logs', to: '/audit-logs', icon: ShieldCheck }, { label: 'Settings', to: '/settings', icon: CircleHelp }] },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const dispatch = useDispatch()
  const sidebarOpen = useSelector((state: RootState) => state.session.sidebarOpen)
  const role = useSelector((state: RootState) => state.session.role)
  const theme = useSelector((state: RootState) => state.session.theme)
  const branding = useSelector((state: RootState) => state.branding)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
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
  const results = useMemo(() => {
    if (query.trim().length < 2) return []
    const q = query.toLowerCase()
    return [
      ...customers.filter((person) => person.name.toLowerCase().includes(q) || person.id.toLowerCase().includes(q)).slice(0, 4).map((person) => ({ title: person.name, meta: `Customer · ${person.id}`, path: `/customers/${person.id}` })),
      ...loans.filter((loan) => loan.ref.toLowerCase().includes(q) || loan.customer.toLowerCase().includes(q)).slice(0, 3).map((loan) => ({ title: loan.ref, meta: `Loan · ${loan.customer}`, path: `/loans/${loan.ref}` })),
    ].slice(0, 6)
  }, [query])
  const current = groups.flatMap((group) => group.items).find((item) => item.to === location.pathname || (item.to !== '/' && location.pathname.startsWith(item.to)))

  function selectResult(path: string) { navigate(path); setQuery(''); setSearchOpen(false) }

  return <div className="app-frame">
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="brand-lockup">{branding.logoDataUrl ? <img className="brand-logo-image" src={branding.logoDataUrl} alt="" /> : <div className="brand-mark"><span /><span /><span /></div>}<div className="brand-copy"><strong>{branding.companyName}</strong><small>{branding.tagline}</small></div><button className="mobile-close" onClick={() => dispatch(closeSidebar())} aria-label="Close menu"><X size={18} /></button></div>
      <div className="branch-switcher"><span className="branch-avatar"><Building2 size={15} /></span><span><strong>Kampala Central</strong><small>Primary branch</small></span><ChevronDown size={14} className="branch-chevron" /></div>
      <nav className="sidebar-nav" aria-label="Main navigation">{groups.map((group) => <div className="nav-group" key={group.label}><button className="nav-group-label nav-group-toggle" onClick={() => setCollapsedGroups((current) => ({ ...current, [group.label]: !current[group.label] }))} aria-expanded={!collapsedGroups[group.label]}>{group.label}<ChevronDown size={11} /></button>{!collapsedGroups[group.label] && group.items.map(({ label, to, icon: Icon, badge }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => dispatch(closeSidebar())} className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{badge && <span className="nav-badge">{badge}</span>}</NavLink>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon"><CircleHelp size={17} /></span><strong>Need a hand?</strong><p>Explore the getting started guide.</p><button onClick={() => toast.info('Help centre will connect in a future release.')}>Open help centre <span>→</span></button></div><div className="sidebar-version"><span className="online-dot" /> {branding.companyName} <span className="version-pill">MVP</span></div></div>
    </aside>
    {sidebarOpen && <button className="sidebar-scrim" onClick={() => dispatch(closeSidebar())} aria-label="Close navigation" />}
    <div className="main-column">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => dispatch(toggleSidebar())} aria-label="Open menu"><Menu size={20} /></button>{location.pathname !== '/' && <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{current?.label ?? 'Overview'}</strong></div>}</div>
        <div className="topbar-right"><div className="global-search-wrap"><Search size={16} className="search-icon" /><input ref={searchInputRef} value={query} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true) }} onFocus={() => setSearchOpen(true)} onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false); if (event.key === 'Enter' && results[0]) selectResult(results[0].path) }} placeholder="Search anything..." aria-label="Search customers and loans" /><kbd>⌘ K</kbd>{searchOpen && query.length >= 2 && <div className="search-results">{results.length ? results.map((result) => <button key={result.path} onMouseDown={() => selectResult(result.path)}><span className="search-result-icon"><Search size={15} /></span><span><strong>{result.title}</strong><small>{result.meta}</small></span><span className="search-enter">↵</span></button>) : <p>No matching records found.</p>}</div>}</div>
          <button className="topbar-icon-button" onClick={() => dispatch(toggleTheme())} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>          <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="topbar-icon-button" aria-label="Notifications"><Bell size={18} /><span className="notification-dot" /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="notification-menu dropdown-content" align="end" sideOffset={8}><div className="notification-menu-head"><span><strong>Notifications</strong><small>3 items need attention</small></span><button onClick={() => toast.success('Notifications marked as read')}><Check size={14} /> Mark read</button></div><DropdownMenu.Separator className="dropdown-separator" /><DropdownMenu.Item className="notification-item"><span className="notification-item-dot notification-item-warning" /><span><strong>3 applications await review</strong><small>Approvals · 18 minutes ago</small></span></DropdownMenu.Item><DropdownMenu.Item className="notification-item"><span className="notification-item-dot notification-item-danger" /><span><strong>Repayment overdue</strong><small>Collections · Today</small></span></DropdownMenu.Item><DropdownMenu.Item className="notification-item"><span className="notification-item-dot notification-item-info" /><span><strong>Weekly portfolio summary ready</strong><small>Reports · Yesterday</small></span></DropdownMenu.Item><DropdownMenu.Separator className="dropdown-separator" /><DropdownMenu.Item className="notification-view-all" onSelect={() => navigate('/audit-logs')}>View activity centre <span>→</span></DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root><span className="topbar-divider" />
          <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="profile-trigger"><Avatar name="Sarah Kiconco" size="sm" /><span className="profile-meta"><strong>Sarah Kiconco</strong><small>{role}</small></span><ChevronDown size={14} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" align="end" sideOffset={8}><div className="dropdown-label">DEMO ROLE</div>{['Manager', 'Loan Officer', 'Approver', 'Cashier', 'Collections Officer'].map((item) => <DropdownMenu.Item key={item} className="dropdown-item" onSelect={() => { dispatch(setRole(item)); toast.success(`Demo role switched to ${item}`) }}>{item}{role === item && <span>✓</span>}</DropdownMenu.Item>)}<DropdownMenu.Separator className="dropdown-separator" /><DropdownMenu.Item className="dropdown-item" onSelect={() => navigate('/profile-security')}>Profile & security</DropdownMenu.Item><DropdownMenu.Item className="dropdown-item" onSelect={() => navigate('/settings')}>Workspace settings</DropdownMenu.Item><DropdownMenu.Item className="dropdown-item dropdown-danger"           onSelect={() => { void logout().finally(() => { dispatch(setUser(null)); navigate('/login', { replace: true }) }) }}>Sign out</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
        </div>
      </header>
      <main className="workspace-content container-fluid" onClick={() => searchOpen && setSearchOpen(false)}>{children}</main>
      <footer className="app-footer"><span>© 2026 LendFlow · Demo workspace</span><span>Uganda · UGX <span className="footer-separator">·</span> <button onClick={() => toast.info('This frontend demo is not connected to a lending backend.')}>Frontend preview</button></span></footer>
    </div>
  </div>
}
