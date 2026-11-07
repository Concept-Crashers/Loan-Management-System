import { useEffect, useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { ArrowLeft, Check, FileText, Save, UploadCloud, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Avatar, Button, Card, Field, Input, SearchableSelect } from '../../components/ui/primitives'
import { getRecordDetail } from '../../lib/api'
import { api } from '../../lib/services'
import { PhoneNumberInput } from '../../components/ui/PhoneNumberInput'

const schema = z.object({
  name: z.string().min(3, 'Enter the borrower’s full name.'),
  dateOfBirth: z.string().min(1, 'Date of birth is required.'),
  phone: z.string().regex(/^(\+\d{1,4}[\s-]?\d[\d\s-]{5,13}|0\d{9})$/, 'Enter a valid phone number (select country code).'),
  email: z.email('Enter a valid email address.').or(z.literal('')),
  address: z.string().min(4, 'Enter a physical address.'),
  district: z.string().min(2, 'Select a district.'),
  town: z.string().min(2, 'Enter a town or municipality.'),
  idType: z.string().min(1, 'Select an identification type.'),
  nationalId: z.string().min(5, 'Enter the identification reference.'),
  occupation: z.string().min(2, 'Enter the occupation.'),
  employer: z.string().min(2, 'Enter an employer or self-employed.'),
  monthlyIncome: z.coerce.number().min(0, 'Enter the monthly income.'),
  nextOfKin: z.string().min(3, 'Enter the next-of-kin name.'),
  nextOfKinRelationship: z.string().min(2, 'Enter the relationship.'),
  nextOfKinPhone: z.string().regex(/^(\+\d{1,4}[\s-]?\d[\d\s-]{5,13}|0\d{9})$/, 'Enter a valid phone number (select country code).'),
})
type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>

function Section({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return <Card className="form-section"><div className="form-section-heading"><span className="section-number">{number}</span><div><h2>{title}</h2><p>{description}</p></div></div><div className="form-section-body">{children}</div></Card>
}

const districtOptions = ['Kampala', 'Wakiso', 'Mbarara', 'Gulu', 'Jinja', 'Mukono', 'Lira', 'Mbale', 'Arua'].map((d) => ({ value: d, label: d }))
const idTypeOptions = ['National ID (NIN)', 'Passport', 'Driving permit', 'Other approved ID'].map((v) => ({ value: v, label: v }))

export function CustomerForm({ mode = 'create' }: { mode?: 'create' | 'edit' }) {
  const navigate = useNavigate()
  const { id = '' } = useParams()
  const isEdit = mode === 'edit' && !!id
  const [documents, setDocuments] = useState<string[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [version, setVersion] = useState<number | null>(null)
  const { register, control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', dateOfBirth: '', phone: '+256 ', email: '', address: '', district: '', town: '', idType: 'National ID (NIN)', nationalId: '', occupation: '', employer: '', monthlyIncome: 0, nextOfKin: '', nextOfKinRelationship: '', nextOfKinPhone: '+256 ' } })

  useEffect(() => {
    if (!isEdit) return
    setLoading(true)
    getRecordDetail('customers', decodeURIComponent(id))
      .then((r: any) => {
        setVersion(typeof r.version === 'number' ? r.version : null)
        const dob = r.dateOfBirth ? new Date(r.dateOfBirth).toISOString().slice(0, 10) : ''
        reset({
          name: r.name ?? '', dateOfBirth: dob, phone: r.phone ?? '+256 ', email: r.email ?? '',
          address: r.address ?? '', district: r.district ?? '', town: r.town ?? r.municipality ?? '',
          idType: r.idType ?? 'National ID (NIN)', nationalId: r.nationalId ?? '',
          occupation: r.occupation ?? '', employer: r.employer ?? r.businessName ?? '',
          monthlyIncome: Number(r.monthlyIncomeMinor ?? r.monthlyIncome ?? 0) / (r.monthlyIncomeMinor != null ? 100 : 1),
          nextOfKin: r.nextOfKin ?? r.nextOfKinName ?? '', nextOfKinRelationship: r.nextOfKinRelationship ?? '',
          nextOfKinPhone: r.nextOfKinPhone ?? '+256 ',
        })
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Customer could not be loaded.'))
      .finally(() => setLoading(false))
  }, [id, isEdit, reset])

  async function submit(values: FormValues) {
    if (isEdit) {
      if (version == null) { toast.error('Customer version missing; refresh and try again.'); return }
      await api.updateCustomer(id, { ...values, version } as any)
      toast.success('Customer updated', { description: values.name })
      navigate(`/customers/${id}`)
      return
    }
    const customer = await api.createCustomer(values)
    toast.success('Customer registered successfully', { description: `${customer.name} · ${customer.id}` })
    navigate(`/customers/${customer.id}`)
  }

  if (loading) return <div className="page-loading">Loading customer…</div>

  return <div className="form-page"><div className="page-heading"><div><div className="eyebrow"><Link to={isEdit ? `/customers/${id}` : '/customers'}><ArrowLeft size={13} /> {isEdit ? 'CUSTOMER' : 'CUSTOMERS'}</Link><span className="eyebrow-separator">/</span> {isEdit ? 'EDIT' : 'NEW BORROWER'}</div><h1>{isEdit ? 'Edit customer' : 'Register a customer'}</h1><p>{isEdit ? 'Update borrower profile details.' : 'Create a complete borrower profile to begin a lending relationship.'}</p></div><div className="heading-actions"><span className="draft-status"><span /> {isEdit ? 'Editing' : 'Draft'}</span></div></div>
    {!isEdit && <div className="form-progress-summary"><span className="progress-avatar"><Avatar name="New customer" /></span><span><strong>Borrower profile</strong><small>Complete each section before saving</small></span><span className="progress-step-count">6 sections <span>·</span> about 4 min</span></div>}
    <form onSubmit={handleSubmit(submit)} className="registration-form">
      <Section number="01" title="Personal details" description="The borrower’s legal name and basic information."><div className="form-grid"><Field label="Full name" required error={errors.name?.message}><Input placeholder="e.g. Anita Namusoke" {...register('name')} /></Field><Field label="Date of birth" required error={errors.dateOfBirth?.message}><Input type="date" {...register('dateOfBirth')} /></Field></div></Section>
      <Section number="02" title="Contact details" description="How your team can reach the borrower."><div className="form-grid"><Field label="Mobile phone" required hint="Select country code (e.g. +256) to avoid retyping." error={errors.phone?.message}><Controller name="phone" control={control} render={({ field }) => <PhoneNumberInput value={field.value} onChange={field.onChange} />} /></Field><Field label="Email address" error={errors.email?.message}><Input type="email" placeholder="borrower@example.com" {...register('email')} /></Field><Field label="Physical address" required className="field-span-2" error={errors.address?.message}><Input placeholder="Street, parish or local landmark" {...register('address')} /></Field></div></Section>
      <Section number="03" title="Location" description="Branch and service-area context for this borrower."><div className="form-grid"><Field label="District" required error={errors.district?.message}><Controller name="district" control={control} render={({ field }) => <SearchableSelect options={districtOptions} value={field.value} onChange={field.onChange} placeholder="Search and select district" />} /></Field><Field label="Town / municipality" required error={errors.town?.message}><Input placeholder="e.g. Ntinda" {...register('town')} /></Field></div></Section>
      <Section number="04" title="Identification" description="Store only information permitted by your privacy policy and lawful basis."><div className="form-grid"><Field label="ID type" required error={errors.idType?.message}><Controller name="idType" control={control} render={({ field }) => <SearchableSelect options={idTypeOptions} value={field.value} onChange={field.onChange} placeholder="Search ID type" />} /></Field><Field label="ID reference" required error={errors.nationalId?.message}><Input placeholder="Enter reference" {...register('nationalId')} /></Field></div><div className="privacy-inline"><span className="privacy-shield"><Check size={14} /></span>Identification documents and references are sensitive and must be access-restricted.</div></Section>
      <Section number="05" title="Employment & income" description="Income details support later assessment; they do not determine approval here."><div className="form-grid"><Field label="Occupation" required error={errors.occupation?.message}><Input placeholder="e.g. Retail business owner" {...register('occupation')} /></Field><Field label="Employer / business" required error={errors.employer?.message}><Input placeholder="Company or self-employed" {...register('employer')} /></Field><Field label="Monthly income (UGX)" required error={errors.monthlyIncome?.message}><Input type="number" min="0" step="1" inputMode="numeric" placeholder="0" {...register('monthlyIncome', { valueAsNumber: true })} /></Field></div></Section>
      <Section number="06" title="Next of kin & documents" description="An alternative contact and supporting information for the file."><div className="form-grid"><Field label="Next-of-kin name" required error={errors.nextOfKin?.message}><Input placeholder="Full name" {...register('nextOfKin')} /></Field><Field label="Relationship" required error={errors.nextOfKinRelationship?.message}><Input placeholder="e.g. Spouse, sibling" {...register('nextOfKinRelationship')} /></Field><Field label="Contact number" required error={errors.nextOfKinPhone?.message}><Controller name="nextOfKinPhone" control={control} render={({ field }) => <PhoneNumberInput value={field.value} onChange={field.onChange} />} /></Field></div><div className="upload-area document-dropzone"><input id="customer-documents" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setDocuments(Array.from(event.target.files ?? []).map((file) => file.name))} /><label htmlFor="customer-documents"><UploadCloud size={24} /><strong>Choose files to upload</strong><span>PDF, JPG or PNG · Max 10 MB per file</span></label>{documents.length > 0 && <div className="uploaded-file-list document-file-list">{documents.map((name) => <span key={name}><FileText size={14} />{name}</span>)}</div>}</div></Section>
      <div className="form-footer"><span>{isEdit ? 'Saving updates the server record (version-checked).' : 'By saving, you confirm these details were collected appropriately.'}</span><div><Button type="button" variant="outline" icon={X} onClick={() => navigate(isEdit ? `/customers/${id}` : '/customers')}>Cancel</Button><Button type="submit" icon={Save} loading={isSubmitting}>{isEdit ? 'Save changes' : 'Save customer'}</Button></div></div>
    </form>
  </div>
}
