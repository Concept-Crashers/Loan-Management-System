import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, FileText, Info, ShieldCheck, UploadCloud } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Avatar, Button, Card, Field, Input, Select, Textarea } from '../../components/ui/primitives'
import type { Customer, LoanProduct } from '../../lib/types'
import { formatUGX } from '../../lib/format'
import { mockApi } from '../../lib/services'

const schema = z.object({
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { register, watch, trigger, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: { customerId: '', product: '', amount: 0, duration: 12, frequency: 'Monthly', purpose: '', income: 0, obligations: 0, termsConfirmed: false } })
  const selectedId = watch('customerId'), selectedProduct = watch('product')
  const borrower = customers.find((person) => person.id === selectedId)
  const product = products.find((item) => item.id === selectedProduct)
  const amount = watch('amount')
  const stepFields: (keyof FormInput)[][] = [['customerId', 'product'], ['amount', 'duration', 'frequency', 'purpose'], ['income', 'obligations'], ['termsConfirmed']]

  useEffect(() => {
    Promise.all([mockApi.listCustomers(), mockApi.listProducts()])
      .then(([loadedCustomers, loadedProducts]) => { setCustomers(loadedCustomers); setProducts(loadedProducts) })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Reference data could not be loaded.'))
  }, [])

  async function nextStep() { const valid = await trigger(stepFields[step]); if (valid) setStep((value) => Math.min(3, value + 1)) }
  async function submit(values: FormValues) {
    if (!product) throw new Error('Choose an active loan product.')
    const record = await mockApi.submitApplication({ customerId: values.customerId, productId: values.product, amount: values.amount, duration: values.duration, income: values.income, obligations: values.obligations, purpose: values.purpose })
    toast.success('Application submitted for review', { description: `Reference ${record.id} · server decision pending` })
    navigate(`/applications/${record.id}`)
  }

  return <div className="form-page"><div className="page-heading"><div><div className="eyebrow"><Link to="/applications"><ChevronLeft size={14} /> APPLICATIONS</Link><span className="eyebrow-separator">/</span> NEW REQUEST</div><h1>New loan application</h1><p>Capture a request clearly before assessment begins.</p></div><span className="draft-status"><span /> Draft</span></div>{loadError && <div className="form-error" role="alert">{loadError}</div>}
    <Card className="wizard-card"><div className="wizard-steps">{steps.map((item, index) => <div key={item.title} className={`wizard-step ${index === step ? 'wizard-step-current' : ''} ${index < step ? 'wizard-step-done' : ''}`}><span className="wizard-step-circle">{index < step ? <Check size={15} /> : `0${index + 1}`}</span><span><strong>{item.title}</strong><small>{item.caption}</small></span>{index < steps.length - 1 && <span className="wizard-step-line" />}</div>)}</div>
      <form onSubmit={handleSubmit(submit)} className="wizard-content">
        {step === 0 && <div className="wizard-panel"><div className="wizard-panel-head"><span className="step-icon"><Avatar name="LF" /></span><div><h2>Choose a borrower and product</h2><p>Applications are linked to an existing customer record.</p></div></div><div className="form-grid"><Field label="Customer" required error={errors.customerId?.message}><Select {...register('customerId')}><option value="">Search and select a customer</option>{customers.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.id}</option>)}</Select></Field><Field label="Loan product" required error={errors.product?.message}><Select {...register('product')}><option value="">Choose a configured product</option>{products.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field></div>{borrower && <div className="selected-customer"><Avatar name={borrower.name} /><div><strong>{borrower.name}</strong><span>{borrower.id} <i>·</i> {borrower.phone}</span></div><span className="selected-customer-location">{borrower.district}</span></div>}{product && <div className="product-selection-note"><Info size={15} /><span><strong>{product.name}</strong> · {formatUGX(product.minAmount)}–{formatUGX(product.maxAmount)} · {product.duration} months · rate/terms per configured product</span></div>}</div>}
        {step === 1 && <div className="wizard-panel"><div className="wizard-panel-head"><span className="step-icon step-icon-blue"><FileText size={18} /></span><div><h2>Request details</h2><p>Describe the customer’s request; terms remain subject to assessment.</p></div></div><div className="form-grid"><Field label="Requested amount (UGX)" required error={errors.amount?.message}><Input type="number" min={product?.minAmount ?? 100000} max={product?.maxAmount} step="50000" placeholder="e.g. 2,500,000" {...register('amount', { valueAsNumber: true })} /></Field><Field label="Requested duration" required error={errors.duration?.message}><Select {...register('duration', { valueAsNumber: true })}>{[3, 6, 9, 12, 18, 24].map((month) => <option value={month} key={month}>{month} months</option>)}</Select></Field><Field label="Repayment frequency" required error={errors.frequency?.message}><Select {...register('frequency')}><option>Monthly</option><option>Weekly</option><option>Bi-weekly</option></Select></Field><Field label="Loan purpose" required className="field-span-2" error={errors.purpose?.message}><Textarea rows={3} placeholder="How will the requested amount be used?" {...register('purpose')} /></Field></div><div className="terms-disclaimer"><ShieldCheck size={17} /><span>Rates, fees and repayment dates are calculated from configured product terms after assessment — this request is not an approval.</span></div></div>}
        {step === 2 && <div className="wizard-panel"><div className="wizard-panel-head"><span className="step-icon step-icon-green"><ShieldCheck size={18} /></span><div><h2>Assessment information</h2><p>Capture income and current obligations for review by an authorized officer.</p></div></div><div className="form-grid"><Field label="Monthly income (UGX)" required error={errors.income?.message}><Input type="number" min="0" step="10000" placeholder="0" {...register('income', { valueAsNumber: true })} /></Field><Field label="Existing monthly obligations (UGX)" required error={errors.obligations?.message}><Input type="number" min="0" step="10000" placeholder="0" {...register('obligations', { valueAsNumber: true })} /></Field></div><div className="upload-area upload-area-compact"><input id="application-documents" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setFiles(Array.from(event.target.files ?? []).map((file) => file.name))} /><label htmlFor="application-documents"><UploadCloud size={18} /><strong>Attach supporting documents</strong><span>PDF, JPG or PNG · files stay in this local demo</span></label>{files.length > 0 && <div className="uploaded-file-list">{files.map((file) => <span key={file}><FileText size={14} />{file}</span>)}</div>}</div><div className="privacy-inline"><ShieldCheck size={14} />Only authorized staff should access financial and identification documents.</div></div>}
        {step === 3 && <div className="wizard-panel"><div className="wizard-panel-head"><span className="step-icon step-icon-violet"><Check size={18} /></span><div><h2>Review before submission</h2><p>Check the request and confirm that the terms disclosure was discussed.</p></div></div><div className="application-review-summary"><div className="review-summary-top"><Avatar name={borrower?.name ?? 'Borrower'} /><span><strong>{borrower?.name ?? 'Borrower not selected'}</strong><small>{borrower?.id ?? 'Customer reference'}</small></span><span className="review-product">{product?.name ?? 'Loan product'}</span></div><div className="review-summary-grid"><div><small>Requested amount</small><strong>{formatUGX(Number(amount) || 0)}</strong></div><div><small>Duration</small><strong>{Number(watch('duration'))} months</strong></div><div><small>Frequency</small><strong>{watch('frequency')}</strong></div><div><small>Purpose</small><strong>{watch('purpose') || '—'}</strong></div><div><small>Monthly income</small><strong>{formatUGX(Number(watch('income')) || 0)}</strong></div><div><small>Existing obligations</small><strong>{formatUGX(Number(watch('obligations')) || 0)}</strong></div></div><div className="review-note"><Info size={15} /><span>This request is not approved. The backend will validate eligibility, calculate all financial terms, and return the proposed schedule.</span></div></div><label className="terms-checkbox"><input type="checkbox" {...register('termsConfirmed')} /><span className="custom-check"><Check size={13} /></span><span>I confirm the applicant has been shown clear product terms, fees and repayment obligations.</span></label>{errors.termsConfirmed?.message && <span className="lf-field-error">{String(errors.termsConfirmed.message)}</span>}</div>}
        <div className="wizard-footer"><div className="wizard-page-count">Step {step + 1} of 4 <span>·</span> {steps[step].title}</div><div>{step > 0 && <Button type="button" variant="outline" icon={ChevronLeft} onClick={() => setStep((value) => value - 1)}>Back</Button>}{step < 3 ? <Button type="button" icon={ChevronRight} onClick={() => void nextStep()}>Continue</Button> : <Button type="button" loading={isSubmitting} onClick={() => void handleSubmit(submit)()}>Submit for review</Button>}</div></div>
      </form></Card>
  </div>
}
