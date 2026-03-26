'use client'

import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s/g, '-')

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-body-sm font-medium text-text-secondary mb-2"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full px-3.5 py-2.5 rounded-xl border',
            'bg-surface-muted/30 text-text-primary',
            'placeholder:text-text-tertiary text-body-sm',
            'focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40 focus:bg-surface-elevated/40',
            'transition-all duration-200 ease-spring',
            error
              ? 'border-red-500/40 focus:ring-red-500/15 focus:border-red-500/40'
              : 'border-border hover:border-border-strong',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-caption text-red-400">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-caption text-text-tertiary">{helperText}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
