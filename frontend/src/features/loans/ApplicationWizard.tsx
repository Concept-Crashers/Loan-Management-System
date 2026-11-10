import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, FileText, Info, RefreshCw, Send, ShieldCheck, UploadCloud } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Avatar, Button, Card, Field, Input, SearchableSelect, Select, Textarea } from '../../components/ui/primitives'
import type { Customer, LoanProduct } from '../../lib/types'
import { formatUGX } from '../../lib/format'
import { api } from '../../lib/services'

const schema = z.object({
  branchId: z.string().min(1, 'Select the branch for this application.'),
  customerId: z.string().min(1, 'Choose a borrower.'), product: z.string().min(1, 'Choose a loan product.'),
  amount: z.coerce.number().min(100000, 'Enter at least UGX 100,000.'), duration: z.coerce.number().min(1, 'Choose a duration.'),
  frequency: z.string().min(1, 'Choose a repayment frequency.'), purpose: z.string().min(5, 'Add a short loan purpose.'),
  income: z.coerce.number().min(0), obligations: z.coerce.number().min(0), termsConfirmed: z.boolean().refine(Boolean, 'Confirm that the terms were disclosed.'),
})
type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>
const steps = [{ title: 'Borrower', caption: 'Select a customer' }, { title: 'Loan details', caption: 'Request & purpose' }, { title: 'Assessment', caption: 'Income & documents' }, { title: 'Review', caption: 'Terms disclosure' }]

export function ApplicationWizard() {
  const [step, setStep] = useState(0)
  const [files, setFiles] = useState<string[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<LoanProduct[]>([])
  const [branches, setBranches] = useState<Array<{ id: string; name: string; district: string }>>([])
  const [loadingRef, setLoadingRef] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { control, register, watch, trigger, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: { branchId: '', customerId: '', product: '', amount: 0, duration: 12, frequency: 'Daily', purpose: '', income: 0, obligations: 0, termsConfirmed: false } })
  const selectedId = watch('customerId'), selectedProduct = watch('product')
  const borrower = customers.find((person) => (person.recordId ?? person.id) === selectedId)
  const product = products.find((item) => (item.recordId ?? item.id) === selectedProduct)
  const amount = watch('amount')
  const stepFields: (keyof FormInput)[][] = [['branchId', 'customerId', 'product'], ['amount', 'duration', 'frequency', 'purpose'], ['income', 'obligations'], ['termsConfirmed']]
  const activeProducts = useMemo(() => products.filter((item) => item.active), [products])
  const customerOptions = useMemo(() => customers.map((p) => ({ value: p.recordId ?? p.id, label: `${p.name} · ${p.id}` })), [customers])
  const branchOptions = useMemo(() => branches.map((b) => ({ value: b.id, label: b.name })), [branches])
  const productOptions = useMemo(() => activeProducts.map((p) => ({ value: p.recordId ?? p.id, label: `${p.name} · ${formatUGX(p.minAmount)}–${formatUGX(p.maxAmount)} · ${p.duration} mo` })), [activeProducts])

  async function loadRefData() {
    setLoadingRef(true)
    setLoadError(null)
    const [cRes, pRes, bRes] = await Promise.allSettled([api.listCustomers(), api.listProducts(), api.listBranches()])
    if (cRes.status === 'fulfilled') setCustomers(cRes.value); else setLoadError(cRes.reason instanceof Error ? cRes.reason.message : 'Customers could not be loaded.')
    if (pRes.status === 'fulfilled') {
      setProducts(pRes.value)
      if (!pRes.value.length) setLoadError((e) => e ?? 'No loan products found. Create an active loan product first.')
      else if (!pRes.value.some((p) => p.active)) setLoadError((e) => e ?? 'No active loan products found. Activate or create a loan product, then reload.')
    } else {
      setLoadError((e) => e ?? (pRes.reason instanceof Error ? pRes.reason.message : 'Loan products could not be loaded.'))
      toast.error(pRes.reason instanceof Error ? pRes.reason.message : 'Failed to load loan products.')
    }
    if (bRes.status === 'fulfilled') setBranches((bRes.value ?? []).map((b: any) => ({ id: String(b.branchId ?? b.id ?? ''), name: String(b.name ?? ''), district: String(b.district ?? '') })))
    else setLoadError((e) => e ?? (bRes.reason instanceof Error ? bRes.reason.message : 'Branches could not be loaded.'))
    setLoadingRef(false)
  }

  useEffect(() => { void loadRefData() }, [])
  useEffect(() => {
    if (!product || !amount) return
    const amt = Number(amount)
    if (Number.isFinite(amt) && amt < (Number(product.minAmount) || 0)) setValue('amount', product.minAmount, { shouldValidate: true })
    if (Number.isFinite(amt) && product.maxAmount && amt > Number(product.maxAmount)) setValue('amount', product.maxAmount, { shouldValidate: true })
  }, [product?.id])

  async function nextStep() { const valid = await trigger(stepFields[step]); if (valid) setStep((value) => Math.min(3, value + 1)) }
  async function submit(values: FormValues) {
    try {
      const selected = products.find((item) => (item.recordId ?? item.id) === values.product)
      if (!selected) throw new Error('Selected loan product could not be resolved. Reload products and try again.')
      if (!selected.active) throw new Error('Selected loan product is not active. Choose an active product.')
      const record = await api.submitApplication({ branchId: values.branchId, customerId: values.customerId, productId: values.product, amount: values.amount, duration: values.duration, income: values.income, obligations: values.obligations, purpose: values.purpose })
      const ref = (record as any)?.id ?? (record as any)?._id ?? (record as any)?.applicationId ?? (record as any)?.data?.id ?? (record as any)?.data?._id
      toast.success('Application submitted for review', { description: ref ? `Reference ${String(ref)} · server decision pending` : 'Server decision pending' })
      navigate(ref ? `/applications/${encodeURIComponent(String(ref))}` : '/applications')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Application could not be submitted.')
    }
  }

  return <div className="form-page"><div className="page-heading"><div><div className="eyebrow"><Link to="/applications"><ChevronLeft size={14} /> APPLICATIONS</Link><span className="eyebrow-separator">/</span> NEW REQUEST</div><h1>New loan application</h1><p>Capture a request clearly before assessment begins.</p></div><span className="draft-status"><span /> Draft</span></div>{loadError && <div className="form-error" role="alert" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ flex: 1 }}>{loadError}</span><Button type="button" variant="outline" size="sm" icon={RefreshCw} onClick={() => void loadRefData()} loading={loadingRef}>Reload</Button></div>}
    <Card className="wizard-card"><div className="wizard-steps">{steps.map((item, index) => <div key={item.title} className={`wizard-step ${index === step ? 'wizard-step-current' : ''} ${index < step ? 'wizard-step-done' : ''}`}><span className="wizard-step-circle">{index < step ? <Check size={15} /> : `0${index + 1}`}</span><span><strong>{item.title}</strong><small>{item.caption}</small></span>{index < steps.length - 1 && <span className="wizard-step-line" />}</div>)}</div>
      <form onSubmit={handleSubmit(submit)} className="wizard-content">
        {step === 0 && <div className="wizard-panel"><div className="wizard-panel-head"><span className="step-icon"><Avatar name="LF" /></span><div><h2>Choose a borrower, branch and product</h2><p>Applications are linked to an existing customer record and assigned to a branch.</p></div></div><div className="form-grid"><Field label="Branch" required error={errors.branchId?.message} hint="The branch the application will be filed under."><Controller name="branchId" control={control} render={({ field }) => <SearchableSelect options={branchOptions} value={field.value} onChange={field.onChange} placeholder={loadingRef ? 'Loading branches…' : branchOptions.length ? 'Search and select a branch' : 'No branches available'} searchPlaceholder="Search branches" disabled={loadingRef || !branchOptions.length} />} /></Field><Field label="Customer" required error={errors.customerId?.message}><Controller name="customerId" control={control} render={({ field }) => <SearchableSelect options={customerOptions} value={field.value} onChange={field.onChange} placeholder={loadingRef ? 'Loading customers…' : 'Search and select a customer'} searchPlaceholder="Search customers" disabled={loadingRef} />} /></Field><Field label="Loan product" required error={errors.product?.message}><Controller name="product" control={control} render={({ field }) => <SearchableSelect options={productOptions} value={field.value} onChange={field.onChange} placeholder={loadingRef ? 'Loading loan products…' : productOptions.length ? 'Search and select a loan product' : 'No loan products available'} searchPlaceholder="Search loan products" disabled={loadingRef || !productOptions.length} />} /></Field></div>{borrower && <div className="selected-customer"><Avatar name={borrower.name} /><div className="selected-customer-copy"><strong>{borrower.name}</strong><span><span className="selected-customer-id">{borrower.id}</span><i className="selected-customer-sep" aria-hidden>·</i><span>{borrower.phone}</span></span></div><span className="selected-customer-location">{borrower.district}</span></div>}{product && <div className="product-selection-note"><Info size={15} /><span><strong>{product.name}</strong> · {formatUGX(product.minAmount)}–{formatUGX(product.maxAmount)} · {product.duration} months · rate/terms per configured product</span></div>}</div>}
        {step === 1 && <div className="wizard-panel"><div className="wizard-panel-head"><span className="step-icon step-icon-blue"><FileText size={18} /></span><div><h2>Request details</h2><p>Describe the customer’s request; terms remain subject to assessment.</p></div></div><div className="form-grid"><Field label="Requested amount (UGX)" required error={errors.amount?.message}><Input type="number" inputMode="numeric" min={product?.minAmount ?? 100000} max={product?.maxAmount} step="1" placeholder="e.g. 2500000" {...register('amount', { valueAsNumber: true })} /></Field>            <Field label="Requested duration (months)" required error={errors.duration?.message}><Select {...register('duration', { valueAsNumber: true })}>{[1, 2, 3, 4, 5, 6, 9, 12, 18, 24, 36].map((month) => <option value={month} key={month}>{month} {month === 1 ? 'month' : 'months'}</option>)}</Select></Field><Field label="Repayment frequency" required error={errors.frequency?.message}><Select {...register('frequency')}><option>Daily</option><option>Weekly</option><option>Bi-weekly</option><option>Monthly</option></Select></Field><Field label="Loan purpose" required className="field-span-2" error={errors.purpose?.message}><Textarea rows={3} placeholder="How will the requested amount be used?" {...register('purpose')} /></Field></div><div className="terms-disclaimer"><ShieldCheck size={17} /><span>Rates, fees and repayment dates are calculated from configured product terms after assessment. Daily collections are supported for legacy field operations; this request is not an approval.</span></div></div>}
        {step === 2 && <div className="wizard-panel"><div className="wizard-panel-head"><span className="step-icon step-icon-green"><ShieldCheck size={18} /></span><div><h2>Assessment information</h2><p>Capture income and current obligations for review by an authorized officer.</p></div></div><div className="form-grid"><Field label="Monthly income (UGX)" required error={errors.income?.message}><Input type="number" min="0" step="1" inputMode="numeric" placeholder="0" {...register('income', { valueAsNumber: true })} /></Field><Field label="Existing monthly obligations (UGX)" required error={errors.obligations?.message}><Input type="number" min="0" step="1" inputMode="numeric" placeholder="0" {...register('obligations', { valueAsNumber: true })} /></Field></div><div className="upload-area document-dropzone"><input id="application-documents" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setFiles(Array.from(event.target.files ?? []).map((file) => file.name))} /><label htmlFor="application-documents"><UploadCloud size={24} /><strong>Choose files to upload</strong><span>PDF, JPG or PNG · Max 10 MB per file</span></label>{files.length > 0 && <div className="uploaded-file-list document-file-list">{files.map((file) => <span key={file}><FileText size={14} />{file}</span>)}</div>}</div><div className="privacy-inline"><ShieldCheck size={14} />Only authorized staff should access financial and identification documents.</div></div>}
        {step === 3 && <div className="wizard-panel"><div className="wizard-panel-head"><span className="step-icon step-icon-violet"><Check size={18} /></span><div><h2>Review before submission</h2><p>Check the request and confirm that the terms disclosure was discussed.</p></div></div><div className="application-review-summary"><div className="review-summary-top"><Avatar name={borrower?.name ?? 'Borrower'} /><div className="review-summary-customer"><strong>{borrower?.name ?? 'Borrower not selected'}</strong><small><span className="review-customer-id">{borrower?.id ?? 'Customer reference'}</span>{borrower?.phone ? <><i className="review-customer-sep" aria-hidden>·</i><span>{borrower.phone}</span></> : null}</small></div><span className="review-product">{product?.name ?? 'Loan product'}</span></div><div className="review-summary-grid"><div><small>Branch</small><strong>{watch('branchId') ? (branches.find((b) => b.id === watch('branchId'))?.name ?? watch('branchId')) : '—'}</strong></div><div><small>Requested amount</small><strong>{formatUGX(Number(amount) || 0)}</strong></div><div><small>Duration</small><strong>{Number(watch('duration'))} months</strong></div><div><small>Frequency</small><strong>{watch('frequency')}</strong></div><div><small>Purpose</small><strong>{watch('purpose') || '—'}</strong></div><div><small>Monthly income</small><strong>{formatUGX(Number(watch('income')) || 0)}</strong></div><div><small>Existing obligations</small><strong>{formatUGX(Number(watch('obligations')) || 0)}</strong></div></div><div className="review-note"><Info size={15} /><span>This request is not approved. The backend will validate eligibility, calculate all financial terms, and return the proposed schedule.</span></div></div><label className="terms-checkbox"><input type="checkbox" {...register('termsConfirmed')} /><span className="custom-check"><Check size={13} /></span><span>I confirm the applicant has been shown clear product terms, fees and repayment obligations.</span></label>{errors.termsConfirmed?.message && <span className="lf-field-error">{String(errors.termsConfirmed.message)}</span>}</div>}
        <div className="wizard-footer"><div className="wizard-page-count">Step {step + 1} of 4 <span>·</span> {steps[step].title}</div><div className="wizard-actions">{step > 0 && <Button type="button" variant="outline" icon={ChevronLeft} onClick={() => setStep((value) => value - 1)}>Back</Button>}{step < 3 ? <Button type="button" icon={ChevronRight} onClick={() => void nextStep()}>Continue</Button> : <Button type="button" icon={Send} loading={isSubmitting} onClick={() => void handleSubmit(submit)()}>Submit for review</Button>}</div></div>
      </form></Card>
  </div>
}
