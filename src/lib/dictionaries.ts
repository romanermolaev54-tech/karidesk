'use client'

import { createClient } from '@/lib/supabase/client'
import type { Store, Division, TicketCategory } from '@/types/database'

const TTL_MS = 10 * 60 * 1000 // 10 min — these change rarely

interface Cached<T> { ts: number; data: T }

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cached<T>
    if (Date.now() - parsed.ts > TTL_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

function write<T>(key: string, data: T) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch { /* noop */ }
}

const KEY_STORES = 'karidesk_dict_stores_v1'
const KEY_CATEGORIES = 'karidesk_dict_categories_v1'
const KEY_DIVISIONS = 'karidesk_dict_divisions_v1'

/**
 * Load stores: returns cached value immediately (or null), then triggers a fresh fetch
 * via onFresh. UI gets instant render + background refresh.
 */
export async function loadStoresCached(onFresh?: (stores: Store[]) => void): Promise<Store[]> {
  const cached = read<Store[]>(KEY_STORES)
  // Fire fresh fetch in the background
  ;(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('stores')
      .select('*, division:divisions(*)')
      .eq('is_active', true)
      .order('store_number')
    if (data) {
      write(KEY_STORES, data)
      onFresh?.(data as Store[])
    }
  })()
  return cached || []
}

export async function loadCategoriesCached(onFresh?: (cats: TicketCategory[]) => void): Promise<TicketCategory[]> {
  const cached = read<TicketCategory[]>(KEY_CATEGORIES)
  ;(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('ticket_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    if (data) {
      write(KEY_CATEGORIES, data)
      onFresh?.(data as TicketCategory[])
    }
  })()
  return cached || []
}

export async function loadDivisionsCached(onFresh?: (divs: Division[]) => void): Promise<Division[]> {
  const cached = read<Division[]>(KEY_DIVISIONS)
  ;(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('divisions')
      .select('*')
      .order('sort_order')
    if (data) {
      write(KEY_DIVISIONS, data)
      onFresh?.(data as Division[])
    }
  })()
  return cached || []
}

/** Force-clear caches (e.g. on logout or after admin edit). */
export function invalidateDictionaries() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(KEY_STORES)
    localStorage.removeItem(KEY_CATEGORIES)
    localStorage.removeItem(KEY_DIVISIONS)
  } catch { /* noop */ }
}
