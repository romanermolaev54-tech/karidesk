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
  Gavel,
  Route as RouteIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types/database'

interface SidebarProps {
  userRole: UserRole
  userName: string
  mobile?: boolean
  onNavigate?: () => void
}

const navItems = [
  { href: '/dashboard', label: 'Главная', icon: LayoutDashboard, roles: ['admin', 'director', 'employee', 'contractor'] },
  // Director also creates tickets now (2026-04-29) — they pre-file work that
  // crosses their desk before it ever reaches a magazine.
  { href: '/tickets/new', label: 'Новая заявка', icon: TicketPlus, roles: ['employee', 'director'] },
  { href: '/tickets', label: 'Все заявки', icon: ClipboardList, roles: ['admin', 'director'] },
  { href: '/approvals', label: 'На согласовании', icon: Gavel, roles: ['admin', 'director'] },
  { href: '/my-tickets', label: 'Мои заявки', icon: ClipboardList, roles: ['employee'] },
  { href: '/work', label: 'Мои задания', icon: Briefcase, roles: ['contractor'] },
  { href: '/expenses', label: 'Прочие расходы', icon: Receipt, roles: ['admin'] },
  { href: '/reports', label: 'Отчёты', icon: BarChart3, roles: ['admin', 'director'] },
  // /stores is the lightweight address/phone editor for ДП. Admin has the
  // full CRUD at /admin/stores below, so we don't show this lite version in
  // the admin sidebar — it was confusing to have both pointing at stores.
  { href: '/stores', label: 'Магазины', icon: Store, roles: ['director'] },
  { href: '/notifications', label: 'Уведомления', icon: Bell, roles: ['admin', 'director', 'employee', 'contractor'] },
  { type: 'divider' as const, roles: ['admin'] },
  { href: '/users', label: 'Пользователи', icon: Users, roles: ['admin', 'director'] },
  { type: 'divider' as const, roles: ['director'] },
  { href: '/admin/routes', label: 'Маршруты', icon: RouteIcon, roles: ['admin'] },
  { href: '/admin/divisions', label: 'Подразделения', icon: Building2, roles: ['admin'] },
  { href: '/admin/categories', label: 'Категории', icon: Tags, roles: ['admin'] },
  { href: '/admin/stores', label: 'Управление магазинами', icon: Store, roles: ['admin'] },
]

export function Sidebar({ userRole, userName, mobile = false, onNavigate }: SidebarProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const { profile, isAdmin, isDirector } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const isCollapsed = !mobile && collapsed

  // Approvals badge state — count of pending_approval tickets visible to this
  // user (RLS scopes to director's division automatically). For directors,
  // also track whether their own division has approval enabled at all — used
  // for the "Согласование сейчас выключено для вашего центра" tooltip on
  // sidebar hover.
  const [approvalsCount, setApprovalsCount] = useState(0)
  const [approvalsEnabledInMyDiv, setApprovalsEnabledInMyDiv] = useState<boolean | null>(null)

  useEffect(() => {
    if (!isAdmin && !isDirector) return
    const supabase = createClient()
    let cancelled = false

    const refreshCount = async () => {
      const { count } = await supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_approval')
      if (!cancelled) setApprovalsCount(count || 0)
    }

    const fetchDivisionFlag = async () => {
      if (!isDirector || !profile?.division_id) {
        setApprovalsEnabledInMyDiv(null)
        return
      }
      const { data } = await supabase
        .from('divisions')
        .select('requires_approval')
        .eq('id', profile.division_id)
        .single()
      if (!cancelled) {
        setApprovalsEnabledInMyDiv(
          data ? !!(data as { requires_approval: boolean }).requires_approval : null
        )
      }
    }

    refreshCount()
    fetchDivisionFlag()

    // Realtime: bump count on any tickets change. Cheap (single int update),
    // and the badge stays current even if a manager keeps the tab open all
    // day. RLS filters automatically, so directors don't see other divisions.
    const channel = supabase
      .channel('sidebar-approvals-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        refreshCount()
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [isAdmin, isDirector, profile?.division_id])

  // Per-item enrichment: badge count + tooltip text. Keyed by href so we can
  // attach to the right nav item without bloating the navItems array itself.
  const itemMeta: Record<string, { badge?: number; titleHint?: string | null }> = {
    '/approvals': {
      badge: approvalsCount > 0 ? approvalsCount : undefined,
      // Only show the "disabled" hint to a director whose own division has
      // approval turned off AND who currently has nothing to act on. Admin
      // always sees the tab as functional.
      titleHint:
        isDirector && approvalsEnabledInMyDiv === false && approvalsCount === 0
          ? 'Согласование сейчас выключено для вашего центра'
          : null,
    },
  }

  const filteredItems = navItems.filter(item => item.roles.includes(userRole))

  return (
    <aside
      className={cn(
        'flex flex-col h-screen border-r border-border',
        'bg-surface-card glass',
        mobile
          ? 'w-full'
          : cn('hidden lg:flex sticky top-0 transition-all duration-300', isCollapsed ? 'w-[72px]' : 'w-[260px]')
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <Image src="/logo-kari-icon.png" alt="Kari" width={32} height={32} className="flex-shrink-0" />
        {!isCollapsed && (
          <span className="text-heading-3 font-bold gradient-text">KariDesk</span>
        )}
        {!mobile && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'ml-auto p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-elevated/40 transition-all',
              isCollapsed && 'ml-0'
            )}
          >
            <ChevronLeft className={cn('w-4 h-4 transition-transform', isCollapsed && 'rotate-180')} />
          </button>
        )}
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
          const meta = itemMeta[item.href]
          // title= shows on hover (desktop) and on long-press (iOS). Falls back
          // to the label when the sidebar is collapsed so users see what the
          // icon means.
          const titleText = meta?.titleHint || (isCollapsed ? item.label : undefined)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onNavigate?.()}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
                'text-body-sm font-medium relative',
                isActive
                  ? 'bg-accent/10 text-accent border border-accent/20 shadow-glow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40',
                isCollapsed && 'justify-center px-0'
              )}
              title={titleText}
            >
              <Icon className={cn('w-5 h-5 flex-shrink-0', isActive && 'text-accent')} />
              {!isCollapsed && <span className="flex-1">{item.label}</span>}
              {/* Badge: small red pill with the pending count. Sits at the
                  right end when expanded, or floats top-right when collapsed
                  so the icon-only sidebar still surfaces the alert. */}
              {meta?.badge !== undefined && meta.badge > 0 && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold',
                    isCollapsed && 'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] text-[10px]'
                  )}
                >
                  {meta.badge > 99 ? '99+' : meta.badge}
                </span>
              )}
              {/* Hint dot: when this is the disabled-approvals scenario for a
                  director with nothing to do, show a tiny grey dot instead of
                  a red badge — purely informational, no urgency. */}
              {!isCollapsed && meta?.titleHint && meta.badge === undefined && (
                <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary/40" aria-hidden="true" />
              )}
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
            isCollapsed && 'justify-center px-0'
          )}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          {!isCollapsed && <span>{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span>}
        </button>

        <Link
          href="/settings"
          onClick={() => onNavigate?.()}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl',
            'text-body-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40 transition-all',
            isCollapsed && 'justify-center px-0'
          )}
        >
          <Settings className="w-5 h-5" />
          {!isCollapsed && <span>Настройки</span>}
        </Link>

        {!isCollapsed && (
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
