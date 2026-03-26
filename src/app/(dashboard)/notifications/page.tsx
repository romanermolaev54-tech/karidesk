'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { formatRelative } from '@/lib/utils'
import Link from 'next/link'
import type { Notification } from '@/types/database'
import {
  BellOff,
  CheckCheck,
  Info,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react'

const TYPE_ICONS = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle,
  action_required: Clock,
}

const TYPE_COLORS = {
  info: 'text-blue-400 bg-blue-500/10',
  warning: 'text-amber-400 bg-amber-500/10',
  success: 'text-emerald-400 bg-emerald-500/10',
  action_required: 'text-accent bg-accent/10',
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const supabase = createClient()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    loadNotifications()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadNotifications() {
    if (!user) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setNotifications(data || [])
    setLoading(false)
  }

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  const markAllAsRead = async () => {
    if (!user) return
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading-2 text-text-primary">Уведомления</h1>
          <p className="text-body-sm text-text-tertiary">
            {unreadCount > 0 ? `${unreadCount} непрочитанных` : 'Все прочитано'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllAsRead}>
            <CheckCheck className="w-4 h-4" />
            Прочитать все
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="card-premium p-4 animate-pulse">
              <div className="h-4 bg-surface-elevated/60 rounded w-1/3 mb-2" />
              <div className="h-3 bg-surface-elevated/40 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="card-premium p-8 text-center">
          <BellOff className="w-12 h-12 mx-auto mb-3 text-text-tertiary opacity-40" />
          <p className="text-body text-text-secondary">Нет уведомлений</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(notif => {
            const Icon = TYPE_ICONS[notif.type]
            const colorClass = TYPE_COLORS[notif.type]
            return (
              <div
                key={notif.id}
                className={`card-premium p-4 transition-all ${!notif.is_read ? 'border-l-2 border-l-accent' : 'opacity-70'}`}
                onClick={() => !notif.is_read && markAsRead(notif.id)}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${colorClass}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-text-primary">{notif.title}</p>
                    <p className="text-caption text-text-secondary mt-0.5">{notif.message}</p>
                    <p className="text-micro text-text-tertiary mt-1">{formatRelative(notif.created_at)}</p>
                  </div>
                  {notif.ticket_id && (
                    <Link
                      href={`/tickets/${notif.ticket_id}`}
                      className="text-caption text-accent hover:underline flex-shrink-0"
                      onClick={e => e.stopPropagation()}
                    >
                      Открыть
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
