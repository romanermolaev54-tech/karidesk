'use client'

import { cn } from '@/lib/utils'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  TicketPlus,
  ClipboardList,
  Briefcase,
  Receipt,
  BarChart3,
  Store,
  Bell,
  Settings,
  Users,
  Building2,
  Tags,
  Moon,
  Sun,
  ChevronLeft,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import type { UserRole } from '@/types/database'

interface SidebarProps {
  userRole: UserRole
  userName: string
}

const navItems = [
  { href: '/dashboard', label: 'Главная', icon: LayoutDashboard, roles: ['admin', 'director', 'employee', 'contractor'] },
  { href: '/tickets/new', label: 'Новая заявка', icon: TicketPlus, roles: ['employee'] },
  { href: '/tickets', label: 'Все заявки', icon: ClipboardList, roles: ['admin', 'director'] },
  { href: '/my-tickets', label: 'Мои заявки', icon: ClipboardList, roles: ['employee'] },
  { href: '/work', label: 'Мои задания', icon: Briefcase, roles: ['contractor'] },
  { href: '/expenses', label: 'Прочие расходы', icon: Receipt, roles: ['admin'] },
  { href: '/reports', label: 'Отчёты', icon: BarChart3, roles: ['admin', 'director'] },
  { href: '/stores', label: 'Магазины', icon: Store, roles: ['admin', 'director'] },
  { href: '/notifications', label: 'Уведомления', icon: Bell, roles: ['admin', 'director', 'employee', 'contractor'] },
  { type: 'divider' as const, roles: ['admin'] },
  { href: '/admin/users', label: 'Пользователи', icon: Users, roles: ['admin'] },
  { href: '/admin/divisions', label: 'Подразделения', icon: Building2, roles: ['admin'] },
  { href: '/admin/categories', label: 'Категории', icon: Tags, roles: ['admin'] },
  { href: '/admin/stores', label: 'Управление магазинами', icon: Store, roles: ['admin'] },
]

export function Sidebar({ userRole, userName }: SidebarProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)

  const filteredItems = navItems.filter(item => item.roles.includes(userRole))

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col h-screen sticky top-0 border-r border-border',
        'bg-surface-card/50 glass transition-all duration-300',
        collapsed ? 'w-[72px]' : 'w-[260px]'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <Image src="/logo-kari-icon.png" alt="Kari" width={32} height={32} className="flex-shrink-0" />
        {!collapsed && (
          <span className="text-heading-3 font-bold gradient-text">KariDesk</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'ml-auto p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-elevated/40 transition-all',
            collapsed && 'ml-0'
          )}
        >
          <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {filteredItems.map((item, i) => {
          if ('type' in item && item.type === 'divider') {
            return <div key={i} className="divider-gradient my-3" />
          }
          if (!('href' in item)) return null
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
                'text-body-sm font-medium',
                isActive
                  ? 'bg-accent/10 text-accent border border-accent/20 shadow-glow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={cn('w-5 h-5 flex-shrink-0', isActive && 'text-accent')} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-border p-3 space-y-2">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl',
            'text-body-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40 transition-all',
            collapsed && 'justify-center px-0'
          )}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          {!collapsed && <span>{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span>}
        </button>

        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl',
            'text-body-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40 transition-all',
            collapsed && 'justify-center px-0'
          )}
        >
          <Settings className="w-5 h-5" />
          {!collapsed && <span>Настройки</span>}
        </Link>

        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-elevated/30">
            <div className="w-8 h-8 rounded-full gradient-accent flex items-center justify-center text-white text-caption font-bold flex-shrink-0">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body-sm text-text-primary truncate">{userName}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
