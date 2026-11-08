import { useEffect } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Save, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, Card, Field, Input, Select, Textarea } from '../../components/ui/primitives'
import { api } from '../../lib/services'
import { getRecordDetail } from '../../lib/api'

const schema = z.object({
  code: z.string().min(2, 'Enter a product code.'),
  name: z.string().min(3, 'Name this product.'),
  description: z.string().min(5, 'Add a short description.'),
  minAmount: z.coerce.number().min(1000),
  maxAmount: z.coerce.number().min(1000),
  interestRate: z.coerce.number().min(0).max(100),
  interestBasis: z.enum(['term', 'monthly', 'annual']),
  interestMethod: z.string(),
  duration: z.coerce.number().min(1),
  frequency: z.enum(['Daily', 'Weekly', 'Bi-weekly', 'Monthly']),
  gracePeriod: z.coerce.number().min(0),
  fees: z.string(),
  lateRule: z.string(),
  documents: z.string(),
  status: z.enum(['draft','active','inactive']),
}).refine((value) => value.maxAmount >= value.minAmount, { path: ['maxAmount'], message: 'Maximum must be at least the minimum.' })
type ProductInput = z.input<typeof schema>
type ProductValues = z.output<typeof schema>

export function ProductForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<ProductInput, unknown, ProductValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', name: '', description: '', minAmount: 100000, maxAmount: 5000000, interestRate: 20, interestBasis: 'term', interestMethod: 'Flat rate', duration: 1, frequency: 'Monthly', gracePeriod: 0, fees: '', lateRule: '', documents: '', status: 'draft' },
  })
  const status = watch('status')

  useEffect(() => {
    if (!id) return
    getRecordDetail('products', id).then((p: any) => {
      const terms = p?.terms ?? {}
      const legacy = terms.rateBps != null ? 'term' : 'annual'
      reset({
        code: String(p?.code ?? ''),
        name: String(p?.name ?? ''),
        description: String(p?.description ?? `${p?.category ?? 'Loan'} product`),
        minAmount: Number(terms.minAmountMinor ?? 0) / 100 || 1000,
        maxAmount: Number(terms.maxAmountMinor ?? 0) / 100 || 1000,
        interestRate: Number(terms.rateBps ?? terms.annualRateBps ?? 0) / 100,
        interestBasis: terms.interestBasis ?? legacy,
        interestMethod: terms.interestMethod === 'declining_balance' ? 'Declining balance' : 'Flat rate',
        duration: Number(terms.maxTenureMonths ?? 12),
        frequency: terms.repaymentFrequency === 'daily' ? 'Daily' : terms.repaymentFrequency === 'weekly' ? 'Weekly' : terms.repaymentFrequency === 'biweekly' ? 'Bi-weekly' : 'Monthly',
        gracePeriod: Number(terms.gracePeriodDays ?? 0),
        fees: '', lateRule: '',
        documents: Array.isArray(terms.requiredDocuments) ? terms.requiredDocuments.join(', ') : '',
        status: p?.status === 'active' ? 'active' : p?.status === 'inactive' ? 'inactive' : 'draft',
      })
    }).catch((e) => toast.error(e instanceof Error ? e.message : 'Product could not be loaded.'))
  }, [id, reset])

  async function submit(values: ProductValues) {
    const payload = {
      name: values.name,
      category: 'individual' as const,
      status: values.status,
      approvalLimitMinor: Math.round(values.maxAmount * 100),
      terms: {
        minAmountMinor: Math.round(values.minAmount * 100), maxAmountMinor: Math.round(values.maxAmount * 100),
        rateBps: Math.round(values.interestRate * 100),
        annualRateBps: Math.round(values.interestRate * 100), // compatibility
        interestBasis: values.interestBasis,
        interestMethod: /declin|reduc/i.test(values.interestMethod) ? 'declining_balance' as const : 'flat' as const,
        repaymentFrequency: values.frequency === 'Daily' ? 'daily' as const : values.frequency === 'Weekly' ? 'weekly' as const : values.frequency === 'Bi-weekly' ? 'biweekly' as const : 'monthly' as const,
        minTenureMonths: 1, maxTenureMonths: values.duration, gracePeriodDays: values.gracePeriod, fees: [], requiredDocuments: values.documents.split(',').map((x) => x.trim()).filter(Boolean),
      },
    }
    if (isEdit && id) {
      const result = await api.updateLoanProduct(id, payload as any)
      toast.success((result as any)?.message || (values.status === 'draft' ? 'Draft product updated' : 'Product saved (new version may be created to protect approved loan snapshots)'), { description: String((result as any)?.data?.id ?? (result as any)?._id ?? id) })
    } else {
      const record = await api.createProduct({ code: values.code, name: values.name, description: values.description, minAmount: values.minAmount, maxAmount: values.maxAmount, interestRate: values.interestRate, interestBasis: values.interestBasis, interestMethod: values.interestMethod, duration: values.duration, frequency: values.frequency, gracePeriod: values.gracePeriod, requiredDocuments: values.documents } as any)
      toast.success('Product created successfully', { description: `${record.name} · ${record.id}` })
    }
    navigate('/products')
  }
  return <div className="form-page"><div className="page-heading"><div><div className="eyebrow"><Link to="/products"><ArrowLeft size={13} /> LOAN PRODUCTS</Link><span className="eyebrow-separator">/</span> CONFIGURATION</div><h1>{isEdit ? 'Edit loan product' : 'Create loan product'}</h1><p>{isEdit ? 'Update the loan product details below.' : 'Configure a loan product.'}</p></div></div>
    <form className="registration-form" onSubmit={handleSubmit(submit)}><Card className="form-section"><div className="form-section-heading"><span className="section-number">01</span><div><h2>Product identity</h2><p>Describe who this loan is for and what it supports.</p></div></div><div className="form-section-body"><div className="form-grid"><Field label="Product code" required error={errors.code?.message}><Input placeholder="e.g. SHORT-20" {...register('code')} disabled={isEdit && status !== 'draft'} /></Field><Field label="Product name" required error={errors.name?.message}><Input placeholder="e.g. 1 Month Business Loan" {...register('name')} /></Field><Field label="Status" required><Select {...register('status')}><option value="draft">Draft</option><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field><Field label="Description" required className="field-span-2" error={errors.description?.message}><Textarea rows={3} placeholder="A short description for staff and customer disclosure" {...register('description')} /></Field></div></div></Card>
      <Card className="form-section"><div className="form-section-heading"><span className="section-number">02</span><div><h2>Amounts & interest</h2><p>Configure pricing and repayment terms for this product.</p></div></div><div className="form-section-body"><div className="form-grid"><Field label="Minimum amount (UGX)" required error={errors.minAmount?.message}><Input type="number" inputMode="numeric" min="1000" step="1" {...register('minAmount', { valueAsNumber: true })} /></Field><Field label="Maximum amount (UGX)" required error={errors.maxAmount?.message}><Input type="number" inputMode="numeric" min="1000" step="1" {...register('maxAmount', { valueAsNumber: true })} /></Field><Field label="Interest rate (%)" required error={errors.interestRate?.message} ><Input type="number" min="0" max="100" step="0.1" {...register('interestRate', { valueAsNumber: true })} /></Field><Field label="Interest basis" required error={errors.interestBasis?.message}><Select {...register('interestBasis')}><option value="term">Per loan term</option><option value="monthly">Per month</option><option value="annual">Per year</option></Select></Field><Field label="Interest method" required className="field-span-2"><Select {...register('interestMethod')}><option>Flat rate</option><option>Declining balance</option></Select></Field></div></div></Card>
      <Card className="form-section"><div className="form-section-heading"><span className="section-number">03</span><div><h2>Repayment & policies</h2></div></div><div className="form-section-body"><div className="form-grid"><Field label="Maximum duration (months)" required><Select {...register('duration', { valueAsNumber: true })}>{[1, 2, 3, 4, 5, 6, 9, 12, 18, 24, 36, 48, 60].map((month) => <option value={month} key={month}>{month} {month === 1 ? 'month' : 'months'}</option>)}</Select></Field><Field label="Repayment frequency" required><Select {...register('frequency')}><option>Daily</option><option>Weekly</option><option>Bi-weekly</option><option>Monthly</option></Select></Field><Field label="Grace period (days)"><Input type="number" min="0" {...register('gracePeriod', { valueAsNumber: true })} /></Field><Field label="Applicable fees" hint="Describe fixed/percentage fees for disclosure."><Input placeholder="e.g. 1% processing fee" {...register('fees')} /></Field><Field label="Late-payment rules" className="field-span-2"><Input placeholder="Optional" {...register('lateRule')} /></Field><Field label="Required documents" className="field-span-2"><Textarea rows={2} placeholder="Separate document requirements with commas" {...register('documents')} /></Field></div></div></Card>
      <div className="form-footer"><span /><div><Button type="button" variant="outline" icon={X} onClick={() => navigate('/products')}>Cancel</Button><Button type="submit" icon={Save} loading={isSubmitting}>Save product</Button></div></div>
    </form>
  </div>
}
