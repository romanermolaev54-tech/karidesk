'use client'

import { cn } from '@/lib/utils'
import { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s/g, '-')

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-body-sm font-medium text-text-secondary mb-2"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'w-full px-3.5 py-2.5 rounded-xl border appearance-none',
              'bg-surface-muted/30 text-text-primary text-body-sm',
              'focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40',
              'transition-all duration-200 ease-spring',
              error
                ? 'border-red-500/40'
                : 'border-border hover:border-border-strong',
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" className="text-text-tertiary">{placeholder}</option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
        </div>
        {error && (
          <p className="mt-1.5 text-caption text-red-400">{error}</p>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'
