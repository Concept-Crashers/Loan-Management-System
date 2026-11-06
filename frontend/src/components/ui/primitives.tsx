import { forwardRef, useEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Check, ChevronDown, CircleAlert, Clock3, Eye, EyeOff, KeyRound, LoaderCircle, Search, type LucideIcon } from 'lucide-react'
import { cn } from './utils'

const buttonStyles = cva('lf-button', {
  variants: {
    variant: {
      primary: 'lf-button-primary', secondary: 'lf-button-secondary', outline: 'lf-button-outline', ghost: 'lf-button-ghost', danger: 'lf-button-danger',
    },
    size: { default: 'lf-button-md', sm: 'lf-button-sm', xs: 'lf-button-xs', icon: 'lf-button-icon' },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
})

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> { icon?: LucideIcon; loading?: boolean }
export function Button({ className, variant, size, icon: Icon, loading = false, disabled, children, ...props }: ButtonProps) {
  return <button className={cn(buttonStyles({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{loading ? <LoaderCircle className="button-spinner" size={16} strokeWidth={1.8} /> : Icon && <Icon size={16} strokeWidth={1.8} />}{children}</button>
}

export function Card({ children, className = '', ...props }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('lf-card', className)} {...props}>{children}</div>
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={cn('lf-input', className)} {...props} />
})

export function IconInput({ icon: Icon, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon: LucideIcon }) {
  return <span className="lf-input-icon-wrap"><Icon className="lf-input-leading-icon" size={15} strokeWidth={1.8} /><Input {...props} className={cn('lf-input-with-icon', props.className)} /></span>
}

export function PasswordInput({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return <span className="lf-password-wrap"><KeyRound className="lf-input-leading-icon" size={15} strokeWidth={1.8} /><Input {...props} type={visible ? 'text' : 'password'} className={cn('lf-input-with-icon lf-input-with-toggle', className)} /><button type="button" className="lf-input-toggle" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Hide password' : 'Show password'} title={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = '', ...props }, ref) {
  return <textarea ref={ref} className={cn('lf-input lf-textarea', className)} {...props} />
})

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('lf-input lf-select', className)} {...props}>{children}</select>
}

export type SelectOption = { value: string; label: string; disabled?: boolean; searchText?: string }
export const SearchableSelect = forwardRef<HTMLSelectElement, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'onChange'> & {
  options: SelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  onChange?: (value: string) => void
  onValueChange?: (value: string) => void
}>(function SearchableSelect({ options, value, defaultValue, name, placeholder = 'Select…', searchPlaceholder = 'Search…', onChange, onValueChange, className = '', disabled, required, id }, ref) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [internal, setInternal] = useState(String(defaultValue ?? ''))
  const wrap = useRef<HTMLDivElement>(null)
  const isControlled = value !== undefined
  const current = String(isControlled ? value : internal)
  const selected = options.find((o) => o.value === current)
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return options
    return options.filter((o) => (o.searchText ?? o.label).toLowerCase().includes(s))
  }, [options, q])
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  function pick(v: string) {
    if (!isControlled) setInternal(v)
    onChange?.(v)
    onValueChange?.(v)
    setOpen(false)
    setQ('')
  }
  return <div className={cn('lf-searchable-select', className)} ref={wrap}>
    {name ? <input ref={ref as React.Ref<HTMLInputElement>} type="hidden" name={name} value={current} /> : null}
    <button id={id} type="button" className={cn('lf-input lf-searchable-trigger', open && 'is-open')} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => !disabled && setOpen((v) => !v)}>
      <span className={cn(!selected && 'lf-searchable-placeholder')}>{selected?.label ?? placeholder}</span>
      <ChevronDown size={14} />
    </button>
    {open ? <div className="lf-searchable-popover" role="listbox">
      <div className="lf-searchable-search"><Search size={13} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label="Search options" /></div>
      <div className="lf-searchable-options">
        {filtered.length ? filtered.map((o) => <button key={o.value || '__empty__'} type="button" role="option" aria-selected={o.value === current} disabled={o.disabled} className={cn('lf-searchable-option', o.value === current && 'is-selected')} onClick={() => pick(o.value)}>{o.label}{o.value === current ? <Check size={13} /> : null}</button>) : <div className="lf-searchable-empty">No matches</div>}
      </div>
    </div> : null}
    {required ? <input tabIndex={-1} className="lf-searchable-required" value={current} required onChange={() => {}} aria-hidden /> : null}
  </div>
})

export const countryCodes = [
  { code: '+256', label: 'Uganda (+256)' },
  { code: '+254', label: 'Kenya (+254)' },
  { code: '+255', label: 'Tanzania (+255)' },
  { code: '+250', label: 'Rwanda (+250)' },
  { code: '+211', label: 'South Sudan (+211)' },
  { code: '+243', label: 'DR Congo (+243)' },
  { code: '+257', label: 'Burundi (+257)' },
  { code: '+234', label: 'Nigeria (+234)' },
  { code: '+233', label: 'Ghana (+233)' },
  { code: '+27', label: 'South Africa (+27)' },
  { code: '+44', label: 'United Kingdom (+44)' },
  { code: '+1', label: 'United States (+1)' },
]
export function PhoneInput({ value = '', onChange, name, placeholder = '772 123 456', defaultCountry = '+256' }: { value?: string; onChange?: (value: string) => void; name?: string; placeholder?: string; defaultCountry?: string }) {
  const parse = (v: string) => {
    const t = (v || '').trim()
    if (!t) return { code: defaultCountry, num: '' }
    if (t.startsWith('0')) return { code: defaultCountry, num: t }
    const hit = countryCodes.map((c) => c.code).sort((a,b)=>b.length-a.length).find((c) => t.startsWith(c))
    if (hit) return { code: hit, num: t.slice(hit.length).trim() }
    return { code: defaultCountry, num: t }
  }
  const init = parse(value)
  const [code, setCode] = useState(init.code)
  const [num, setNum] = useState(init.num)
  useEffect(() => { const p = parse(value); setCode(p.code); setNum(p.num) }, [value])
  function emit(c: string, n: string) {
    const v = n.trim() ? (n.trim().startsWith('0') ? n.trim() : `${c} ${n.trim()}`) : ''
    onChange?.(v)
  }
  return <div className="lf-phone-input">
    <select className="lf-input lf-phone-code" value={code} onChange={(e) => { setCode(e.target.value); emit(e.target.value, num) }} aria-label="Country code">
      {countryCodes.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
    </select>
    <input className="lf-input lf-phone-number" name={name} value={num} onChange={(e) => { setNum(e.target.value); emit(code, e.target.value) }} placeholder={placeholder} inputMode="tel" autoComplete="tel" />
  </div>
}

export function Field({ label, hint, error, required, children, className = '' }: { label: string; hint?: string; error?: string; required?: boolean; children: ReactNode; className?: string }) {
  return <div className={cn('lf-field', className)}><label className="lf-label">{label}{required && <span className="required-star"> *</span>}</label>{children}{error ? <span className="lf-field-error">{error}</span> : hint ? <span className="lf-field-hint">{hint}</span> : null}</div>
}

const badgeStyles: Record<string, string> = {
  Active: 'badge-success', Successful: 'badge-success', Completed: 'badge-success', Paid: 'badge-success', Approved: 'badge-success', Resolved: 'badge-success',
  Overdue: 'badge-danger', Rejected: 'badge-danger', Reversed: 'badge-danger', 'Written Off': 'badge-danger',
  'Pending Disbursement': 'badge-warning', Pending: 'badge-warning', 'Pending review': 'badge-warning', Submitted: 'badge-blue', 'Under Review': 'badge-blue', 'Due soon': 'badge-warning', 'Due today': 'badge-warning', 'Additional Information Required': 'badge-violet', 'Awaiting Response': 'badge-violet', Contacted: 'badge-blue', 'Payment Arrangement Recorded': 'badge-teal', 'Not Contacted': 'badge-neutral', Upcoming: 'badge-neutral', Draft: 'badge-neutral', Cancelled: 'badge-neutral', Inactive: 'badge-neutral', Invited: 'badge-violet', Suspended: 'badge-danger', 'Fully Paid': 'badge-success', Closed: 'badge-neutral', Restructured: 'badge-violet',
}
export function StatusBadge({ status, dot = true }: { status: string; dot?: boolean }) {
  const label = status || 'Unknown'
  const tone = badgeStyles[label] ?? 'badge-neutral'
  const Icon = ['Paid', 'Successful', 'Completed', 'Approved', 'Resolved'].includes(label) ? Check : ['Overdue', 'Rejected', 'Reversed'].includes(label) ? CircleAlert : ['Pending', 'Pending review', 'Upcoming', 'Due soon', 'Due today'].includes(label) ? Clock3 : null
  return <span className={cn('lf-badge', tone)}>{dot && (Icon ? <Icon size={12} /> : <span className="badge-dot" />)}{label}</span>
}

const avatarPalette = ['avatar-blue', 'avatar-green', 'avatar-violet', 'avatar-amber', 'avatar-rose']
export function Avatar({ name, size = 'md', className = '' }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const index = name.charCodeAt(0) % avatarPalette.length
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  return <span className={cn('lf-avatar', `avatar-${size}`, avatarPalette[index], className)} aria-label={name}>{initials}</span>
}

export function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="section-title-row"><div><h2 className="section-title">{title}</h2>{description && <p className="section-description">{description}</p>}</div>{action}</div>
}
