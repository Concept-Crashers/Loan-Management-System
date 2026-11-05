import { ForgotPasswordPage, LoginPage } from './AuthPages'

export function AuthPages({ page }: { page: 'login' | 'forgot' }) {
  return page === 'login' ? <LoginPage /> : <ForgotPasswordPage />
}
