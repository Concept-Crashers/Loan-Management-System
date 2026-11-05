import { format, parseISO } from 'date-fns'

export function formatUGX(value: number, compact = false) {
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
