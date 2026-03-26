'use client'

import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: React.ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = cn(
    'inline-flex items-center justify-center font-medium transition-all duration-200 ease-spring',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
    'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
    'active:scale-[0.98]',
  )

  const variants = {
    primary: cn(
      'gradient-accent text-white',
      'shadow-[0_1px_2px_rgb(0_0_0/0.2),0_0_0_1px_rgb(var(--accent)/0.5)]',
      'hover:shadow-[0_0_0_1px_rgb(var(--accent)/0.6),0_0_24px_-4px_rgb(var(--accent)/0.35)]',
      'hover:brightness-110',
      'focus-visible:ring-accent/40',
    ),
    secondary: cn(
      'bg-surface-elevated/60 text-text-secondary border border-border',
      'hover:bg-surface-elevated hover:text-text-primary hover:border-border-strong',
      'focus-visible:ring-text-tertiary/30',
    ),
    outline: cn(
      'border border-border-strong text-text-secondary bg-transparent',
      'hover:bg-surface-elevated/40 hover:text-text-primary hover:border-border-strong',
      'focus-visible:ring-accent/30',
    ),
    danger: cn(
      'bg-red-500/10 text-red-400 border border-red-500/20',
      'hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30',
      'focus-visible:ring-red-400/30',
    ),
    ghost: cn(
      'text-text-secondary',
      'hover:text-text-primary hover:bg-surface-elevated/40',
      'focus-visible:ring-text-tertiary/30',
    ),
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-body-sm gap-1.5 rounded-lg',
    md: 'px-4 py-2 text-body-sm gap-2 rounded-xl',
    lg: 'px-6 py-2.5 text-body gap-2.5 rounded-xl',
  }

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin opacity-80" />}
      {children}
    </button>
  )
}
