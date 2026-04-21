'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/Badge'
import { formatRelative, formatTicketNumber } from '@/lib/utils'
import { TICKET_PRIORITIES } from '@/lib/constants'
import Link from 'next/link'
import type { Ticket } from '@/types/database'
import {
  Inbox,
  ChevronRight,
  MapPin,
  Gavel,
  Shield,
} from 'lucide-react'

export default function ApprovalsPage() {
  const { profile, isAdmin, isDirector } = useAuth()
  const supabase = createClient()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('tickets')
      .select(`
        *,
        store:stores(id, store_number, name, city),
        category:ticket_categories(id, name, icon, color),
        creator:profiles!tickets_created_by_fkey(id, full_name)
      `)
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false })

    if (isDirector && profile?.division_id) {
      query = query.eq('division_id', profile.division_id)
    }

    const { data } = await query
    setTickets(data || [])
    setLoading(false)
  }, [supabase, isDirector, profile?.division_id])

  useEffect(() => {
    load()
  }, [load])

  if (!isAdmin && !isDirector) {
    return (
      <div className="card-premium p-8 text-center animate-fade-in">
        <Shield className="w-12 h-12 mx-auto mb-3 text-text-tertiary opacity-40" />
        <p className="text-body text-text-secondary">Доступ только для администраторов и ДП</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-heading-2 text-text-primary flex items-center gap-2">
          <Gavel className="w-6 h-6 text-accent" />
          На согласовании
        </h1>
        <p className="text-body-sm text-text-tertiary">
          {loading ? 'Загрузка…' : tickets.length === 0 ? 'Ничего не требует согласования' : `${tickets.length} заявок на согласовании`}
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
      ) : tickets.length === 0 ? (
        <div className="card-premium p-8 text-center">
          <Inbox className="w-12 h-12 mx-auto mb-3 text-text-tertiary opacity-40" />
          <p className="text-body text-text-secondary">Все заявки обработаны</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map(t => {
            const priorityInfo = TICKET_PRIORITIES[t.priority]
            return (
              <Link
                key={t.id}
                href={`/tickets/${t.id}`}
                className="card-premium p-4 block hover:border-accent/40 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-body-sm font-semibold text-text-primary">
                        {formatTicketNumber(t.ticket_number)}
                      </p>
                      <Badge variant="warning" size="sm" dot>На согласовании</Badge>
                      {t.priority !== 'normal' && (
                        <Badge variant={priorityInfo.color as 'warning' | 'danger'} size="sm">
                          {priorityInfo.label}
                        </Badge>
                      )}
                    </div>
                    <p className="text-body-sm text-text-primary mt-1 line-clamp-2">{t.description}</p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {t.store && (
                        <span className="flex items-center gap-1 text-caption text-text-tertiary">
                          <MapPin className="w-3 h-3" />
                          {t.store.store_number} {t.store.name}
                        </span>
                      )}
                      <span className="text-caption text-text-tertiary">{formatRelative(t.created_at)}</span>
                      {t.creator && (
                        <span className="text-caption text-text-tertiary">от {t.creator.full_name}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-text-tertiary mt-1 flex-shrink-0" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
