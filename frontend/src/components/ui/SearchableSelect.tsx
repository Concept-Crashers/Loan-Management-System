import { Children, Fragment, forwardRef, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState, useLayoutEffect, type ForwardedRef, type ReactElement, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from './utils'

type NativeOptionProps = {
  children?: ReactNode
  value?: string | number | readonly string[]
  label?: string
  disabled?: boolean
}

type SearchOption = { value: string; label: string; disabled: boolean }

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join(' ')
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children)
  return ''
}

function collectOptions(children: ReactNode): SearchOption[] {
  const result: SearchOption[] = []
  const visit = (nodes: ReactNode) => Children.forEach(nodes, (child) => {
    if (!isValidElement(child)) return
    const element = child as ReactElement<NativeOptionProps>
    if (element.type === Fragment || element.type === 'optgroup') {
      visit(element.props.children)
      return
    }
    if (element.type !== 'option') return
    const label = nodeText(element.props.label ?? element.props.children).trim()
    const value = element.props.value === undefined ? label : String(element.props.value)
    result.push({ value, label, disabled: Boolean(element.props.disabled) })
  })
  visit(children)
  return result
}

function assignRef(ref: ForwardedRef<HTMLSelectElement>, element: HTMLSelectElement | null) {
  if (typeof ref === 'function') ref(element)
  else if (ref) (ref as { current: HTMLSelectElement | null }).current = element
}

export const SearchableSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function SearchableSelect({
  className = '', children, value, defaultValue, onChange, onBlur, disabled, required, name, id,
  'aria-label': ariaLabel, 'aria-describedby': ariaDescribedBy, ...nativeProps
}, forwardedRef) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [internalValue, setInternalValue] = useState(String(defaultValue ?? ''))
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const nativeRef = useRef<HTMLSelectElement | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const options = useMemo(() => collectOptions(children), [children])
  const selectedValue = value === undefined ? internalValue : String(value ?? '')
  const selected = options.find((option) => option.value === selectedValue)
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    if (!term) return options
    return options.filter((option) => `${option.label} ${option.value}`.toLocaleLowerCase().includes(term))
  }, [options, query])

  const setNativeRef = useCallback((element: HTMLSelectElement | null) => {
    nativeRef.current = element
    assignRef(forwardedRef, element)
  }, [forwardedRef])

  useEffect(() => {
    if (value === undefined && nativeRef.current) setInternalValue(nativeRef.current.value)
  }, [])

  useLayoutEffect(() => {
    if (value === undefined && nativeRef.current && nativeRef.current.value !== internalValue) {
      setInternalValue(nativeRef.current.value)
    }
  })

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const selectedIndex = filtered.findIndex((option) => option.value === selectedValue)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    searchRef.current?.focus()
  }, [open, query, selectedValue, filtered])

  function close() {
    setOpen(false)
    setQuery('')
  }

  function choose(option: SearchOption) {
    if (disabled || option.disabled) return
    if (value === undefined) setInternalValue(option.value)
    const select = nativeRef.current
    if (select && select.value !== option.value) {
      const prototype = select.ownerDocument.defaultView?.HTMLSelectElement.prototype
      const nativeSetter = prototype && Object.getOwnPropertyDescriptor(prototype, 'value')?.set
      if (nativeSetter) nativeSetter.call(select, option.value)
      else select.value = option.value
      const EventConstructor = select.ownerDocument.defaultView?.Event
      if (EventConstructor) select.dispatchEvent(new EventConstructor('change', { bubbles: true }))
      else select.dispatchEvent(new Event('change', { bubbles: true }))
    }
    close()
    triggerRef.current?.focus()
  }

  function handleNativeChange(event: React.ChangeEvent<HTMLSelectElement>) {
    if (value === undefined) setInternalValue(event.currentTarget.value)
    onChange?.(event)
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'ArrowDown' && filtered.length) {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp' && filtered.length) {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && filtered[activeIndex]) {
      event.preventDefault()
      choose(filtered[activeIndex])
    }
  }

  const chosenLabel = selected?.label ?? options.find((option) => option.value === '')?.label ?? 'Select an option'
  return <div className="lf-search-select" ref={rootRef} onBlurCapture={(event) => {
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
      const native = nativeRef.current
      if (native && onBlur) onBlur({ target: native, currentTarget: native, type: 'blur' } as React.FocusEvent<HTMLSelectElement>)
    }
  }}>
    <button
      id={id}
      ref={triggerRef}
      type="button"
      className={cn('lf-input lf-select lf-search-select-trigger', className)}
      role="combobox"
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-controls={listId}
      aria-required={required || undefined}
      disabled={disabled}
      onClick={() => { setOpen((current) => !current); setQuery('') }}
    >
      <span className={!selectedValue ? 'lf-search-select-placeholder' : ''}>{chosenLabel}</span>
      <ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && <div className="lf-search-select-panel">
      <div className="lf-search-select-search-wrap"><Search size={14} aria-hidden="true" /><input ref={searchRef} type="text" role="searchbox" autoComplete="off" placeholder="Search options…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleSearchKeyDown} aria-label={ariaLabel ? `Search ${ariaLabel.toLowerCase()} options` : 'Search options'} aria-controls={listId} /></div>
      <div id={listId} className="lf-search-select-options" role="listbox" aria-label={ariaLabel ?? 'Options'}>
        {filtered.length ? filtered.map((option, index) => <button
          id={`${listId}-option-${index}`}
          key={`${option.value}-${index}`}
          type="button"
          role="option"
          aria-selected={option.value === selectedValue}
          className={`lf-search-select-option ${index === activeIndex ? 'lf-search-select-option-active' : ''}`}
          disabled={option.disabled}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => choose(option)}
        ><span>{option.label || '—'}</span>{option.value === selectedValue && <Check size={14} aria-hidden="true" />}</button>) : <div className="lf-search-select-empty">No matching options</div>}
      </div>
    </div>}
    <select
      {...nativeProps}
      ref={setNativeRef}
      id={id ? `${id}-native` : undefined}
      name={name}
      className="lf-search-select-native"
      aria-hidden="true"
      tabIndex={-1}
      disabled={disabled}
      required={required}
      onChange={handleNativeChange}
      onFocus={(event) => {
        if (typeof nativeProps.onFocus === 'function') nativeProps.onFocus(event)
        triggerRef.current?.focus()
      }}
      value={value === undefined ? undefined : value}
      defaultValue={value === undefined ? defaultValue : undefined}
    >{children}</select>
  </div>
})
