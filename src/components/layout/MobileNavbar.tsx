'use client'

import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  TicketPlus,
  ClipboardList,
  Briefcase,
  User,
} from 'lucide-react'
import type { UserRole } from '@/types/database'

interface MobileNavbarProps {
  userRole: UserRole
}

export function MobileNavbar({ userRole }: MobileNavbarProps) {
  const pathname = usePathname()

  const items = {
    employee: [
      { href: '/dashboard', label: 'Главная', icon: LayoutDashboard },
      { href: '/tickets/new', label: 'Заявка', icon: TicketPlus },
      { href: '/my-tickets', label: 'Мои заявки', icon: ClipboardList },
      { href: '/settings', label: 'Профиль', icon: User },
    ],
    contractor: [
      { href: '/dashboard', label: 'Главная', icon: LayoutDashboard },
      { href: '/work', label: 'Задания', icon: Briefcase },
      { href: '/settings', label: 'Профиль', icon: User },
    ],
    admin: [
      { href: '/dashboard', label: 'Главная', icon: LayoutDashboard },
      { href: '/tickets', label: 'Заявки', icon: ClipboardList },
      { href: '/tickets/new', label: 'Новая', icon: TicketPlus },
      { href: '/reports', label: 'Отчёты', icon: Briefcase },
      { href: '/settings', label: 'Ещё', icon: User },
    ],
    director: [
      { href: '/dashboard', label: 'Главная', icon: LayoutDashboard },
      { href: '/tickets', label: 'Заявки', icon: ClipboardList },
      { href: '/reports', label: 'Отчёты', icon: Briefcase },
      { href: '/settings', label: 'Профиль', icon: User },
    ],
  }

  const navItems = items[userRole] || items.employee

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border glass-dark safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-xl transition-all',
                isActive
                  ? 'text-accent'
                  : 'text-text-tertiary active:text-text-secondary'
              )}
            >
              <div className={cn(
                'relative p-1.5 rounded-xl transition-all',
                isActive && 'bg-accent/10'
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-micro font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
