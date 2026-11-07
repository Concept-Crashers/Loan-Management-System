import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, Phone, Search, Users, X } from 'lucide-react'
import { useSelector } from 'react-redux'
import { api } from '../lib/services'
import { formatUGX } from '../lib/format'
import type { Customer, LoanAccount } from '../lib/types'
import type { RootState } from '../store/store'

const WHATSAPP_DISPLAY = '+256 746314927'

function sanitizePhone(raw: string) {
  const digits = String(raw || '').replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  const n = digits.replace(/\D/g, '')
  if (n.startsWith('2560')) return `+256${n.slice(4)}`
  if (n.startsWith('256')) return `+${n}`
  if (n.startsWith('0')) return `+256${n.slice(1)}`
  if (n.length === 9) return `+256${n}`
  return n ? `+${n}` : ''
}

function reminderMessage(name: string, balance: number, loans: LoanAccount[]) {
  const due = loans.find((l) => l.nextDue && !/pending/i.test(String(l.nextDue)))?.nextDue
  const ref = loans[0]?.ref
  const salutation = name?.trim() ? `Dear ${name.trim()},` : 'Dear valued customer,'
  return [
    salutation,
    '',
    `This is a formal payment reminder from Trust Loans regarding your loan account${ref ? ` (${ref})` : ''}.`,
    `Current outstanding balance: UGX ${formatUGX(balance).replace(/^UGX\s*/i, '')}.`,
    due ? `Next scheduled payment date: ${due}.` : 'Kindly arrange your next payment at your earliest convenience.',
    '',
    'If you have already made this payment, please disregard this message. Should you need clarification or wish to discuss a payment arrangement, you may reply to this WhatsApp message or contact our office for assistance.',
    '',
    'Yours faithfully,',
    'Trust Loans',
    `Customer Support | ${WHATSAPP_DISPLAY}`,
  ].join('\n')
}

export function QuickContactsButton() {
  const roles = useSelector((s: RootState) => s.session.user?.roles ?? [])
  const permissions = useSelector((s: RootState) => s.session.user?.permissions ?? [])
  const isPrivileged = roles.some((r) => ['super_admin', 'super-admin', 'superadmin', 'admin'].includes(String(r).toLowerCase().replace(/[\s-]+/g, '_'))) || permissions.includes('*') || permissions.includes('customers.view')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loans, setLoans] = useState<LoanAccount[]>([])

  useEffect(() => {
    if (!open || customers.length) return
    setLoading(true); setError(null)
    Promise.all([api.listCustomers(), api.listLoans()])
      .then(([c, l]) => { setCustomers(c); setLoans(l) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Customer balances could not be loaded.'))
      .finally(() => setLoading(false))
  }, [open, customers.length])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const rows = useMemo(() => {
    const balanceByIds = new Map<string, { balance: number; activeLoans: LoanAccount[] }>()
    for (const loan of loans) {
      const outstanding = Number(loan.outstanding ?? 0)
      const isActive = ['Active', 'Overdue', 'In Arrears', 'Pending Disbursement', 'in_arrears'].includes(String(loan.status))
      if (!isActive && outstanding <= 0) continue
      const ids = [loan.customerId, (loan as any).customer?._id, (loan as any).customerRecordId].filter(Boolean).map(String)
      ids.forEach((id) => {
        const cur = balanceByIds.get(id) ?? { balance: 0, activeLoans: [] }
        cur.balance += Math.max(0, outstanding)
        cur.activeLoans.push(loan)
        balanceByIds.set(id, cur)
      })
    }
    return customers.map((c) => {
      const hit = [c.recordId, c.id].filter(Boolean).map(String).map((id) => balanceByIds.get(id)).find(Boolean)
      return { customer: c, balance: Number(c.outstanding ?? hit?.balance ?? 0), activeLoans: hit?.activeLoans ?? [] }
    }).sort((a, b) => b.balance - a.balance)
  }, [customers, loans])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(({ customer, balance }) => [customer.name, customer.id, customer.recordId, customer.phone, customer.email, customer.district, String(balance)].some((v) => String(v ?? '').toLowerCase().includes(s)))
  }, [rows, q])

  useEffect(() => { if (filtered.length && !filtered.some((r) => String(r.customer.recordId || r.customer.id) === selectedId)) setSelectedId(String(filtered[0].customer.recordId || filtered[0].customer.id)) }, [filtered, selectedId])

  if (!isPrivileged || typeof document === 'undefined') return null
  return createPortal(<>
    <button type="button" className="quick-contacts-fab" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Close customer quick contacts' : 'Open customer quick contacts'} title="Customer balances & quick contact">
      {open ? <X size={20} /> : <Users size={20} />}
    </button>
    {open && <div className="quick-contacts-panel" role="dialog" aria-label="Customer balances and quick contacts">
      <div className="quick-contacts-head">
        <div><strong>Customer balances</strong><small>Select a customer, then use Call or WhatsApp</small></div>
        <button type="button" className="quick-contacts-close" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
      </div>
      <div className="quick-contacts-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone, ID, balance..." autoFocus /></div>
      <div className="quick-contacts-list">
        {loading && <div className="quick-contacts-state">Loading customers and balances…</div>}
        {error && <div className="quick-contacts-state quick-contacts-error">{error}</div>}
        {!loading && !error && !filtered.length && <div className="quick-contacts-state">No matching customers.</div>}
        {!loading && !error && filtered.map(({ customer, balance, activeLoans }) => {
          const id = String(customer.recordId || customer.id)
          const selected = id === selectedId
          const phone = sanitizePhone(customer.phone)
          const tel = phone.replace(/\s+/g, '')
          const waText = encodeURIComponent(reminderMessage(customer.name, balance, activeLoans))
          return <div key={id} className={`quick-contact-row ${selected ? 'is-selected' : ''}`} role="button" tabIndex={0} onClick={() => setSelectedId(id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(id) } }}>
            <div className="quick-contact-main">
              <strong>{customer.name || 'Customer'}</strong>
              <small>{customer.phone || 'No phone number'}</small>
              <span className={`quick-contact-balance ${balance > 0 ? 'has-balance' : ''}`}>Balance: {formatUGX(balance)}</span>
            </div>
            {selected ? <div className="quick-contact-actions" onClick={(e) => e.stopPropagation()}>
              <a className={`quick-contact-btn ${tel ? '' : 'is-disabled'}`} href={tel ? `tel:${tel}` : undefined} aria-disabled={!tel} title={tel ? `Call ${phone}` : 'No phone number'} onClick={(e) => !tel && e.preventDefault()}><Phone size={15} /> Call</a>
              <a className={`quick-contact-btn whatsapp ${phone ? '' : 'is-disabled'}`} href={phone ? `https://wa.me/${phone.replace(/^\+/, '')}?text=${waText}` : undefined} target="_blank" rel="noreferrer" aria-disabled={!phone} title={phone ? `WhatsApp ${phone}` : 'No phone number'} onClick={(e) => !phone && e.preventDefault()}><MessageCircle size={15} /> WhatsApp</a>
            </div> : <div className="quick-contact-icons" aria-hidden><Phone size={15} /><MessageCircle size={15} /></div>}
          </div>
        })}
      </div>
      <div className="quick-contacts-foot">WhatsApp opens a formal, professional balance reminder to the selected customer. Business contact: <strong>{WHATSAPP_DISPLAY}</strong>.</div>
    </div>}
  </>, document.body)
}
