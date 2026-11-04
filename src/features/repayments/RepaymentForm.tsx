import { useMemo } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Banknote, Info, ReceiptText, ShieldCheck } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Select, Textarea } from '../../components/ui/primitives'
import { customers, loans, repayments } from '../../data/mock-data'
import { formatUGX } from '../../lib/format'
import { mockApi } from '../../lib/services'

const schema = z.object({ customerId: z.string().min(1, 'Choose a customer.'), loan: z.string().min(1, 'Choose an active loan.'), amount: z.coerce.number().min(1, 'Enter a payment amount.'), method: z.enum(['MTN Mobile Money', 'Airtel Money', 'Bank transfer', 'Cash', 'Other']), reference: z.string().min(3, 'Enter a transaction reference or cash receipt note.'), date: z.string().min(1, 'Choose the date received.'), notes: z.string() })
type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>

export function RepaymentForm() {
  const navigate = useNavigate()
  const { register, watch, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: { customerId: '', loan: '', amount: '', method: 'MTN Mobile Money', reference: '', date: new Date().toISOString().slice(0, 10), notes: '' } })
  const selectedCustomer = watch('customerId')
  const availableLoans = useMemo(() => loans.filter((item) => item.customerId === selectedCustomer && ['Active', 'Overdue'].includes(item.status)), [selectedCustomer])
  const amount = Number(watch('amount') ?? 0)

  async function submit(values: FormValues) {
    const selectedLoan = loans.find((item) => item.ref === values.loan)
    if (!selectedLoan) { setError('loan', { type: 'validate', message: 'Choose an active or overdue sample loan.' }); return }
    if (values.amount > selectedLoan.outstanding) { setError('amount', { type: 'validate', message: `Demo payments cannot exceed the sample outstanding balance of ${formatUGX(selectedLoan.outstanding)}.` }); return }
    const normalizedReference = values.reference.trim().toLowerCase()
    const duplicate = repayments.find((item) => item.reference.trim().toLowerCase() === normalizedReference)
    if (duplicate) {
      const result = await Swal.fire({ title: 'Possible duplicate reference', text: `This reference appears on ${duplicate.id}. Confirm only after checking the source transaction.`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Continue for review', confirmButtonColor: '#d97706', cancelButtonText: 'Review entry' })
      if (!result.isConfirmed) return
    }
    const customer = customers.find((item) => item.id === values.customerId)
    const record = await mockApi.recordRepayment({ customer: customer?.name, customerId: values.customerId, loan: values.loan, amount: values.amount, method: values.method, reference: values.reference.trim(), date: values.date, status: duplicate ? 'Pending review' : 'Successful' })
    toast.success('Payment recorded in demo workspace', { description: `${record.id} · ${formatUGX(record.amount)}` })
    navigate(`/repayments/${record.id}`)
  }

  return <div className="form-page"><div className="page-heading"><div><div className="eyebrow"><Link to="/repayments"><ArrowLeft size={13} /> REPAYMENTS</Link><span className="eyebrow-separator">/</span> NEW PAYMENT</div><h1>Record a repayment</h1><p>Capture the transaction details and prepare a clear receipt for the borrower.</p></div></div>
    <form onSubmit={handleSubmit(submit)} className="repayment-form-layout"><div className="repayment-form-main"><Card className="form-section"><div className="form-section-heading"><span className="section-number">01</span><div><h2>Payment details</h2><p>Link the payment to the correct borrower and active loan.</p></div></div><div className="form-section-body"><div className="form-grid"><Field label="Customer" required error={errors.customerId?.message}><Select {...register('customerId')}><option value="">Search customer...</option>{customers.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.id}</option>)}</Select></Field><Field label="Active loan" required error={errors.loan?.message}><Select {...register('loan')}><option value="">Select customer first</option>{availableLoans.map((item) => <option key={item.ref} value={item.ref}>{item.ref} · {item.product}</option>)}</Select></Field><Field label="Amount received (UGX)" required error={errors.amount?.message}><Input type="number" min="1" step="1000" placeholder="e.g. 250,000" {...register('amount')} /></Field><Field label="Payment channel" required><Select {...register('method')}><option>MTN Mobile Money</option><option>Airtel Money</option><option>Bank transfer</option><option>Cash</option><option>Other</option></Select></Field><Field label="Transaction reference" required hint="For cash, enter the manual receipt or till reference." error={errors.reference?.message}><Input placeholder="e.g. MP260304.1814.A4102" {...register('reference')} /></Field><Field label="Payment date" required error={errors.date?.message}><Input type="date" {...register('date')} /></Field><Field label="Notes" className="field-span-2"><Textarea rows={3} placeholder="Optional notes for the receipt and audit record" {...register('notes')} /></Field></div><div className="terms-disclaimer"><ShieldCheck size={17} /><span>The backend will validate duplicate references, authorization, payment allocation and the resulting balance.</span></div></div></Card>
      <Card className="payment-allocation-card"><div className="payment-allocation-header"><span><Banknote size={17} /></span><div><h2>Payment allocation</h2><p>Illustrative preview only · authoritative allocation comes from the lending service.</p></div></div><div className="allocation-line"><span>Principal</span><strong>Calculated by API</strong></div><div className="allocation-line"><span>Interest</span><strong>Calculated by API</strong></div><div className="allocation-line"><span>Permitted fees</span><strong>Calculated by API</strong></div><div className="allocation-total"><span>Amount entered</span><strong>{formatUGX(Number.isFinite(amount) ? amount : 0)}</strong></div></Card>
      </div><aside className="repayment-side"><Card className="receipt-preview"><div className="receipt-preview-head"><span className="receipt-icon"><ReceiptText size={18} /></span><div><h2>Receipt preview</h2><p>Available after recording</p></div></div><div className="receipt-skeleton"><div className="receipt-demo-brand">LendFlow <span>PAYMENT RECEIPT</span></div><div className="receipt-divider" /><span className="receipt-placeholder-label">Customer</span><div className="receipt-placeholder-line" /><span className="receipt-placeholder-label">Amount</span><div className="receipt-amount-placeholder">{formatUGX(Number.isFinite(amount) ? amount : 0)}</div><span className="receipt-placeholder-label">Transaction ref</span><div className="receipt-placeholder-line short" /><div className="receipt-stamp">PREVIEW</div></div><div className="receipt-note"><Info size={14} />Receipt numbers and financial records are issued by the backend in production.</div></Card><div className="privacy-inline repayment-privacy"><ShieldCheck size={15} /><span>Handle customer payment data only through authorized staff and approved channels.</span></div></aside>
      <div className="form-footer"><span>Demo entry only — no funds are moved or settled.</span><div><Button type="button" variant="outline" onClick={() => navigate('/repayments')}>Cancel</Button><Button type="submit" icon={ReceiptText} disabled={isSubmitting}>{isSubmitting ? 'Recording…' : 'Record payment'}</Button></div></div>
    </form>
  </div>
}
