'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatRelative, formatTicketNumber } from '@/lib/utils'
import { TICKET_STATUSES, TICKET_PRIORITIES } from '@/lib/constants'
import Link from 'next/link'
import type { Ticket, TicketStatus } from '@/types/database'
import {
  Search,
  Filter,
  TicketPlus,
  MapPin,
  User,
  ChevronRight,
  ClipboardList,
  GitMerge,
  CheckSquare,
  Square,
  X,
  Route as RouteIcon,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import toast from 'react-hot-toast'
import type { Profile } from '@/types/database'

export default function TicketsPage() {
  const { profile, isAdmin, isDirector } = useAuth()
  const supabase = createClient()

  const searchParams = useSearchParams()
  const initialStatus = searchParams.get('status') as TicketStatus | null
  const initialPriority = searchParams.get('priority')

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>(initialStatus || 'all')
  const [priorityFilter, setPriorityFilter] = useState<string>(initialPriority || 'all')
  const [showFilters, setShowFilters] = useState(!!initialStatus || !!initialPriority)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mainTicketId, setMainTicketId] = useState<string>('')
  const [merging, setMerging] = useState(false)
  const [showRouteModal, setShowRouteModal] = useState(false)
  const [routeDate, setRouteDate] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [routeContractorId, setRouteContractorId] = useState<string>('')
  const [routeName, setRouteName] = useState('')
  const [routeOrderedIds, setRouteOrderedIds] = useState<string[]>([])
  const [contractors, setContractors] = useState<Profile[]>([])
  const [savingRoute, setSavingRoute] = useState(false)

  useEffect(() => {
    loadTickets()
  }, [statusFilter, priorityFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTickets() {
    setLoading(true)
    let query = supabase
      .from('tickets')
      .select(`
        *,
        store:stores(id, store_number, name, city),
        category:ticket_categories(id, name, icon, color),
        division:divisions(id, name),
        creator:profiles!tickets_created_by_fkey(id, full_name),
        assignee:profiles!tickets_assigned_to_fkey(id, full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(50)

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    } else {
      // Hide merged tickets from the default list — they belong to a parent
      query = query.neq('status', 'merged')
    }

    if (priorityFilter !== 'all') {
      query = query.eq('priority', priorityFilter)
    }

    // Directors see only their division
    if (isDirector && profile?.division_id) {
      query = query.eq('division_id', profile.division_id)
    }

    const { data } = await query
    setTickets(data || [])
    setLoading(false)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const selectedTickets = tickets.filter(t => selectedIds.has(t.id))
  const selectedStoreIds = new Set(selectedTickets.map(t => t.store_id))
  const sameStore = selectedStoreIds.size === 1
  const canMerge = selectedTickets.length >= 2 && sameStore

  const openRouteModal = async () => {
    if (selectedIds.size === 0) {
      toast.error('Выберите заявки для маршрута')
      return
    }
    if (contractors.length === 0) {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, phone, role, division_id, store_id, email, avatar_url, is_active, push_subscription, notification_preferences, created_at, updated_at')
        .eq('role', 'contractor')
        .eq('is_active', true)
      setContractors((data as Profile[] | null) || [])
      if (data && data.length > 0) setRouteContractorId(data[0].id)
    } else if (!routeContractorId) {
      setRouteContractorId(contractors[0].id)
    }
    // Initial order — order of selection in the list (UI-stable: use sorted by tickets array)
    const ordered = tickets.filter(t => selectedIds.has(t.id)).map(t => t.id)
    setRouteOrderedIds(ordered)
    setShowRouteModal(true)
  }

  const moveRouteItem = (idx: number, dir: -1 | 1) => {
    setRouteOrderedIds(prev => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  const saveRoute = async () => {
    if (!routeContractorId || !routeDate || routeOrderedIds.length === 0) {
      toast.error('Заполните исполнителя, дату и список заявок')
      return
    }
    setSavingRoute(true)
    const { data: route, error } = await supabase
      .from('routes')
      .insert({
        name: routeName.trim() || null,
        route_date: routeDate,
        assigned_to: routeContractorId,
        status: 'planned',
      })
      .select('id')
      .single()
    if (error || !route) {
      toast.error('Ошибка создания: ' + (error?.message || 'неизвестно'))
      setSavingRoute(false)
      return
    }
    const rows = routeOrderedIds.map((id, i) => ({
      route_id: route.id,
      ticket_id: id,
      position: i + 1,
    }))
    const { error: rtError } = await supabase.from('route_tickets').insert(rows)
    if (rtError) {
      toast.error('Ошибка: ' + rtError.message)
      setSavingRoute(false)
      return
    }
    // Assign tickets to the contractor if not already
    await supabase
      .from('tickets')
      .update({ assigned_to: routeContractorId, status: 'assigned', assigned_at: new Date().toISOString() })
      .in('id', routeOrderedIds)
      .in('status', ['new', 'pending_approval'])

    toast.success(`Маршрут создан (${rows.length} заявок)`)
    setSavingRoute(false)
    setShowRouteModal(false)
    exitSelectMode()
    loadTickets()
  }

  const openMergeModal = () => {
    if (!canMerge) {
      toast.error('Выберите 2+ заявок одного магазина')
      return
    }
    setMainTicketId(selectedTickets[0].id)
    setShowMergeModal(true)
  }

  const handleMerge = async () => {
    if (!mainTicketId) return
    setMerging(true)
    const main = selectedTickets.find(t => t.id === mainTicketId)
    const others = selectedTickets.filter(t => t.id !== mainTicketId)
    if (!main) { setMerging(false); return }

    // Append others' descriptions to main
    const appended = others
      .map(t => `\n— [#${t.ticket_number}] ${t.description}`)
      .join('')
    const { error: updateMainError } = await supabase
      .from('tickets')
      .update({ description: main.description + '\n\n--- Объединено ---' + appended })
      .eq('id', mainTicketId)

    if (updateMainError) {
      toast.error('Ошибка обновления главной: ' + updateMainError.message)
      setMerging(false)
      return
    }

    const { error: mergeError } = await supabase
      .from('tickets')
      .update({ status: 'merged', merged_into_id: mainTicketId })
      .in('id', others.map(t => t.id))

    if (mergeError) {
      toast.error('Ошибка объединения: ' + mergeError.message)
      setMerging(false)
      return
    }

    toast.success(`Объединено ${others.length + 1} заявок`)
    setMerging(false)
    setShowMergeModal(false)
    exitSelectMode()
    loadTickets()
  }

  const filtered = search.trim()
    ? tickets.filter(t =>
        t.ticket_number?.toString().includes(search) ||
        t.description.toLowerCase().includes(search.toLowerCase()) ||
        t.store?.name?.toLowerCase().includes(search.toLowerCase()) ||
        t.store?.store_number?.includes(search)
      )
    : tickets

  const statusCounts = tickets.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-heading-2 text-text-primary">Заявки</h1>
          <p className="text-body-sm text-text-tertiary">{tickets.length} заявок</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            selectMode ? (
              <Button variant="secondary" size="sm" onClick={exitSelectMode}>
                <X className="w-4 h-4" />
                Выход из выбора
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setSelectMode(true)}>
                <CheckSquare className="w-4 h-4" />
                Объединить
              </Button>
            )
          )}
          {(isAdmin || profile?.role === 'employee') && !selectMode && (
            <Link href="/tickets/new">
              <Button>
                <TicketPlus className="w-4 h-4" />
                Новая заявка
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Поиск по номеру, описанию, магазину..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface-muted/30 text-text-primary placeholder:text-text-tertiary text-body-sm focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40 transition-all"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-2.5 rounded-xl border transition-colors ${
            showFilters || statusFilter !== 'all'
              ? 'border-accent/40 bg-accent/5 text-accent'
              : 'border-border text-text-tertiary hover:border-border-strong'
          }`}
        >
          <Filter className="w-5 h-5" />
        </button>
      </div>

      {/* Status filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 animate-fade-in">
          <button
            onClick={() => { setStatusFilter('all'); setPriorityFilter('all') }}
            className={`px-3 py-1.5 rounded-lg text-body-sm font-medium transition-colors ${
              statusFilter === 'all' && priorityFilter === 'all'
                ? 'gradient-accent text-white'
                : 'bg-surface-elevated/40 text-text-tertiary hover:text-text-secondary'
            }`}
          >
            Все ({tickets.length})
          </button>
          <button
            onClick={() => { setPriorityFilter(priorityFilter === 'urgent' ? 'all' : 'urgent') }}
            className={`px-3 py-1.5 rounded-lg text-body-sm font-medium transition-colors ${
              priorityFilter === 'urgent'
                ? 'bg-red-500/80 text-white'
                : 'bg-surface-elevated/40 text-text-tertiary hover:text-text-secondary'
            }`}
          >
            Срочные
          </button>
          {(Object.keys(TICKET_STATUSES) as TicketStatus[]).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-body-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'gradient-accent text-white'
                  : 'bg-surface-elevated/40 text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {TICKET_STATUSES[status].label} ({statusCounts[status] || 0})
            </button>
          ))}
        </div>
      )}

      {/* Tickets list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card-premium p-4 animate-pulse">
              <div className="h-4 bg-surface-elevated/60 rounded w-1/3 mb-3" />
              <div className="h-3 bg-surface-elevated/40 rounded w-2/3 mb-2" />
              <div className="h-3 bg-surface-elevated/40 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-premium p-8 text-center">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 text-text-tertiary opacity-40" />
          <p className="text-body text-text-secondary">Заявок не найдено</p>
          {search && (
            <button onClick={() => setSearch('')} className="text-body-sm text-accent mt-2 hover:underline">
              Сбросить поиск
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(ticket => {
            const statusInfo = TICKET_STATUSES[ticket.status]
            const priorityInfo = TICKET_PRIORITIES[ticket.priority]
            const isSelected = selectedIds.has(ticket.id)
            const Wrapper = selectMode
              ? ({ children }: { children: React.ReactNode }) => (
                  <button
                    onClick={() => toggleSelect(ticket.id)}
                    className={`w-full text-left block card-interactive p-4 transition-all ${isSelected ? 'border-accent ring-2 ring-accent/15' : ''}`}
                  >
                    {children}
                  </button>
                )
              : ({ children }: { children: React.ReactNode }) => (
                  <Link href={`/tickets/${ticket.id}`} className="block card-interactive p-4 transition-all">
                    {children}
                  </Link>
                )
            return (
              <Wrapper key={ticket.id}>
                <div className="flex items-start justify-between gap-3">
                  {selectMode && (
                    <div className="flex-shrink-0 mt-1">
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-accent" />
                      ) : (
                        <Square className="w-5 h-5 text-text-tertiary" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-body-sm font-semibold text-accent/80">
                        {formatTicketNumber(ticket.ticket_number)}
                      </span>
                      <Badge
                        variant={statusInfo.color as 'info' | 'warning' | 'success' | 'danger' | 'accent'}
                        dot
                      >
                        {statusInfo.label}
                      </Badge>
                      {ticket.priority !== 'normal' && (
                        <Badge variant={priorityInfo.color as 'warning' | 'danger'}>
                          {priorityInfo.label}
                        </Badge>
                      )}
                    </div>
                    <p className="text-body-sm text-text-primary mt-1.5 line-clamp-2">
                      {ticket.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                      {ticket.store && (
                        <span className="flex items-center gap-1 text-caption text-text-tertiary">
                          <MapPin className="w-3 h-3" />
                          #{ticket.store.store_number} {ticket.store.name}
                        </span>
                      )}
                      {ticket.category && (
                        <span className="text-caption text-text-tertiary">
                          {ticket.category.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-caption text-text-tertiary">
                      {formatRelative(ticket.created_at)}
                    </span>
                    {ticket.assignee && (
                      <span className="flex items-center gap-1 text-caption text-text-tertiary">
                        <User className="w-3 h-3" />
                        {ticket.assignee.full_name?.split(' ')[0]}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-text-tertiary mt-1" />
                  </div>
                </div>
              </Wrapper>
            )
          })}
        </div>
      )}

      {/* Floating select-mode panel */}
      {selectMode && (
        <div className="fixed bottom-20 lg:bottom-4 left-1/2 -translate-x-1/2 z-40 card-premium px-4 py-3 flex items-center gap-3 shadow-lg">
          <span className="text-body-sm text-text-primary font-medium">
            Выбрано: {selectedIds.size}
          </span>
          {selectedIds.size >= 2 && !sameStore && (
            <span className="text-caption text-amber-400">Разные магазины</span>
          )}
          <Button size="sm" variant="secondary" onClick={openRouteModal} disabled={selectedIds.size === 0}>
            <RouteIcon className="w-4 h-4" />
            Маршрут
          </Button>
          <Button size="sm" onClick={openMergeModal} disabled={!canMerge}>
            <GitMerge className="w-4 h-4" />
            Объединить
          </Button>
        </div>
      )}

      {/* Route modal */}
      <Modal isOpen={showRouteModal} onClose={() => setShowRouteModal(false)} title="Создание маршрута">
        <div className="space-y-4">
          <p className="text-body-sm text-text-secondary">
            Расставьте заявки в порядке посещения. Исполнитель получит моментальное уведомление
            и увидит маршрут в своих заданиях.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-caption text-text-tertiary">Дата маршрута</span>
              <input
                type="date"
                value={routeDate}
                onChange={e => setRouteDate(e.target.value)}
                className="bg-surface-elevated/40 border border-surface-elevated/60 rounded-lg px-3 py-2 text-body-sm text-text-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-caption text-text-tertiary">Исполнитель</span>
              <select
                value={routeContractorId}
                onChange={e => setRouteContractorId(e.target.value)}
                className="bg-surface-elevated/40 border border-surface-elevated/60 rounded-lg px-3 py-2 text-body-sm text-text-primary"
              >
                {contractors.length === 0 && <option value="">Нет исполнителей</option>}
                {contractors.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-caption text-text-tertiary">Название (опционально)</span>
            <input
              type="text"
              value={routeName}
              onChange={e => setRouteName(e.target.value)}
              placeholder="Например: Юг Москвы"
              className="bg-surface-elevated/40 border border-surface-elevated/60 rounded-lg px-3 py-2 text-body-sm text-text-primary"
            />
          </label>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {routeOrderedIds.map((id, idx) => {
              const t = tickets.find(x => x.id === id)
              if (!t) return null
              return (
                <div key={id} className="flex items-center gap-2 p-3 rounded-xl border border-border bg-surface-elevated/20">
                  <span className="w-7 h-7 rounded-lg gradient-accent text-white text-caption font-bold flex items-center justify-center flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-semibold text-text-primary">
                      {formatTicketNumber(t.ticket_number)} · {t.store?.store_number} {t.store?.name}
                    </p>
                    <p className="text-caption text-text-secondary line-clamp-1">{t.description}</p>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={() => moveRouteItem(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 rounded text-text-tertiary hover:text-accent disabled:opacity-30"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveRouteItem(idx, 1)}
                      disabled={idx === routeOrderedIds.length - 1}
                      className="p-1 rounded text-text-tertiary hover:text-accent disabled:opacity-30"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowRouteModal(false)} className="flex-1">Отмена</Button>
            <Button onClick={saveRoute} loading={savingRoute} disabled={!routeContractorId || routeOrderedIds.length === 0} className="flex-1">
              <RouteIcon className="w-4 h-4" />
              Сохранить и отправить
            </Button>
          </div>
        </div>
      </Modal>

      {/* Merge modal */}
      <Modal isOpen={showMergeModal} onClose={() => setShowMergeModal(false)} title="Объединение заявок">
        <div className="space-y-4">
          <p className="text-body-sm text-text-secondary">
            Выберите главную заявку. Описания остальных будут добавлены к её описанию,
            а сами они получат статус «Объединена» и скроются из списка.
          </p>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {selectedTickets.map(t => (
              <label
                key={t.id}
                className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  mainTicketId === t.id ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/40'
                }`}
              >
                <input
                  type="radio"
                  name="main_ticket"
                  checked={mainTicketId === t.id}
                  onChange={() => setMainTicketId(t.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm font-semibold text-text-primary">
                    {formatTicketNumber(t.ticket_number)}
                  </p>
                  <p className="text-caption text-text-secondary line-clamp-2">{t.description}</p>
                  {t.category && (
                    <p className="text-micro text-text-tertiary mt-0.5">{t.category.name}</p>
                  )}
                </div>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowMergeModal(false)} className="flex-1">Отмена</Button>
            <Button onClick={handleMerge} loading={merging} disabled={!mainTicketId} className="flex-1">
              <GitMerge className="w-4 h-4" />
              Объединить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
