import { useEffect, useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { ArrowLeft, Banknote, CalendarDays, Check, Info, ShieldCheck, Wallet } from 'lucide-react'
import Swal from 'sweetalert2'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { LoanAccount } from '../../lib/types'
import { formatUGX } from '../../lib/format'
import { mockApi } from '../../lib/services'
import { Button, Card, Field, Input, Select, Textarea } from '../../components/ui/primitives'

const schema = z.object({
  loanRef: z.string().min(1, 'Choose an approved loan.'),
  amount: z.coerce.number().positive('Enter a positive amount.'),
  date: z.string().min(1, 'Select the disbursement date.'),
  method: z.enum(['Bank transfer', 'MTN Mobile Money', 'Airtel Money', 'Cash', 'Other']),
  reference: z.string().min(3, 'Enter the bank or transaction reference.'),
  notes: z.string().max(500, 'Keep notes under 500 characters.'),
})
type DisbursementInput = z.input<typeof schema>
type DisbursementValues = z.output<typeof schema>
export function DisbursementForm() {
  const navigate = useNavigate()
  const [isSaving, setIsSaving] = useState(false)
  const [loans, setLoans] = useState<LoanAccount[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const pendingLoans = loans.filter((loan) => loan.status === 'Pending Disbursement')
  useEffect(() => {
    mockApi.listLoans().then(setLoans).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Approved loans could not be loaded.'))
  }, [])
  const { register, control, handleSubmit, setError, formState: { errors } } = useForm<DisbursementInput, unknown, DisbursementValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      loanRef: '', amount: 0,
      date: new Date().toISOString().slice(0, 10), method: 'Bank transfer', reference: '', notes: '',
    },
  })
  const loanRef = String(useWatch({ control, name: 'loanRef' }) ?? '')
  const selectedLoan = pendingLoans.find((item) => item.ref === loanRef)

  async function submit(values: DisbursementValues) {
    const approvedLoan = pendingLoans.find((item) => item.ref === values.loanRef)
    if (!approvedLoan) { setError('loanRef', { message: 'This loan is not awaiting disbursement.' }); return }
    if (values.amount > approvedLoan.principal) { setError('amount', { message: 'The disbursement cannot exceed the approved principal in this demo.' }); return }
    const decision = await Swal.fire({
      title: 'Record this demo disbursement?',
      text: 'This local action is illustrative only. A production API must verify approval authority, approved terms, the payment transfer and its audit event.',
      icon: 'question', showCancelButton: true, confirmButtonText: 'Record demo disbursement', cancelButtonText: 'Review details', confirmButtonColor: '#2563eb',
    })
    if (!decision.isConfirmed) return
    setIsSaving(true)
    try {
      if (!approvedLoan.applicationId || !approvedLoan.branchId) throw new Error('This loan is missing its approval or branch linkage.')
      const result = await mockApi.recordDisbursement({ loanRef: values.loanRef, applicationId: approvedLoan.applicationId, branchId: approvedLoan.branchId, amount: values.amount, date: values.date, method: values.method, reference: values.reference })
      toast.success('Demo disbursement recorded', { description: `${result.account.ref} · ${formatUGX(values.amount)} · local sample state only` })
      navigate('/disbursements')
    } catch (error) {
      toast.error('Disbursement not recorded', { description: error instanceof Error ? error.message : 'Please try again.' })
    } finally {
      setIsSaving(false)
    }
  }

  return <div className="form-page"><div className="page-heading"><div><div className="eyebrow"><Link to="/disbursements"><ArrowLeft size={13} /> DISBURSEMENTS</Link><span className="eyebrow-separator">/</span> RECORD FUNDS RELEASE</div><h1>Record a disbursement</h1><p>Record a transfer against an approved loan after funds have actually been released.</p></div></div>{loadError && <div className="form-error" role="alert">{loadError}</div>}
    {!pendingLoans.length ? <Card className="disbursement-empty"><span><Check size={20} /></span><h2>No approved loans awaiting disbursement</h2><p>Only approved accounts in Pending Disbursement are available in this demo.</p><Button onClick={() => navigate('/disbursements')}>Back to disbursements</Button></Card> : <form className="registration-form disbursement-form" onSubmit={handleSubmit(submit)}>
      <Card className="form-section"><div className="form-section-heading"><span className="section-number">01</span><div><h2>Approved loan</h2><p>Choose the approved account whose funds have been released.</p></div></div><div className="form-section-body"><div className="form-grid"><Field label="Loan reference" required error={errors.loanRef?.message}><Select {...register('loanRef')}><option value="">Choose a loan</option>{pendingLoans.map((loan) => <option key={loan.ref} value={loan.ref}>{loan.ref} · {loan.customer}</option>)}</Select></Field><Field label="Disbursement date" required error={errors.date?.message}><Input type="date" {...register('date')} /></Field></div>{selectedLoan && <div className="disbursement-approved-summary"><span><Wallet size={16} /></span><div><small>APPROVED BORROWER</small><strong>{selectedLoan.customer}</strong><em>{selectedLoan.product} · {selectedLoan.ref}</em></div><div><small>APPROVED PRINCIPAL</small><strong>{formatUGX(selectedLoan.principal)}</strong></div></div>}</div></Card>
      <Card className="form-section"><div className="form-section-heading"><span className="section-number">02</span><div><h2>Transfer details</h2><p>Enter the amount and reference for funds actually disbursed to the borrower.</p></div></div><div className="form-section-body"><div className="form-grid"><Field label="Amount released (UGX)" required hint={selectedLoan ? `Must not exceed ${formatUGX(selectedLoan.principal)} approved principal.` : 'Select a loan first.'} error={errors.amount?.message}><Input type="number" min="1" step="1000" {...register('amount', { valueAsNumber: true })} /></Field><Field label="Disbursement method" required><Select {...register('method')}><option>Bank transfer</option><option>MTN Mobile Money</option><option>Airtel Money</option><option>Cash</option><option>Other</option></Select></Field><Field label="Transaction / bank reference" required hint="Do not enter PINs, passwords or secret credentials." error={errors.reference?.message}><Input placeholder="e.g. transfer reference" {...register('reference')} /></Field><Field label="Internal notes" hint="Optional operational context." error={errors.notes?.message}><Textarea rows={2} placeholder="Add a brief note for the local demo…" {...register('notes')} /></Field></div><div className="terms-disclaimer"><Info size={16} /><span>Approvals, actual transfers, posted balances, schedules and ledger entries must be verified and recorded by the backend; this demonstration changes only local sample data.</span></div></div></Card>
      <div className="form-footer"><span className="disbursement-safety"><ShieldCheck size={13} /> Record only after transfer confirmation.</span><div><Button type="button" variant="outline" onClick={() => navigate('/disbursements')}>Cancel</Button><Button type="submit" icon={Banknote} loading={isSaving}>Record demo disbursement</Button></div></div>
    </form>}
    <div className="dashboard-footnote"><CalendarDays size={13} />Financial records remain illustrative until the lending and payment services are connected.</div>
  </div>
}
