'use client'

import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s/g, '-')

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-body-sm font-medium text-text-secondary mb-2"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full px-3.5 py-2.5 rounded-xl border resize-none',
            'bg-surface-muted/30 text-text-primary',
            'placeholder:text-text-tertiary text-body-sm',
            'focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40',
            'transition-all duration-200 ease-spring',
            error
              ? 'border-red-500/40'
              : 'border-border hover:border-border-strong',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-caption text-red-400">{error}</p>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
