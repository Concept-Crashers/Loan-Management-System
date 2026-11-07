import { format, parseISO } from 'date-fns'

const HIDE_AMOUNTS_KEY = 'lendflow:hide-amounts'
const HIDE_AMOUNTS_EVENT = 'lendflow:hide-amounts-change'

export function getHideAmounts(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(HIDE_AMOUNTS_KEY) === '1'
}

export function setHideAmounts(hidden: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(HIDE_AMOUNTS_KEY, hidden ? '1' : '0')
  window.dispatchEvent(new Event(HIDE_AMOUNTS_EVENT))
}

export function subscribeHideAmounts(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(HIDE_AMOUNTS_EVENT, onStoreChange)
  window.addEventListener('storage', onStoreChange)
  return () => {
    window.removeEventListener(HIDE_AMOUNTS_EVENT, onStoreChange)
    window.removeEventListener('storage', onStoreChange)
  }
}

export function formatUGX(value: number, compact = false) {
  if (getHideAmounts()) return '****'
  if (compact && Math.abs(value) >= 1_000_000) return `UGX ${(value / 1_000_000).toFixed(1)}m`
  if (compact && Math.abs(value) >= 100_000) return `UGX ${(value / 1_000).toFixed(0)}k`
  return `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(value)}`
}

export function formatDate(value: string, pattern = 'dd MMM yyyy') {
  if (!value || value === '—') return value || '—'
  try { return format(parseISO(value), pattern) } catch { return value }
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}
