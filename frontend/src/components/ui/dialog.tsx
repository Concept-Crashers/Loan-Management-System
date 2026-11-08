import type { ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>{children}</DialogPrimitive.Root>
}
export const DialogTrigger = DialogPrimitive.Trigger
export function DialogContent({ title, description, children, className = '' }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="dialog-overlay" /><DialogPrimitive.Content className={`dialog-content ${className}`} onPointerDownOutside={(e) => { const t = e.target as HTMLElement | null; if (t?.closest?.('.lf-search-select-panel, .lf-searchable-popover, [data-radix-popper-content-wrapper], [data-radix-select-content]')) e.preventDefault() }} onInteractOutside={(e) => { const t = e.target as HTMLElement | null; if (t?.closest?.('.lf-search-select-panel, .lf-searchable-popover, [data-radix-popper-content-wrapper], [data-radix-select-content]')) e.preventDefault() }}>
    <div className="dialog-heading"><div><DialogPrimitive.Title className="dialog-title">{title}</DialogPrimitive.Title>{description && <DialogPrimitive.Description className="dialog-description">{description}</DialogPrimitive.Description>}</div><DialogPrimitive.Close className="dialog-close" aria-label="Close dialog"><X size={18} /></DialogPrimitive.Close></div>
    {children}
  </DialogPrimitive.Content></DialogPrimitive.Portal>
}
export const DialogClose = DialogPrimitive.Close
