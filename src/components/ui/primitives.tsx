import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Check, CircleAlert, Clock3, LoaderCircle, type LucideIcon } from 'lucide-react'
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

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = '', ...props }, ref) {
  return <textarea ref={ref} className={cn('lf-input lf-textarea', className)} {...props} />
})

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('lf-input lf-select', className)} {...props}>{children}</select>
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
