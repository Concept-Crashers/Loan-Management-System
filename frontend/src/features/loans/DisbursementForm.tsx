import { useEffect, useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { ArrowLeft, Banknote, CalendarDays, Check, Info, ShieldCheck, Wallet } from 'lucide-react'
import Swal from 'sweetalert2'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import type { LoanAccount } from '../../lib/types'
import { formatUGX } from '../../lib/format'
import { api } from '../../lib/services'
import { Button, Card, Field, Input, Select, Textarea } from '../../components/ui/primitives'

const schema = z.object({
  loanRef: z.string().min(1, 'Choose an approved loan.'),
  amount: z.coerce.number().positive('Enter a positive amount.'),
  date: z.string().min(1, 'Select the disbursement date.'),
  method: z.enum(['Bank transfer', 'MTN Mobile Money', 'Airtel Money', 'Cash', 'Other']),
  reference: z.string().trim(),
  idempotencyKey: z.string().min(8, 'Idempotency key is required to prevent duplicate disbursements.'),
  notes: z.string().max(500, 'Keep notes under 500 characters.'),
  mode: z.enum(['authorize', 'release']),
}).superRefine((value, ctx) => {
  if (value.method !== 'Cash' && value.reference.length < 3) ctx.addIssue({ code: 'custom', path: ['reference'], message: 'Enter the bank/transaction reference for this disbursement method.' })
})
const CASH_DISB_REF = () => `CASH-DISB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
type DisbursementInput = z.input<typeof schema>
type DisbursementValues = z.output<typeof schema>
export function DisbursementForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialMode = searchParams.get('mode') === 'authorize' ? 'authorize' : 'release'
  const [isSaving, setIsSaving] = useState(false)
  const [loans, setLoans] = useState<LoanAccount[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const pendingLoans = loans.filter((loan) => loan.status === 'Pending Disbursement')
  const { register, control, handleSubmit, setError, setValue, formState: { errors } } = useForm<DisbursementInput, unknown, DisbursementValues>({
    resolver: zodResolver(schema),
    defaultValues: { loanRef: '', amount: 0, date: new Date().toISOString().slice(0, 10), method: 'Bank transfer', reference: '', notes: '', idempotencyKey: `disb-${Date.now()}`, mode: initialMode },
  })
  useEffect(() => {
    api.listLoans().then((rows) => {
      setLoans(rows)
      const pre = searchParams.get('loan')
      const match = rows.find((l) => (l.ref === pre || (l as any).id === pre) && l.status === 'Pending Disbursement')
      if (match) setValue('loanRef', match.ref)
    }).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Approved loans could not be loaded.'))
  }, [searchParams, setValue])
  const loanRef = String(useWatch({ control, name: 'loanRef' }) ?? '')
  const method = String(useWatch({ control, name: 'method' }) ?? 'Bank transfer')
  const mode = String(useWatch({ control, name: 'mode' }) ?? 'release')
  const isCash = method === 'Cash'
  const selectedLoan = pendingLoans.find((item) => item.ref === loanRef)

  async function submit(values: DisbursementValues) {
    const approvedLoan = pendingLoans.find((item) => item.ref === values.loanRef)
    if (!approvedLoan) { setError('loanRef', { message: 'This loan is not awaiting disbursement.' }); return }
    if (values.amount > approvedLoan.principal) { setError('amount', { message: 'The disbursement cannot exceed the approved principal amount.' }); return }
    const confirmText = values.mode === 'authorize'
      ? `Authorize ${formatUGX(values.amount)} via ${values.method}? Funds are not released until execution.`
      : `Authorize and release ${formatUGX(values.amount)} via ${values.method}?`
    const decision = await Swal.fire({ title: values.mode === 'authorize' ? 'Authorize disbursement' : 'Authorize and release funds', text: confirmText, icon: 'question', showCancelButton: true, confirmButtonText: values.mode === 'authorize' ? 'Authorize' : 'Authorize and release', cancelButtonText: 'Cancel', confirmButtonColor: '#2563eb' })
    if (!decision.isConfirmed) return
    setIsSaving(true)
    try {
      if (!approvedLoan.applicationId || !approvedLoan.branchId) throw new Error('This loan is missing its approval or branch linkage.')
      const reference = values.method === 'Cash' ? (values.reference.trim() || CASH_DISB_REF()) : values.reference.trim()
      const payload = { loanAccountId: (approvedLoan as any).id ?? values.loanRef, applicationId: approvedLoan.applicationId, branchId: approvedLoan.branchId, amount: values.amount, method: values.method, reference, notes: values.notes, idempotencyKey: values.idempotencyKey }
      const auth = await api.authorizeDisbursement(payload)
      if (values.mode === 'release') {
        const authId = (auth as any)?._id ?? (auth as any)?.id ?? (auth as any)?.data?._id ?? (auth as any)?.data?.id
        if (authId) await api.executeDisbursement(String(authId))
      }
      toast.success(values.mode === 'authorize' ? 'Disbursement authorized' : 'Disbursement authorized and released', { description: `${values.loanRef} · ${formatUGX(values.amount)} · Ref: ${reference}` })
      navigate('/disbursements')
    } catch (error) {
      toast.error('Disbursement not recorded', { description: error instanceof Error ? error.message : 'Please try again.' })
    } finally {
      setIsSaving(false)
    }
  }

  return <div className="form-page"><div className="page-heading"><div><div className="eyebrow"><Link to="/disbursements"><ArrowLeft size={13} /> DISBURSEMENTS</Link><span className="eyebrow-separator">/</span> {mode === 'authorize' ? 'AUTHORIZE' : 'AUTHORIZE & RELEASE'}</div><h1>{mode === 'authorize' ? 'Authorize a disbursement' : 'Authorize and release funds'}</h1><p>Capture method and idempotency. External references are required only for non-cash methods; cash receives a system-generated reference. Authorized disbursements can be executed later from the disbursements table.</p></div></div>{loadError && <div className="form-error" role="alert">{loadError}</div>}
    {!pendingLoans.length ? <Card className="disbursement-empty"><span><Check size={20} /></span><h2>No approved loans awaiting disbursement</h2><p>Approved accounts will appear here when returned by the lending service.</p><Button onClick={() => navigate('/disbursements')}>Back to disbursements</Button></Card> : <form className="registration-form disbursement-form" onSubmit={handleSubmit(submit)}>
      <Card className="form-section"><div className="form-section-heading"><span className="section-number">01</span><div><h2>Workflow and approved loan</h2><p>Choose whether to authorize only or authorize and execute immediately.</p></div></div><div className="form-section-body"><div className="form-grid"><Field label="Workflow" required><Select {...register('mode')}><option value="authorize">Authorize only (execute later)</option><option value="release">Authorize and release now</option></Select></Field><Field label="Loan reference" required error={errors.loanRef?.message}><Select {...register('loanRef')}><option value="">Choose a loan</option>{pendingLoans.map((loan) => <option key={loan.ref} value={loan.ref}>{loan.ref} · {loan.customer}</option>)}</Select></Field><Field label="Disbursement date" required error={errors.date?.message}><Input type="date" {...register('date')} /></Field></div>{selectedLoan && <div className="disbursement-approved-summary"><span><Wallet size={16} /></span><div><small>APPROVED BORROWER</small><strong>{selectedLoan.customer}</strong><em>{selectedLoan.product} · {selectedLoan.ref}</em></div><div><small>APPROVED PRINCIPAL</small><strong>{formatUGX(selectedLoan.principal)}</strong></div></div>}</div></Card>
      <Card className="form-section"><div className="form-section-heading"><span className="section-number">02</span><div><h2>Transfer details</h2><p>Method, notes, and idempotency are stored and audited. Cash releases do not require an external transaction reference.</p></div></div><div className="form-section-body"><div className="form-grid"><Field label="Amount released (UGX)" required hint={selectedLoan ? `Must not exceed ${formatUGX(selectedLoan.principal)} approved principal.` : 'Select a loan first.'} error={errors.amount?.message}><Input type="number" min="1" step="1" inputMode="numeric" {...register('amount', { valueAsNumber: true })} /></Field><Field label="Disbursement method" required><Select {...register('method', { onChange: (e) => { if (e.target.value === 'Cash') setValue('reference', '', { shouldValidate: true }) } })}><option>Bank transfer</option><option>MTN Mobile Money</option><option>Airtel Money</option><option>Cash</option><option>Other</option></Select></Field>{!isCash ? <Field label="Transaction / bank reference" required hint="Do not enter PINs, passwords or secret credentials." error={errors.reference?.message}><Input placeholder="e.g. transfer reference" {...register('reference')} /></Field> : <div className="form-hint" style={{ gridColumn: '1 / -1' }}><strong>Cash selected:</strong> no external transaction/bank reference is required. The system will generate a cash reference for the disbursement record and receipt.</div>}<Field label="Idempotency key" required hint="Prevents duplicate authorize/execute requests if you retry." error={errors.idempotencyKey?.message}><Input placeholder="e.g. disb-unique-key" {...register('idempotencyKey')} /></Field><Field label="Internal notes" hint="Optional operational context." error={errors.notes?.message} className="field-span-2"><Textarea rows={2} placeholder="Add a brief operational note…" {...register('notes')} /></Field></div><div className="terms-disclaimer"><Info size={16} /><span>Authorization and execution are backend-verified and audited. Cash disbursements receive a system-generated reference.</span></div></div></Card>
      <div className="form-footer"><span className="disbursement-safety"><ShieldCheck size={13} /> {mode === 'authorize' ? 'Authorization does not release funds.' : 'Record release only after transfer confirmation.'}</span><div><Button type="button" variant="outline" onClick={() => navigate('/disbursements')}>Cancel</Button><Button type="submit" icon={Banknote} loading={isSaving}>{mode === 'authorize' ? 'Authorize disbursement' : 'Authorize and release'}</Button></div></div>
    </form>}
    <div className="dashboard-footnote"><CalendarDays size={13} />Financial records remain illustrative until the lending and payment services are connected.</div>
  </div>
}
