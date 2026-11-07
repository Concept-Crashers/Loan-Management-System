import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Banknote, Info, ReceiptText, ShieldCheck, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Select, Textarea } from '../../components/ui/primitives'
import type { Customer, LoanAccount, Repayment } from '../../lib/types'
import { formatUGX } from '../../lib/format'
import { api } from '../../lib/services'

const schema = z.object({
  customerId: z.string().min(1, 'Choose a customer.'),
  loan: z.string().min(1, 'Choose an active loan.'),
  amount: z.coerce.number().min(1, 'Enter a payment amount.'),
  method: z.enum(['MTN Mobile Money', 'Airtel Money', 'Bank transfer', 'Cash', 'Other']),
  reference: z.string().trim(),
  date: z.string().min(1, 'Choose the date received.'),
  notes: z.string(),
}).superRefine((value, ctx) => {
  if (value.method !== 'Cash' && value.reference.length < 3) ctx.addIssue({ code: 'custom', path: ['reference'], message: 'Enter the transaction/reference number for this payment channel.' })
})
type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>
const CASH_REF = () => `CASH-RCT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

export function RepaymentForm() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loans, setLoans] = useState<LoanAccount[]>([])
  const [repayments, setRepayments] = useState<Repayment[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const { register, watch, handleSubmit, setValue, setError, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: { customerId: '', loan: '', amount: '', method: 'MTN Mobile Money', reference: '', date: new Date().toISOString().slice(0, 10), notes: '' } })
  const selectedCustomer = watch('customerId')
  const method = watch('method')
  const isCash = method === 'Cash'
  const availableLoans = useMemo(() => {
    if (!selectedCustomer) return []
    const customer = customers.find((c) => c.id === selectedCustomer || c.recordId === selectedCustomer)
    const ids = new Set([selectedCustomer, customer?.id, customer?.recordId].filter(Boolean).map(String))
    return loans.filter((item) => ['Active', 'Overdue', 'In Arrears', 'in_arrears'].includes(String(item.status)) && [item.customerId, (item as any).customer?._id, (item as any).customerRecordId].filter(Boolean).some((v) => ids.has(String(v))))
  }, [selectedCustomer, customers, loans])
  const amount = Number(watch('amount') ?? 0)
  useEffect(() => {
    Promise.all([api.listCustomers(), api.listLoans(), api.listRepayments()])
      .then(([loadedCustomers, loadedLoans, loadedRepayments]) => { setCustomers(loadedCustomers); setLoans(loadedLoans); setRepayments(loadedRepayments) })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Repayment reference data could not be loaded.'))
  }, [])

  async function submit(values: FormValues) {
    try {
      const selectedLoan = loans.find((item) => item.ref === values.loan || (item as any).id === values.loan)
      if (!selectedLoan) { setError('loan', { type: 'validate', message: 'Choose an active or overdue loan.' }); return }
      if (values.amount > selectedLoan.outstanding) { setError('amount', { type: 'validate', message: `Payments cannot exceed the outstanding balance of ${formatUGX(selectedLoan.outstanding)}.` }); return }
      const reference = values.method === 'Cash' ? (values.reference.trim() || CASH_REF()) : values.reference.trim()
      const duplicate = repayments.find((item) => item.reference?.trim().toLowerCase() === reference.toLowerCase())
      if (duplicate && values.method !== 'Cash') {
        const result = await Swal.fire({ title: 'Possible duplicate reference', text: `This reference appears on ${duplicate.id}. Confirm only after checking the source transaction.`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Continue for review', confirmButtonColor: '#d97706', cancelButtonText: 'Review entry' })
        if (!result.isConfirmed) return
      }
      const loanAccountId = (selectedLoan as any).id || values.loan
      const record = await api.recordRepayment({ loanAccountId, amount: values.amount, method: values.method, reference })
      toast.success('Payment recorded', { description: `${formatUGX(values.amount)} via ${values.method}. Ref: ${reference}` })
      window.open(`/api/v1/finance/payments/${encodeURIComponent(String((record as any)?._id || (record as any)?.id || ''))}/receipt`, '_blank')
      navigate(`/repayments/${(record as any)?._id || (record as any)?.id || ''}`)
    } catch (error) { setError('root', { message: error instanceof Error ? error.message : 'Repayment could not be recorded.' }) }
  }

  return <div className="form-page"><div className="page-heading"><div><div className="eyebrow"><Link to="/repayments"><ArrowLeft size={13} /> REPAYMENTS</Link><span className="eyebrow-separator">/</span> DAILY COLLECTION / PAYMENT</div><h1>Record a repayment</h1><p>Capture daily collections and other payments, link them to the correct loan, and prepare a clear receipt for the borrower.</p></div></div>{loadError && <div className="form-error" role="alert">{loadError}</div>}
    <form onSubmit={handleSubmit(submit)} className="repayment-form-layout"><div className="repayment-form-main"><Card className="form-section"><div className="form-section-heading"><span className="section-number">01</span><div><h2>Payment details</h2><p>Link the payment to the correct borrower and active loan.</p></div></div><div className="form-section-body"><div className="form-grid">
            <Field label="Customer" required error={errors.customerId?.message}><Select {...register('customerId')}><option value="">Search customer...</option>{customers.map((person) => <option key={person.recordId || person.id} value={person.recordId || person.id}>{person.name} · {person.id}</option>)}</Select></Field>
            <Field label="Active loan" required error={errors.loan?.message} hint={selectedCustomer && !availableLoans.length ? 'No active/overdue loan found for this customer. Loans must be active/disbursed before repayments can be recorded.' : undefined}>
              <Select {...register('loan')} disabled={!selectedCustomer}>
                <option value="">{selectedCustomer ? (availableLoans.length ? 'Choose an active loan…' : 'No active loan available') : 'Select customer first'}</option>
                {availableLoans.map((item) => <option key={(item as any).id || item.ref} value={(item as any).id || item.ref}>{item.ref} · {item.product} · Outstanding {formatUGX(item.outstanding)}</option>)}
              </Select>
            </Field>
            <Field label="Amount received (UGX)" required error={errors.amount?.message}><Input type="number" min="1" step="1" inputMode="numeric" placeholder="e.g. 250,000" {...register('amount')} /></Field>
            <Field label="Payment channel" required><Select {...register('method', { onChange: (e) => { if (e.target.value === 'Cash') setValue('reference', '', { shouldValidate: true }) } })}><option>MTN Mobile Money</option><option>Airtel Money</option><option>Bank transfer</option><option>Cash</option><option>Other</option></Select></Field>
            {!isCash ? <Field label="Transaction reference" required hint="Enter the mobile money, bank, or external transaction reference." error={errors.reference?.message}><Input placeholder="e.g. MP260304.1814.A4102" {...register('reference')} /></Field> : <div className="form-hint" style={{ gridColumn: '1 / -1' }}><strong>Cash selected:</strong> no external transaction reference is required. The system will generate a cash receipt reference for the receipt and audit record.</div>}
            <Field label="Payment date" required error={errors.date?.message}><Input type="date" {...register('date')} /></Field>
            <Field label="Notes" className="field-span-2"><Textarea rows={3} placeholder="Optional notes for the receipt and audit record" {...register('notes')} /></Field>
          </div><div className="terms-disclaimer"><ShieldCheck size={17} /><span>The backend validates authorization, payment allocation, and the resulting balance. Cash receipts receive a system-generated reference.</span></div></div></Card>
      <Card className="payment-allocation-card"><div className="payment-allocation-header"><span><Banknote size={17} /></span><div><h2>Payment allocation</h2><p>Illustrative preview only · authoritative allocation and receipt reference come from the lending service. Supports daily partial collections.</p></div></div><div className="allocation-line"><span>Principal</span><strong>Calculated by API</strong></div><div className="allocation-line"><span>Interest</span><strong>Calculated by API</strong></div><div className="allocation-line"><span>Permitted fees</span><strong>Calculated by API</strong></div><div className="allocation-total"><span>Amount entered</span><strong>{formatUGX(Number.isFinite(amount) ? amount : 0)}</strong></div></Card>
      </div><aside className="repayment-side"><Card className="receipt-preview"><div className="receipt-preview-head"><span className="receipt-icon"><ReceiptText size={18} /></span><div><h2>Receipt preview</h2><p>Available after recording</p></div></div><div className="receipt-skeleton"><div className="receipt-demo-brand">Trust Loans <span>PAYMENT RECEIPT</span></div><div className="receipt-divider" /><span className="receipt-placeholder-label">Customer</span><div className="receipt-placeholder-line" /><span className="receipt-placeholder-label">Amount</span><div className="receipt-amount-placeholder">{formatUGX(Number.isFinite(amount) ? amount : 0)}</div><span className="receipt-placeholder-label">Transaction ref</span><div className="receipt-placeholder-line short" /><div className="receipt-stamp">PREVIEW</div></div><div className="receipt-note"><Info size={14} />Receipt numbers and financial records are issued by the backend in production.</div></Card><div className="privacy-inline repayment-privacy"><ShieldCheck size={15} /><span>Handle customer payment data only through authorized staff and approved channels.</span></div></aside>
      <div className="form-footer"><span>Payment remains pending until server confirmation.</span><div><Button type="button" variant="outline" icon={X} onClick={() => navigate('/repayments')}>Cancel</Button><Button type="submit" icon={ReceiptText} loading={isSubmitting}>Record payment</Button></div></div>
    </form>
  </div>
}
