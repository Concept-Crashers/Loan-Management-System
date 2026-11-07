import { useEffect } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Info, Save } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Select, Textarea } from '../../components/ui/primitives'
import { api } from '../../lib/services'
import { getRecordDetail } from '../../lib/api'

const schema = z.object({ code: z.string().min(2, 'Enter a product code.'), name: z.string().min(3, 'Name this product.'), description: z.string().min(5, 'Add a short description.'), minAmount: z.coerce.number().min(1000), maxAmount: z.coerce.number().min(1000), interestRate: z.coerce.number().min(0).max(100), interestMethod: z.string(), duration: z.coerce.number().min(1), frequency: z.enum(['Daily', 'Weekly', 'Bi-weekly', 'Monthly']), gracePeriod: z.coerce.number().min(0), fees: z.string(), lateRule: z.string(), documents: z.string() }).refine((value) => value.maxAmount >= value.minAmount, { path: ['maxAmount'], message: 'Maximum must be at least the minimum.' })
type ProductInput = z.input<typeof schema>
type ProductValues = z.output<typeof schema>

export function ProductForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProductInput, unknown, ProductValues>({ resolver: zodResolver(schema), defaultValues: { code: '', name: '', description: '', minAmount: 100000, maxAmount: 5000000, interestRate: 15, interestMethod: 'Declining balance', duration: 12, frequency: 'Monthly', gracePeriod: 0, fees: '', lateRule: '', documents: '' } })

  useEffect(() => {
    if (!id) return
    getRecordDetail('products', id).then((p: any) => {
      const terms = p?.terms ?? {}
      reset({ code: String(p?.code ?? ''), name: String(p?.name ?? ''), description: String(p?.description ?? `${p?.category ?? 'Loan'} product`), minAmount: Number(terms.minAmountMinor ?? 0) / 100 || 1000, maxAmount: Number(terms.maxAmountMinor ?? 0) / 100 || 1000, interestRate: Number(terms.annualRateBps ?? 0) / 100, interestMethod: terms.interestMethod === 'flat' ? 'Flat rate' : 'Declining balance', duration: Number(terms.maxTenureMonths ?? 12), frequency: terms.repaymentFrequency === 'daily' ? 'Daily' : terms.repaymentFrequency === 'weekly' ? 'Weekly' : terms.repaymentFrequency === 'biweekly' ? 'Bi-weekly' : 'Monthly', gracePeriod: Number(terms.gracePeriodDays ?? 0), fees: '', lateRule: '', documents: Array.isArray(terms.requiredDocuments) ? terms.requiredDocuments.join(', ') : '' })
    }).catch((e) => toast.error(e instanceof Error ? e.message : 'Product could not be loaded.'))
  }, [id, reset])

  async function submit(values: ProductValues) {
    const record = await api.createProduct({ ...values, requiredDocuments: values.documents })
    toast.success(isEdit ? 'New product version created successfully' : 'Product created successfully', { description: `${record.name} · ${record.id}` })
    navigate('/products')
  }
  return <div className="form-page"><div className="page-heading"><div><div className="eyebrow"><Link to="/products"><ArrowLeft size={13} /> LOAN PRODUCTS</Link><span className="eyebrow-separator">/</span> CONFIGURATION</div><h1>{isEdit ? 'Edit loan product (new version)' : 'Create loan product'}</h1><p>{isEdit ? 'Saving creates a new version of this product code. Existing approved loans keep their product snapshot.' : 'Define flexible, transparent terms for future applications.'}</p></div></div>
    <form className="registration-form" onSubmit={handleSubmit(submit)}><Card className="form-section"><div className="form-section-heading"><span className="section-number">01</span><div><h2>Product identity</h2><p>Describe who this loan is for and what it supports.</p></div></div><div className="form-section-body"><div className="form-grid"><Field label="Product code" required error={errors.code?.message}><Input placeholder="e.g. BIZ-01" {...register('code')} /></Field><Field label="Product name" required error={errors.name?.message}><Input placeholder="e.g. Business Growth" {...register('name')} /></Field><Field label="Description" required className="field-span-2" error={errors.description?.message}><Textarea rows={3} placeholder="A short description for staff and customer disclosure" {...register('description')} /></Field></div></div></Card>
      <Card className="form-section"><div className="form-section-heading"><span className="section-number">02</span><div><h2>Amounts & interest</h2><p>These values configure the product; approved loan terms come from the backend snapshot.</p></div></div><div className="form-section-body"><div className="form-grid"><Field label="Minimum amount (UGX)" required error={errors.minAmount?.message}><Input type="number" inputMode="numeric" min="1000" step="1" {...register('minAmount', { valueAsNumber: true })} /></Field><Field label="Maximum amount (UGX)" required error={errors.maxAmount?.message}><Input type="number" inputMode="numeric" min="1000" step="1" {...register('maxAmount', { valueAsNumber: true })} /></Field><Field label="Annual interest rate (%)" required error={errors.interestRate?.message}><Input type="number" min="0" max="100" step="0.1" {...register('interestRate', { valueAsNumber: true })} /></Field><Field label="Interest calculation method" required><Select {...register('interestMethod')}><option>Declining balance</option><option>Reducing balance</option><option>Flat rate</option></Select></Field></div><div className="terms-disclaimer"><Info size={16} /><span>The effective rate, fees and total repayment obligation must be transparently disclosed and confirmed by the lender’s compliance adviser.</span></div></div></Card>
      <Card className="form-section"><div className="form-section-heading"><span className="section-number">03</span><div><h2>Repayment & policies</h2><p>Specify allowed durations, frequency and additional rules.</p></div></div><div className="form-section-body"><div className="form-grid"><Field label="Maximum duration (months)" required><Select {...register('duration', { valueAsNumber: true })}>{[1, 2, 3, 4, 5, 6, 9, 12, 18, 24, 36, 48, 60].map((month) => <option value={month} key={month}>{month} {month === 1 ? 'month' : 'months'}</option>)}</Select></Field><Field label="Repayment frequency" required><Select {...register('frequency')}><option>Daily</option><option>Weekly</option><option>Bi-weekly</option><option>Monthly</option></Select></Field><Field label="Grace period (days)"><Input type="number" min="0" {...register('gracePeriod', { valueAsNumber: true })} /></Field><Field label="Applicable fees" hint="Describe fixed/percentage fees for disclosure."><Input placeholder="e.g. 1% processing fee" {...register('fees')} /></Field><Field label="Late-payment rules" className="field-span-2"><Input placeholder="Policy summary only; final terms are backend-managed" {...register('lateRule')} /></Field><Field label="Required documents" className="field-span-2"><Textarea rows={2} placeholder="Separate document requirements with commas" {...register('documents')} /></Field></div></div></Card>
      <div className="form-footer"><span>{isEdit ? 'Saving creates a new audited product version using the backend create flow.' : 'Product is saved by the backend.'}</span><div><Button type="button" variant="outline" onClick={() => navigate('/products')}>Cancel</Button><Button type="submit" icon={Save} loading={isSubmitting}>{isEdit ? 'Save new version' : 'Save product'}</Button></div></div>
    </form>
  </div>
}
