'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatRelative, formatTicketNumber } from '@/lib/utils'
import { TICKET_STATUSES, TICKET_PRIORITIES, PRIORITY_SHOWS_BADGE } from '@/lib/constants'
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
  const router = useRouter()
  const pathname = usePathname()

  const searchParams = useSearchParams()
  const initialStatus = searchParams.get('status') as TicketStatus | null
  const initialPriority = searchParams.get('priority')
  // ?emergency=1 — comes from the dashboard "Аварийные" tile.
  const initialEmergency = searchParams.get('emergency') === '1'
  // ?lifecycle=active|closed|all — top-level toggle. Defaults to "active"
  // so admins land on the working set, not on every closed ticket ever.
  // Specific ?status= (from dashboard drill-downs) overrides this.
  const initialLifecycleRaw = searchParams.get('lifecycle') as 'active' | 'closed' | 'all' | null
  const initialLifecycle: 'active' | 'closed' | 'all' = initialLifecycleRaw
    || (initialStatus ? 'all' : 'active')
  // Multi-select filters serialized as CSV in the URL — shareable links.
  const csvSet = (key: string) => new Set(
    (searchParams.get(key) || '').split(',').map(s => s.trim()).filter(Boolean)
  )
  // ?mode=merge|route — pre-enters selection mode with a specific purpose.
  // /admin/routes uses this to deep-link into "merge tickets" or
  // "build route" workflows directly.
  const initialMode = searchParams.get('mode') as 'merge' | 'route' | null

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // Lifecycle is the primary segmented control. specificStatus lets the user
  // (or a dashboard drill-down link) further narrow to a single status.
  const [lifecycle, setLifecycle] = useState<'active' | 'closed' | 'all'>(initialLifecycle)
  const [specificStatus, setSpecificStatus] = useState<TicketStatus | 'all'>(initialStatus || 'all')
  const [priorityFilter] = useState<string>(initialPriority || 'all') // legacy URL support
  // Composable filter dimensions — all AND-joined on the server.
  const [selectedStoreIds, setSelectedStoreIds] = useState<Set<string>>(csvSet('stores'))
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<Set<string>>(csvSet('divisions'))
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(csvSet('categories'))
  const [dateFrom, setDateFrom] = useState<string>(searchParams.get('from') || '')
  const [dateTo, setDateTo] = useState<string>(searchParams.get('to') || '')
  const [showFiltersModal, setShowFiltersModal] = useState(false)
  // Lookup data for the filter modal. Loaded once on mount.
  const [allStores, setAllStores] = useState<Array<{ id: string; store_number: string; name: string; division_id: string }>>([])
  const [allDivisions, setAllDivisions] = useState<Array<{ id: string; name: string }>>([])
  const [allCategories, setAllCategories] = useState<Array<{ id: string; name: string }>>([])
  const [storeSearchInModal, setStoreSearchInModal] = useState('')
  // Selection workflow has TWO purposes: merge (combine same-store duplicates)
  // and route (assign a contractor a multi-store run). They show different
  // filtered ticket lists and different action buttons.
  const [selectionPurpose, setSelectionPurpose] = useState<'merge' | 'route' | null>(initialMode)
  const selectMode = selectionPurpose !== null
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Route-only filters: division + category narrow tickets to one geographic
  // area + one work type so the contractor's day makes sense.
  const [emergencyOnly, setEmergencyOnly] = useState(initialEmergency)
  const [routeDivisionFilter, setRouteDivisionFilter] = useState<string>('all')
  const [routeCategoryFilter, setRouteCategoryFilter] = useState<string>('all')
  // Lookup data for the route filters' dropdowns.
  const [routeDivisions, setRouteDivisions] = useState<Array<{ id: string; name: string }>>([])
  const [routeCategories, setRouteCategories] = useState<Array<{ id: string; name: string }>>([])
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
  }, [lifecycle, specificStatus, priorityFilter, emergencyOnly,
      selectedStoreIds, selectedDivisionIds, selectedCategoryIds,
      dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load filter dictionaries once. Stores list scoped to user via RLS, so
  // a director only sees their own stores in the picker.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [storesRes, divsRes, catsRes] = await Promise.all([
        supabase.from('stores').select('id, store_number, name, division_id').eq('is_active', true).order('store_number'),
        supabase.from('divisions').select('id, name').order('sort_order'),
        supabase.from('ticket_categories').select('id, name').eq('is_active', true).order('sort_order'),
      ])
      if (cancelled) return
      if (storesRes.data) setAllStores(storesRes.data as Array<{ id: string; store_number: string; name: string; division_id: string }>)
      if (divsRes.data) setAllDivisions(divsRes.data)
      if (catsRes.data) setAllCategories(catsRes.data)
    })()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Statuses that count as "active workload" vs "closed history".
  const ACTIVE_STATUSES: TicketStatus[] = ['new', 'pending_approval', 'assigned', 'in_progress', 'info_requested', 'completed', 'partially_completed']
  const CLOSED_STATUSES: TicketStatus[] = ['verified', 'rejected']

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
      .limit(200) // Bumped from 50 — with proper filters in place, admin
                  // genuinely wants to see everything in the filtered scope.

    // Status filtering: specificStatus wins (drill-down from dashboard tile),
    // otherwise lifecycle decides between active / closed / all.
    if (specificStatus !== 'all') {
      query = query.eq('status', specificStatus)
    } else if (lifecycle === 'active') {
      query = query.in('status', ACTIVE_STATUSES)
    } else if (lifecycle === 'closed') {
      query = query.in('status', CLOSED_STATUSES)
    } else {
      // 'all' — still hide merged tickets, they belong to their parent.
      query = query.neq('status', 'merged')
    }

    if (priorityFilter !== 'all') {
      query = query.eq('priority', priorityFilter)
    }

    if (emergencyOnly) {
      query = query.eq('is_emergency', true)
    }

    // Multi-select dimensional filters, all composed via AND.
    if (selectedStoreIds.size > 0) query = query.in('store_id', Array.from(selectedStoreIds))
    if (selectedDivisionIds.size > 0) query = query.in('division_id', Array.from(selectedDivisionIds))
    if (selectedCategoryIds.size > 0) query = query.in('category_id', Array.from(selectedCategoryIds))
    if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00Z')
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59Z')

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

  const enterSelectMode = (purpose: 'merge' | 'route') => {
    setSelectionPurpose(purpose)
    setSelectedIds(new Set())
    if (purpose === 'route') {
      // Load filter dictionaries lazily on first entry — these don't change
      // often, so a single fetch per session is fine.
      if (routeDivisions.length === 0) {
        supabase.from('divisions').select('id, name').order('sort_order')
          .then(({ data }) => { if (data) setRouteDivisions(data) })
      }
      if (routeCategories.length === 0) {
        supabase.from('ticket_categories').select('id, name').eq('is_active', true).order('sort_order')
          .then(({ data }) => { if (data) setRouteCategories(data) })
      }
    }
  }

  const exitSelectMode = () => {
    setSelectionPurpose(null)
    setSelectedIds(new Set())
    setRouteDivisionFilter('all')
    setRouteCategoryFilter('all')
  }

  // If user landed via ?mode=…, lazy-load route filter dictionaries on mount.
  useEffect(() => {
    if (initialMode === 'route') {
      if (routeDivisions.length === 0) {
        supabase.from('divisions').select('id, name').order('sort_order')
          .then(({ data }) => { if (data) setRouteDivisions(data) })
      }
      if (routeCategories.length === 0) {
        supabase.from('ticket_categories').select('id, name').eq('is_active', true).order('sort_order')
          .then(({ data }) => { if (data) setRouteCategories(data) })
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the URL in sync with filter state. Lets the user refresh / share a
  // filtered view URL ("заявки за апрель в категории Электрика по моему центру").
  // Uses router.replace so we don't pollute browser history with every tweak.
  useEffect(() => {
    const params = new URLSearchParams()
    if (lifecycle !== 'active') params.set('lifecycle', lifecycle)
    if (specificStatus !== 'all') params.set('status', specificStatus)
    if (emergencyOnly) params.set('emergency', '1')
    if (selectedStoreIds.size > 0) params.set('stores', Array.from(selectedStoreIds).join(','))
    if (selectedDivisionIds.size > 0) params.set('divisions', Array.from(selectedDivisionIds).join(','))
    if (selectedCategoryIds.size > 0) params.set('categories', Array.from(selectedCategoryIds).join(','))
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo) params.set('to', dateTo)
    if (selectionPurpose) params.set('mode', selectionPurpose)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [lifecycle, specificStatus, emergencyOnly,
      selectedStoreIds, selectedDivisionIds, selectedCategoryIds,
      dateFrom, dateTo, selectionPurpose]) // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: total count of active dimensional filters (for the Фильтры button badge)
  const activeFiltersCount =
    selectedStoreIds.size > 0 ? 1 : 0
    + (selectedDivisionIds.size > 0 ? 1 : 0)
    + (selectedCategoryIds.size > 0 ? 1 : 0)
    + (dateFrom ? 1 : 0)
    + (dateTo ? 1 : 0)
    + (specificStatus !== 'all' ? 1 : 0)
    + (emergencyOnly ? 1 : 0)
  const hasAnyFilter = activeFiltersCount > 0

  const selectedTickets = tickets.filter(t => selectedIds.has(t.id))
  const selectedTicketStoreIds = new Set(selectedTickets.map(t => t.store_id))
  const sameStore = selectedTicketStoreIds.size === 1
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
      // Roll back the orphan route so we don't leave junk
      await supabase.from('routes').delete().eq('id', route.id)
      toast.error('Ошибка: ' + rtError.message)
      setSavingRoute(false)
      return
    }
    // Assign tickets to the contractor if not already (best-effort, errors are non-fatal here)
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
    const others = selectedTickets.filter(t => t.id !== mainTicketId)
    if (others.length === 0) { setMerging(false); return }

    const { error } = await supabase.rpc('merge_tickets', {
      main_id: mainTicketId,
      other_ids: others.map(t => t.id),
    })

    setMerging(false)
    if (error) {
      toast.error('Ошибка объединения: ' + error.message)
      return
    }
    toast.success(`Объединено ${others.length + 1} заявок`)
    setShowMergeModal(false)
    exitSelectMode()
    loadTickets()
  }

  // In selectMode (merge / route building) only active tickets make sense —
  // hide closed/rejected/merged so admin can't accidentally bundle a finished ticket.
  const ACTIVE_FOR_SELECT: TicketStatus[] = ['new', 'pending_approval', 'assigned', 'in_progress', 'info_requested']
  let sourceTickets = selectMode
    ? tickets.filter(t => ACTIVE_FOR_SELECT.includes(t.status))
    : tickets

  // Merge purpose: only show tickets from stores that have ≥2 active tickets
  // — merging a single-ticket store is impossible by definition, so hiding
  // them removes noise.
  if (selectionPurpose === 'merge') {
    const counts = new Map<string, number>()
    for (const t of sourceTickets) counts.set(t.store_id, (counts.get(t.store_id) || 0) + 1)
    sourceTickets = sourceTickets.filter(t => (counts.get(t.store_id) || 0) >= 2)
  }

  // Route purpose: optional division + category narrowing so admin sees one
  // geographic side / one work type at a time when planning a contractor day.
  if (selectionPurpose === 'route') {
    if (routeDivisionFilter !== 'all') {
      sourceTickets = sourceTickets.filter(t => t.division_id === routeDivisionFilter)
    }
    if (routeCategoryFilter !== 'all') {
      sourceTickets = sourceTickets.filter(t => t.category_id === routeCategoryFilter)
    }
  }

  const filtered = search.trim()
    ? sourceTickets.filter(t =>
        t.ticket_number?.toString().includes(search) ||
        t.description.toLowerCase().includes(search.toLowerCase()) ||
        t.store?.name?.toLowerCase().includes(search.toLowerCase()) ||
        t.store?.store_number?.includes(search)
      )
    : sourceTickets

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-heading-2 text-text-primary">
            Заявки
            {selectionPurpose === 'merge' && <span className="ml-2 text-body-sm font-medium text-amber-400">· объединение</span>}
            {selectionPurpose === 'route' && <span className="ml-2 text-body-sm font-medium text-violet-400">· маршрут</span>}
          </h1>
          <p className="text-body-sm text-text-tertiary">
            {selectionPurpose === 'merge' && 'Выберите 2+ заявки одного магазина и нажмите «Объединить».'}
            {selectionPurpose === 'route' && 'Отфильтруйте по подразделению и категории, отметьте заявки и постройте маршрут исполнителю.'}
            {!selectionPurpose && `${tickets.length} заявок`}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            selectMode ? (
              <Button variant="secondary" size="sm" onClick={exitSelectMode}>
                <X className="w-4 h-4" />
                Выход из выбора
              </Button>
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={() => enterSelectMode('merge')}>
                  <GitMerge className="w-4 h-4" />
                  Объединить
                </Button>
                <Button variant="secondary" size="sm" onClick={() => enterSelectMode('route')}>
                  <RouteIcon className="w-4 h-4" />
                  Маршрут
                </Button>
              </>
            )
          )}
          {/* "Новая заявка" — only for employees. Admin's flow on this page is
              managing tickets, not creating; admin/director have other entry
              points (dashboard or direct URL). */}
          {profile?.role === 'employee' && !selectMode && (
            <Link href="/tickets/new">
              <Button>
                <TicketPlus className="w-4 h-4" />
                Новая заявка
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Route mode: division + category filter strip */}
      {selectionPurpose === 'route' && (
        <div className="card-premium p-3 flex flex-wrap gap-2 items-center">
          <span className="text-caption text-text-tertiary">Сузить:</span>
          <select
            value={routeDivisionFilter}
            onChange={e => setRouteDivisionFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-border bg-surface-muted/30 text-text-primary text-body-sm focus:outline-none focus:ring-2 focus:ring-accent/15"
          >
            <option value="all">Все подразделения</option>
            {routeDivisions.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select
            value={routeCategoryFilter}
            onChange={e => setRouteCategoryFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-border bg-surface-muted/30 text-text-primary text-body-sm focus:outline-none focus:ring-2 focus:ring-accent/15"
          >
            <option value="all">Все категории</option>
            {routeCategories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {(routeDivisionFilter !== 'all' || routeCategoryFilter !== 'all') && (
            <button
              onClick={() => { setRouteDivisionFilter('all'); setRouteCategoryFilter('all') }}
              className="text-caption text-text-tertiary hover:text-text-primary"
            >
              Сбросить
            </button>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
        <input
          type="text"
          placeholder="Поиск по номеру, описанию, магазину..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface-muted/30 text-text-primary placeholder:text-text-tertiary text-body-sm focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40 transition-all"
        />
      </div>

      {/* Lifecycle segmented control + Filters button */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex p-1 rounded-xl bg-surface-elevated/30 border border-border">
          {([
            { value: 'active' as const, label: 'Активные' },
            { value: 'closed' as const, label: 'Завершённые' },
            { value: 'all' as const, label: 'Все' },
          ]).map(seg => (
            <button
              key={seg.value}
              onClick={() => { setLifecycle(seg.value); setSpecificStatus('all') }}
              className={`px-3 py-1.5 rounded-lg text-body-sm font-medium transition-colors ${
                lifecycle === seg.value && specificStatus === 'all'
                  ? 'gradient-accent text-white shadow-glow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {seg.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowFiltersModal(true)}
          className={`px-3 py-2 rounded-xl border text-body-sm font-medium flex items-center gap-1.5 transition-colors ${
            hasAnyFilter
              ? 'border-accent/40 bg-accent/5 text-accent'
              : 'border-border text-text-tertiary hover:border-border-strong hover:text-text-primary'
          }`}
        >
          <Filter className="w-4 h-4" />
          Фильтры
          {hasAnyFilter && (
            <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-bold">
              {activeFiltersCount}
            </span>
          )}
        </button>
        <span className="ml-auto text-caption text-text-tertiary">
          Найдено: {tickets.length}
        </span>
      </div>

      {/* Active filter chips — quick-remove individual filters */}
      {hasAnyFilter && (
        <div className="flex flex-wrap gap-1.5">
          {specificStatus !== 'all' && (
            <FilterChip label={`Статус: ${TICKET_STATUSES[specificStatus].label}`} onRemove={() => setSpecificStatus('all')} />
          )}
          {emergencyOnly && (
            <FilterChip label="🚨 Аварийные" onRemove={() => setEmergencyOnly(false)} />
          )}
          {selectedDivisionIds.size > 0 && (
            <FilterChip
              label={`🏬 ${selectedDivisionIds.size === 1 ? allDivisions.find(d => d.id === Array.from(selectedDivisionIds)[0])?.name || '1 центр' : `${selectedDivisionIds.size} центра`}`}
              onRemove={() => setSelectedDivisionIds(new Set())}
            />
          )}
          {selectedStoreIds.size > 0 && (
            <FilterChip
              label={`🏪 ${selectedStoreIds.size === 1 ? `#${allStores.find(s => s.id === Array.from(selectedStoreIds)[0])?.store_number || ''}` : `${selectedStoreIds.size} магазинов`}`}
              onRemove={() => setSelectedStoreIds(new Set())}
            />
          )}
          {selectedCategoryIds.size > 0 && (
            <FilterChip
              label={`🏷 ${selectedCategoryIds.size === 1 ? allCategories.find(c => c.id === Array.from(selectedCategoryIds)[0])?.name || '1 категория' : `${selectedCategoryIds.size} категорий`}`}
              onRemove={() => setSelectedCategoryIds(new Set())}
            />
          )}
          {(dateFrom || dateTo) && (
            <FilterChip
              label={`📅 ${dateFrom || '…'} — ${dateTo || '…'}`}
              onRemove={() => { setDateFrom(''); setDateTo('') }}
            />
          )}
          <button
            onClick={() => {
              setSpecificStatus('all'); setEmergencyOnly(false)
              setSelectedDivisionIds(new Set()); setSelectedStoreIds(new Set()); setSelectedCategoryIds(new Set())
              setDateFrom(''); setDateTo('')
            }}
            className="text-caption text-text-tertiary hover:text-text-primary px-2 py-1 underline-offset-2 hover:underline"
          >
            Сбросить всё
          </button>
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
                      {/* For "new" tickets the status "Новая" is redundant —
                          everyone knows it's new. Show the category instead so
                          admin can route to the right contractor at a glance.
                          For other statuses (assigned, in_progress, completed,
                          etc.) keep the status badge — that's the salient info. */}
                      {ticket.status === 'new' && ticket.category ? (
                        <span
                          className="px-2 py-0.5 rounded-md text-caption font-semibold"
                          style={{
                            backgroundColor: (ticket.category.color || '#64748B') + '20',
                            color: ticket.category.color || '#94a3b8',
                          }}
                        >
                          {ticket.category.name}
                        </span>
                      ) : (
                        <Badge
                          variant={statusInfo.color as 'info' | 'warning' | 'success' | 'danger' | 'accent'}
                          dot
                        >
                          {statusInfo.label}
                        </Badge>
                      )}
                      {PRIORITY_SHOWS_BADGE[ticket.priority] && (
                        <Badge variant={priorityInfo.color as 'warning' | 'danger'}>
                          {priorityInfo.label}
                        </Badge>
                      )}
                      {ticket.is_emergency && (
                        <span className="px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 text-[10px] font-bold uppercase tracking-wide">
                          🚨 Авария
                        </span>
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
                      {/* Hide category here when it's already shown as the
                          badge above (status='new' replaces "Новая" with
                          the category) — avoids duplication. */}
                      {ticket.category && ticket.status !== 'new' && (
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

      {/* Floating select-mode panel — shows only the action relevant to the
          current purpose, plus a hint when the selection isn't valid yet. */}
      {selectMode && (
        <div className="fixed bottom-20 lg:bottom-4 left-1/2 -translate-x-1/2 z-40 card-premium px-4 py-3 flex items-center gap-3 shadow-lg">
          <span className="text-body-sm text-text-primary font-medium">
            Выбрано: {selectedIds.size}
          </span>
          {selectionPurpose === 'merge' && selectedIds.size >= 2 && !sameStore && (
            <span className="text-caption text-amber-400">Разные магазины</span>
          )}
          {selectionPurpose === 'merge' ? (
            <Button size="sm" onClick={openMergeModal} disabled={!canMerge}>
              <GitMerge className="w-4 h-4" />
              Объединить
            </Button>
          ) : (
            <Button size="sm" onClick={openRouteModal} disabled={selectedIds.size === 0}>
              <RouteIcon className="w-4 h-4" />
              Создать маршрут
            </Button>
          )}
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

      {/* Master filters modal: stores / divisions / categories / dates / status / emergency */}
      <Modal isOpen={showFiltersModal} onClose={() => setShowFiltersModal(false)} title="Фильтры" size="lg">
        <div className="space-y-5">
          {/* Подразделения */}
          {allDivisions.length > 0 && (
            <div>
              <label className="block text-body-sm font-medium text-text-secondary mb-2">Подразделения</label>
              <div className="flex flex-wrap gap-1.5">
                {allDivisions.map(d => {
                  const on = selectedDivisionIds.has(d.id)
                  return (
                    <button
                      key={d.id}
                      onClick={() => {
                        const next = new Set(selectedDivisionIds)
                        if (on) next.delete(d.id); else next.add(d.id)
                        setSelectedDivisionIds(next)
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-caption font-medium border transition-colors ${
                        on
                          ? 'border-accent/40 bg-accent/10 text-accent'
                          : 'border-border text-text-tertiary hover:border-border-strong hover:text-text-secondary'
                      }`}
                    >
                      {d.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Магазины — поиск + чипы */}
          <div>
            <label className="block text-body-sm font-medium text-text-secondary mb-2">
              Магазины
              {selectedStoreIds.size > 0 && (
                <span className="text-caption text-accent ml-2">выбрано {selectedStoreIds.size}</span>
              )}
            </label>
            <input
              type="text"
              placeholder="Найти по номеру или названию…"
              value={storeSearchInModal}
              onChange={e => setStoreSearchInModal(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface-muted/30 text-text-primary text-body-sm mb-2"
            />
            <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-1 space-y-0.5">
              {allStores
                .filter(s => {
                  // If divisions are selected, only show stores in those divisions
                  if (selectedDivisionIds.size > 0 && !selectedDivisionIds.has(s.division_id)) return false
                  if (!storeSearchInModal.trim()) return true
                  const q = storeSearchInModal.toLowerCase()
                  return s.store_number.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
                })
                .slice(0, 200)
                .map(s => {
                  const on = selectedStoreIds.has(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        const next = new Set(selectedStoreIds)
                        if (on) next.delete(s.id); else next.add(s.id)
                        setSelectedStoreIds(next)
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-md text-body-sm transition-colors flex items-center justify-between ${
                        on ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-surface-elevated/40 hover:text-text-primary'
                      }`}
                    >
                      <span>#{s.store_number} {s.name}</span>
                      {on && <span className="text-caption">✓</span>}
                    </button>
                  )
                })}
              {allStores.length > 0 && allStores.filter(s => {
                if (selectedDivisionIds.size > 0 && !selectedDivisionIds.has(s.division_id)) return false
                if (!storeSearchInModal.trim()) return true
                const q = storeSearchInModal.toLowerCase()
                return s.store_number.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
              }).length === 0 && (
                <p className="text-caption text-text-tertiary text-center py-4">Ничего не найдено</p>
              )}
            </div>
          </div>

          {/* Категории */}
          {allCategories.length > 0 && (
            <div>
              <label className="block text-body-sm font-medium text-text-secondary mb-2">Категории</label>
              <div className="flex flex-wrap gap-1.5">
                {allCategories.map(c => {
                  const on = selectedCategoryIds.has(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        const next = new Set(selectedCategoryIds)
                        if (on) next.delete(c.id); else next.add(c.id)
                        setSelectedCategoryIds(next)
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-caption font-medium border transition-colors ${
                        on
                          ? 'border-accent/40 bg-accent/10 text-accent'
                          : 'border-border text-text-tertiary hover:border-border-strong hover:text-text-secondary'
                      }`}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Период */}
          <div>
            <label className="block text-body-sm font-medium text-text-secondary mb-2">Период (по дате создания)</label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-caption text-text-tertiary">С</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border bg-surface-muted/30 text-text-primary text-body-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-caption text-text-tertiary">По</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border bg-surface-muted/30 text-text-primary text-body-sm"
                />
              </label>
            </div>
          </div>

          {/* Конкретный статус (drill-down) + аварийные */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-body-sm font-medium text-text-secondary mb-2">Конкретный статус</label>
              <select
                value={specificStatus}
                onChange={e => setSpecificStatus(e.target.value as TicketStatus | 'all')}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface-muted/30 text-text-primary text-body-sm"
              >
                <option value="all">Любой</option>
                {(Object.keys(TICKET_STATUSES) as TicketStatus[]).map(s => (
                  <option key={s} value={s}>{TICKET_STATUSES[s].label}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer self-end px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/5">
              <input
                type="checkbox"
                checked={emergencyOnly}
                onChange={e => setEmergencyOnly(e.target.checked)}
                className="w-4 h-4 accent-red-500"
              />
              <span className="text-body-sm font-medium text-text-primary">🚨 Только аварийные</span>
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setSpecificStatus('all'); setEmergencyOnly(false)
                setSelectedDivisionIds(new Set()); setSelectedStoreIds(new Set()); setSelectedCategoryIds(new Set())
                setDateFrom(''); setDateTo('')
              }}
              className="flex-1"
            >
              Сбросить
            </Button>
            <Button onClick={() => setShowFiltersModal(false)} className="flex-1">
              Применить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/** Removable filter chip — small pill with × button. */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent/10 text-accent text-caption font-medium">
      {label}
      <button
        onClick={onRemove}
        className="rounded-sm hover:bg-accent/15 px-0.5"
        title="Снять фильтр"
      >
        ×
      </button>
    </span>
  )
}
