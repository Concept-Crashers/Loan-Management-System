import { lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { OperationalPage } from '../components/OperationalPage'
import { RecordDetailPage } from '../components/RecordDetailPage'
import { QuickContactsButton } from '../components/QuickContactsButton'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { CustomerForm } from '../features/customers/CustomerForm'
import { ApplicationWizard } from '../features/loans/ApplicationWizard'
import { ProductForm } from '../features/loans/ProductForm'
import { DisbursementForm } from '../features/loans/DisbursementForm'
import { RepaymentForm } from '../features/repayments/RepaymentForm'
import { AuthPages } from '../features/management/AuthRouteFix'
import { pageRegistry } from './page-registry'
import { SettingsPage } from '../features/management/SettingsPage'
import { ProfileSecurityPage } from '../features/management/ProfileSecurityPage'
import { OperationsCenterPage } from '../features/management/OperationsCenterPage'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { EnterpriseOperationsPage } from '../features/management/EnterpriseOperationsPage'
import { AccountingPage } from '../features/management/AccountingPage'
import { AuditLogsPage } from '../features/management/AuditLogsPage'

const ReportsPage = lazy(() => import('../features/management/ReportsPage').then((module) => ({ default: module.ReportsPage })))

function WorkspaceLayout() { const location = useLocation(); return <AppShell><AnimatePresence mode="wait"><motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}><Outlet /></motion.div></AnimatePresence><QuickContactsButton /></AppShell> }
function PageForPath({ path }: { path: string }) {
  const definition = pageRegistry[path]
  return definition ? <OperationalPage definition={definition} path={path} /> : <NotFoundPage />
}
function NotFoundPage() { const location = useLocation(); return <div className="not-found-card"><span>404</span><h1>That page isn’t here</h1><p>No Trust Loans route matches <code>{location.pathname}</code>.</p><Link className="lf-button lf-button-primary lf-button-md" to="/">Return to dashboard</Link></div> }

export function App() {
  return <Routes>
    <Route path="/login" element={<AuthPages page="login" />} />
    <Route path="/forgot-password" element={<AuthPages page="forgot" />} />
    <Route element={<ProtectedRoute><WorkspaceLayout /></ProtectedRoute>}>
      <Route index element={<DashboardPage />} />
      <Route path="customers" element={<PageForPath path="/customers" />} />
      <Route path="customers/new" element={<CustomerForm />} />
      <Route path="customers/:id/edit" element={<CustomerForm mode="edit" />} />
      <Route path="customers/:id" element={<RecordDetailPage />} />
      <Route path="products" element={<PageForPath path="/products" />} />
      <Route path="products/new" element={<ProductForm />} />
      <Route path="products/:id/edit" element={<ProductForm />} />
      <Route path="products/:id" element={<RecordDetailPage />} />
      <Route path="applications" element={<PageForPath path="/applications" />} />
      <Route path="applications/new" element={<ApplicationWizard />} />
      <Route path="applications/:id" element={<RecordDetailPage />} />
      <Route path="approvals" element={<PageForPath path="/approvals" />} />
      <Route path="loans" element={<PageForPath path="/loans" />} />
      <Route path="loans/:id" element={<RecordDetailPage />} />
      <Route path="disbursements" element={<PageForPath path="/disbursements" />} />
      <Route path="disbursements/new" element={<DisbursementForm />} />
      <Route path="repayments" element={<PageForPath path="/repayments" />} />
      <Route path="repayments/new" element={<RepaymentForm />} />
      <Route path="repayments/:id" element={<RecordDetailPage />} />
      <Route path="schedules" element={<PageForPath path="/schedules" />} />
      <Route path="collections" element={<PageForPath path="/collections" />} />
      <Route path="transactions" element={<PageForPath path="/transactions" />} />
      <Route path="reports" element={<Suspense fallback={<div className="page-loading">Loading report workspace…</div>}><ReportsPage /></Suspense>} />
      <Route path="branches" element={<PageForPath path="/branches" />} />
      <Route path="branches/:id" element={<RecordDetailPage />} />
      <Route path="staff" element={<PageForPath path="/staff" />} />
      <Route path="audit-logs" element={<AuditLogsPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="profile-security" element={<ProfileSecurityPage />} />
      <Route path="documents" element={<OperationsCenterPage initialTab="documents" />} />
      <Route path="imports" element={<OperationsCenterPage initialTab="imports" />} />
      <Route path="activity" element={<OperationsCenterPage initialTab="activity" />} />
      <Route path="enterprise-operations" element={<EnterpriseOperationsPage />} />
      <Route path="accounting" element={<AccountingPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Routes>
}
