import { useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Check, FileText, Save, UploadCloud } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Avatar, Button, Card, Field, Input, Select } from '../../components/ui/primitives'
import { mockApi } from '../../lib/services'

const schema = z.object({
  name: z.string().min(3, 'Enter the borrower’s full name.'),
  dateOfBirth: z.string().min(1, 'Date of birth is required.'),
  phone: z.string().regex(/^(\+256\s?\d{3}\s?\d{3}\s?\d{3}|0\d{9})$/, 'Use a valid Ugandan number, e.g. +256 772 123 456.'),
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
  nextOfKinPhone: z.string().regex(/^(\+256\s?\d{3}\s?\d{3}\s?\d{3}|0\d{9})$/, 'Use a valid Ugandan number.'),
})
type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>

function Section({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return <Card className="form-section"><div className="form-section-heading"><span className="section-number">{number}</span><div><h2>{title}</h2><p>{description}</p></div></div><div className="form-section-body">{children}</div></Card>
}

export function CustomerForm() {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<string[]>([])
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', dateOfBirth: '', phone: '', email: '', address: '', district: '', town: '', idType: 'National ID (NIN)', nationalId: '', occupation: '', employer: '', monthlyIncome: 0, nextOfKin: '', nextOfKinRelationship: '', nextOfKinPhone: '' } })

  async function submit(values: FormValues) {
    const customer = await mockApi.createCustomer(values)
    toast.success('Customer added to demo workspace', { description: `${customer.name} · ${customer.id}` })
    navigate(`/customers/${customer.id}`)
  }

  return <div className="form-page"><div className="page-heading"><div><div className="eyebrow"><Link to="/customers"><ArrowLeft size={13} /> CUSTOMERS</Link><span className="eyebrow-separator">/</span> NEW BORROWER</div><h1>Register a customer</h1><p>Create a complete borrower profile to begin a lending relationship.</p></div><div className="heading-actions"><span className="draft-status"><span /> Draft</span></div></div>
    <div className="form-progress-summary"><span className="progress-avatar"><Avatar name="New customer" /></span><span><strong>Borrower profile</strong><small>Complete each section before saving</small></span><span className="progress-step-count">6 sections <span>·</span> about 4 min</span></div>
    <form onSubmit={handleSubmit(submit)} className="registration-form">
      <Section number="01" title="Personal details" description="The borrower’s legal name and basic information."><div className="form-grid"><Field label="Full name" required error={errors.name?.message}><Input placeholder="e.g. Anita Namusoke" {...register('name')} /></Field><Field label="Date of birth" required error={errors.dateOfBirth?.message}><Input type="date" {...register('dateOfBirth')} /></Field></div></Section>
      <Section number="02" title="Contact details" description="How your team can reach the borrower."><div className="form-grid"><Field label="Mobile phone" required hint="Uganda mobile numbers (+256 or 0 prefix)." error={errors.phone?.message}><Input placeholder="+256 772 123 456" {...register('phone')} /></Field><Field label="Email address" error={errors.email?.message}><Input type="email" placeholder="borrower@example.com" {...register('email')} /></Field><Field label="Physical address" required className="field-span-2" error={errors.address?.message}><Input placeholder="Street, parish or local landmark" {...register('address')} /></Field></div></Section>
      <Section number="03" title="Location" description="Branch and service-area context for this borrower."><div className="form-grid"><Field label="District" required error={errors.district?.message}><Select {...register('district')}><option value="">Select district</option>{['Kampala', 'Wakiso', 'Mbarara', 'Gulu', 'Jinja', 'Mukono', 'Lira', 'Mbale', 'Arua'].map((district) => <option key={district}>{district}</option>)}</Select></Field><Field label="Town / municipality" required error={errors.town?.message}><Input placeholder="e.g. Ntinda" {...register('town')} /></Field></div></Section>
      <Section number="04" title="Identification" description="Store only information permitted by your privacy policy and lawful basis."><div className="form-grid"><Field label="ID type" required error={errors.idType?.message}><Select {...register('idType')}><option>National ID (NIN)</option><option>Passport</option><option>Driving permit</option><option>Other approved ID</option></Select></Field><Field label="ID reference" required error={errors.nationalId?.message}><Input placeholder="Enter reference" {...register('nationalId')} /></Field></div><div className="privacy-inline"><span className="privacy-shield"><Check size={14} /></span>Identification documents and references are sensitive and must be access-restricted.</div></Section>
      <Section number="05" title="Employment & income" description="Income details support later assessment; they do not determine approval here."><div className="form-grid"><Field label="Occupation" required error={errors.occupation?.message}><Input placeholder="e.g. Retail business owner" {...register('occupation')} /></Field><Field label="Employer / business" required error={errors.employer?.message}><Input placeholder="Company or self-employed" {...register('employer')} /></Field><Field label="Monthly income (UGX)" required error={errors.monthlyIncome?.message}><Input type="number" min="0" step="10000" placeholder="0" {...register('monthlyIncome', { valueAsNumber: true })} /></Field></div></Section>
      <Section number="06" title="Next of kin & documents" description="An alternative contact and supporting information for the file."><div className="form-grid"><Field label="Next-of-kin name" required error={errors.nextOfKin?.message}><Input placeholder="Full name" {...register('nextOfKin')} /></Field><Field label="Relationship" required error={errors.nextOfKinRelationship?.message}><Input placeholder="e.g. Spouse, sibling" {...register('nextOfKinRelationship')} /></Field><Field label="Contact number" required error={errors.nextOfKinPhone?.message}><Input placeholder="+256 772 123 456" {...register('nextOfKinPhone')} /></Field></div><div className="upload-area"><input id="customer-documents" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setDocuments(Array.from(event.target.files ?? []).map((file) => file.name))} /><label htmlFor="customer-documents"><UploadCloud size={19} /><strong>Choose supporting documents</strong><span>PDF, JPG or PNG · demo only, not uploaded</span></label>{documents.length > 0 && <div className="uploaded-file-list">{documents.map((name) => <span key={name}><FileText size={14} />{name}</span>)}</div>}</div></Section>
      <div className="form-footer"><span>By saving, you confirm these details were collected appropriately.</span><div><Button type="button" variant="outline" onClick={() => navigate('/customers')}>Cancel</Button><Button type="submit" icon={Save} disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save customer'}</Button></div></div>
    </form>
  </div>
}
