'use client'

import { cn } from '@/lib/utils'
import { Bell, Search, Menu } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

interface HeaderProps {
  onMenuToggle?: () => void
  notificationCount?: number
}

export function Header({ onMenuToggle, notificationCount = 0 }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-border glass">
      <div className="flex items-center gap-4 h-14 px-4 lg:px-6">
        {/* Mobile menu */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2">
          <Image src="/logo-kari-icon.png" alt="Kari" width={28} height={28} />
          <span className="text-body font-bold gradient-text">KariDesk</span>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-md hidden md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
            <input
              type="text"
              placeholder="Поиск заявок..."
              className={cn(
                'w-full pl-10 pr-4 py-2 rounded-xl border border-border',
                'bg-surface-muted/30 text-text-primary text-body-sm',
                'placeholder:text-text-tertiary',
                'focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40',
                'transition-all duration-200'
              )}
            />
          </div>
        </div>

        <div className="flex-1 md:hidden" />

        {/* Search mobile */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className="md:hidden p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40 transition-colors"
        >
          <Search className="w-5 h-5" />
        </button>

        {/* Notifications */}
        <Link
          href="/notifications"
          className="relative p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40 transition-colors"
        >
          <Bell className="w-5 h-5" />
          {notificationCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full bg-accent text-white text-micro font-bold">
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          )}
        </Link>
      </div>

      {/* Mobile search bar */}
      {searchOpen && (
        <div className="md:hidden px-4 pb-3 animate-fade-in">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
            <input
              type="text"
              placeholder="Поиск заявок..."
              autoFocus
              className={cn(
                'w-full pl-10 pr-4 py-2.5 rounded-xl border border-border',
                'bg-surface-muted/30 text-text-primary text-body-sm',
                'placeholder:text-text-tertiary',
                'focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40',
              )}
            />
          </div>
        </div>
      )}
    </header>
  )
}
