'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/Badge'
import { formatTicketNumber } from '@/lib/utils'
import Link from 'next/link'
import type { Route, Ticket } from '@/types/database'
import toast from 'react-hot-toast'
import {
  Calendar,
  Route as RouteIcon,
  Shield,
  User,
  MapPin,
  Trash2,
  Inbox,
} from 'lucide-react'

type RouteWithTickets = Route & {
  tickets: { position: number; ticket: Ticket }[]
  assignee: { full_name: string } | null
}

export default function RoutesPage() {
  const { isAdmin } = useAuth()
  const supabase = createClient()
  const [routes, setRoutes] = useState<RouteWithTickets[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('routes')
      .select(`
        *,
        assignee:profiles!routes_assigned_to_fkey(full_name),
        tickets:route_tickets(
          position,
          ticket:tickets(id, ticket_number, description, status, store:stores(store_number, name, city))
        )
      `)
      .order('route_date', { ascending: false })
      .limit(50)

    const normalized = (data || []).map(r => ({
      ...r,
      tickets: (r.tickets || []).sort((a: { position: number }, b: { position: number }) => a.position - b.position),
    })) as unknown as RouteWithTickets[]
    setRoutes(normalized)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const deleteRoute = async (routeId: string) => {
    if (!confirm('Удалить маршрут? Назначенные заявки останутся за исполнителем.')) return
    const { error } = await supabase.from('routes').delete().eq('id', routeId)
    if (error) {
      toast.error('Ошибка: ' + error.message)
      return
    }
    toast.success('Маршрут удалён')
    load()
  }

  if (!isAdmin) {
    return (
      <div className="card-premium p-8 text-center animate-fade-in">
        <Shield className="w-12 h-12 mx-auto mb-3 text-text-tertiary opacity-40" />
        <p className="text-body text-text-secondary">Доступ только для администраторов</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-heading-2 text-text-primary flex items-center gap-2">
          <RouteIcon className="w-6 h-6 text-accent" />
          Маршруты исполнителей
        </h1>
        <p className="text-body-sm text-text-tertiary">
          Маршруты создаются из списка заявок: выбери несколько и нажми «Маршрут».
        </p>
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
      ) : routes.length === 0 ? (
        <div className="card-premium p-8 text-center">
          <Inbox className="w-12 h-12 mx-auto mb-3 text-text-tertiary opacity-40" />
          <p className="text-body text-text-secondary">Маршрутов пока нет</p>
          <Link href="/tickets" className="text-body-sm text-accent hover:underline mt-2 inline-block">
            Перейти к заявкам
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map(r => {
            const d = new Date(r.route_date + 'T00:00:00')
            const dateLabel = d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'short' })
            const statusLabels: Record<string, string> = {
              planned: 'Запланирован',
              in_progress: 'В работе',
              completed: 'Завершён',
              cancelled: 'Отменён',
            }
            return (
              <div key={r.id} className="card-premium p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Calendar className="w-4 h-4 text-accent flex-shrink-0" />
                      <span className="text-body-sm font-semibold text-text-primary">{dateLabel}</span>
                      <Badge variant={r.status === 'in_progress' ? 'accent' : r.status === 'completed' ? 'success' : 'info'} size="sm">
                        {statusLabels[r.status]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-caption text-text-tertiary flex-wrap">
                      {r.assignee && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {r.assignee.full_name}
                        </span>
                      )}
                      <span>{r.tickets.length} заявок</span>
                      {r.name && <span>· {r.name}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteRoute(r.id)}
                    className="p-2 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger/5 transition-colors flex-shrink-0"
                    title="Удалить маршрут"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-1">
                  {r.tickets.map((rt, idx) => {
                    const t = rt.ticket
                    if (!t) return null
                    return (
                      <Link
                        key={t.id}
                        href={`/tickets/${t.id}`}
                        className="flex items-center gap-3 p-2 rounded-lg bg-surface-elevated/20 hover:bg-surface-elevated/40 transition-colors"
                      >
                        <span className="w-6 h-6 rounded-md bg-accent/20 text-accent text-micro font-bold flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-caption font-semibold text-accent/80 flex-shrink-0">
                          {formatTicketNumber(t.ticket_number)}
                        </span>
                        <span className="text-caption text-text-primary truncate">
                          <MapPin className="w-3 h-3 inline text-text-tertiary" /> #{t.store?.store_number} {t.store?.name}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
