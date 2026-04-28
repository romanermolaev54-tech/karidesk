'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import type { Store, TicketCategory } from '@/types/database'
import {
  ArrowLeft,
  ArrowRight,
  Search,
  MapPin,
  Camera,
  X,
  Check,
  Phone,
  Wrench,
  Zap,
  Store as StoreIcon,
  Snowflake,
  Package,
  Truck,
  Droplets,
  AlertTriangle,
  Upload,
  Building2,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { formatTicketNumber, formatRelative } from '@/lib/utils'
import { TICKET_STATUSES } from '@/lib/constants'
import type { TicketStatus } from '@/types/database'
import { compressImage } from '@/lib/image'
import { loadStoresCached, loadCategoriesCached } from '@/lib/dictionaries'
import toast from 'react-hot-toast'

interface StoreTicketMini {
  id: string
  ticket_number: number
  description: string
  status: TicketStatus
  created_at: string
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Wrench, Zap, Store: StoreIcon, Snowflake, Package, Truck, Droplets, AlertTriangle,
}

type Step = 1 | 2 | 3 | 4

export default function NewTicketPage() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const supabase = createClient()

  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [stores, setStores] = useState<Store[]>([])
  const [categories, setCategories] = useState<TicketCategory[]>([])
  const [storeSearch, setStoreSearch] = useState('')
  const [filteredStores, setFilteredStores] = useState<Store[]>([])

  // Form state
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<TicketCategory | null>(null)
  const [description, setDescription] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  // Magazines pick between two levels only — "Срочный" used to be here but
  // was abused; truly emergency tickets are determined by category.is_emergency
  // (or admin manually flagging) instead.
  const [priority, setPriority] = useState<'normal' | 'high'>('normal')
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [storeHistory, setStoreHistory] = useState<StoreTicketMini[]>([])
  const [storeHistoryLoading, setStoreHistoryLoading] = useState(false)
  const [storeHistoryOpen, setStoreHistoryOpen] = useState(false)

  // AI description-quality check (DeepSeek, debounced).
  // Stays optional and silent: if it fails, the form just doesn't show hints.
  const [aiResult, setAiResult] = useState<{
    ok: boolean
    missing: string[]
    suggest_photo: boolean
    photo_reason: string | null
  } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiDismissed, setAiDismissed] = useState(false)

  // Load stores and categories — cached, then refreshed in background
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [cachedStores, cachedCats] = await Promise.all([
        loadStoresCached(fresh => { if (!cancelled) setStores(fresh) }),
        loadCategoriesCached(fresh => { if (!cancelled) setCategories(fresh) }),
      ])
      if (!cancelled) {
        if (cachedStores.length) setStores(cachedStores)
        if (cachedCats.length) setCategories(cachedCats)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Set contact phone from profile
  useEffect(() => {
    if (profile?.phone) setContactPhone(profile.phone)
  }, [profile])

  // Load recent tickets for selected store
  useEffect(() => {
    if (!selectedStore) {
      setStoreHistory([])
      setStoreHistoryOpen(false)
      return
    }
    setStoreHistoryLoading(true)
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
    supabase
      .from('tickets')
      .select('id, ticket_number, description, status, created_at')
      .eq('store_id', selectedStore.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setStoreHistory(data || [])
        setStoreHistoryLoading(false)
      })
  }, [selectedStore, supabase])

  // Filter stores
  useEffect(() => {
    if (!storeSearch.trim()) {
      setFilteredStores(stores.slice(0, 20))
      return
    }
    const q = storeSearch.toLowerCase()
    const filtered = stores.filter(s =>
      s.store_number.includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.city?.toLowerCase().includes(q)
    )
    setFilteredStores(filtered.slice(0, 20))
  }, [storeSearch, stores])

  const handlePhotoAdd = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files || [])
    if (photos.length + rawFiles.length > 5) return
    e.target.value = ''
    const compressed = await Promise.all(rawFiles.map(f => compressImage(f).catch(() => f)))
    setPhotos(prev => [...prev, ...compressed])
    compressed.forEach(file => {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPhotoPreviews(prev => [...prev, reader.result as string])
      }
      reader.readAsDataURL(file)
    })
  }, [photos.length])

  const removePhoto = useCallback((index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index))
  }, [])

  // Debounced AI description check.
  // Fires 1.5s after the user stops typing, only on step 3 (where the
  // description textarea actually exists), only when there's a category
  // selected (we send it to the model for context), and only when the input
  // is meaningful (>= 10 chars). All AI errors are swallowed silently — the
  // form keeps working exactly as before.
  useEffect(() => {
    if (step !== 3) return
    if (aiDismissed) return
    const trimmed = description.trim()
    if (trimmed.length < 10 || !selectedCategory) {
      setAiResult(null)
      setAiLoading(false)
      return
    }

    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      setAiLoading(true)
      try {
        const res = await fetch('/api/ai/check-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: ctrl.signal,
          body: JSON.stringify({
            category_id: selectedCategory.id,
            category_name: selectedCategory.name,
            description: trimmed,
            has_photos: photos.length > 0,
          }),
        })
        if (!res.ok) { setAiResult(null); return }
        const data = await res.json() as {
          result?: { ok: boolean; missing: string[]; suggest_photo: boolean; photo_reason: string | null }
          skipped?: boolean
        }
        if (data.skipped || !data.result) { setAiResult(null); return }
        setAiResult(data.result)
      } catch {
        setAiResult(null)
      } finally {
        setAiLoading(false)
      }
    }, 1500)

    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [step, description, selectedCategory, photos.length, aiDismissed])

  const canGoNext = () => {
    switch (step) {
      case 1: return !!selectedStore
      case 2: return !!selectedCategory
      case 3: return description.trim().length >= 5 && contactPhone.trim().length >= 5
      case 4: return true
      default: return false
    }
  }

  const handleSubmit = async () => {
    if (!user || !selectedStore || !selectedCategory) return
    setLoading(true)
    try {
      // Determine emergency status from the chosen category. Emergency tickets
      // bypass ДП approval (used to be priority=urgent — now it's the flag).
      const isEmergency = !!selectedCategory.is_emergency

      let initialStatus: 'new' | 'pending_approval' = 'new'
      if (!isEmergency) {
        const { data: division } = await supabase
          .from('divisions')
          .select('requires_approval')
          .eq('id', selectedStore.division_id)
          .single()
        if (division?.requires_approval) {
          initialStatus = 'pending_approval'
        }
      }

      // Create ticket
      const { data: ticket, error } = await supabase
        .from('tickets')
        .insert({
          store_id: selectedStore.id,
          category_id: selectedCategory.id,
          division_id: selectedStore.division_id,
          description,
          contact_phone: contactPhone,
          priority,
          is_emergency: isEmergency,
          created_by: user.id,
          status: initialStatus,
        })
        .select('id, ticket_number')
        .single()

      if (error) throw error

      // Upload all photos in parallel + history insert in the same Promise.all.
      // Previously the loop awaited each upload + each insert sequentially, so
      // 3 photos took 3-9s end-to-end on Russia↔Frankfurt latency. Doing them
      // concurrently brings it down to roughly the slowest single upload.
      // Best-effort: count failures and warn the user, but the ticket is
      // already saved — they can re-add the missing photos from the ticket
      // page.
      let failedPhotos = 0
      if (ticket) {
        const uploadOne = async (photo: File): Promise<void> => {
          const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase()
          const path = `${ticket.id}/${crypto.randomUUID()}.${ext}`
          const { error: uploadError } = await supabase.storage
            .from('ticket-photos')
            .upload(path, photo)
          if (uploadError) { failedPhotos++; return }

          const { data: urlData } = supabase.storage
            .from('ticket-photos')
            .getPublicUrl(path)

          const { error: photoInsertErr } = await supabase.from('ticket_photos').insert({
            ticket_id: ticket.id,
            storage_path: path,
            file_url: urlData.publicUrl,
            photo_type: 'problem',
            uploaded_by: user.id,
            file_size: photo.size,
            mime_type: photo.type,
          })
          if (photoInsertErr) {
            // remove orphan blob
            await supabase.storage.from('ticket-photos').remove([path]).catch(() => {})
            failedPhotos++
          }
        }

        await Promise.all([
          ...photos.map(uploadOne),
          // History insert runs in parallel with photo uploads — they don't
          // depend on each other.
          supabase.from('ticket_history').insert({
            ticket_id: ticket.id,
            action: 'created',
            new_value: initialStatus,
            actor_id: user.id,
          }),
        ])
      }

      if (failedPhotos > 0) {
        toast.error(`Заявка создана, но ${failedPhotos} фото не загрузилось — добавьте их со страницы заявки`)
      } else {
        toast.success(initialStatus === 'pending_approval' ? 'Заявка отправлена на согласование ДП' : 'Заявка создана')
      }
      router.push(`/tickets/${ticket.id}`)
    } catch (err) {
      console.error('Error creating ticket:', err)
      toast.error('Не удалось создать заявку: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const stepTitles = ['Магазин', 'Категория', 'Описание', 'Проверка']

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => step > 1 ? setStep((step - 1) as Step) : router.back()}
          className="p-2 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-surface-elevated/40 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-heading-2 text-text-primary">Новая заявка</h1>
          <p className="text-body-sm text-text-tertiary">Шаг {step} из 4 — {stepTitles[step - 1]}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1.5 mb-6">
        {[1, 2, 3, 4].map(s => (
          <div
            key={s}
            className={`h-1 rounded-full flex-1 transition-all duration-300 ${
              s <= step ? 'gradient-accent' : 'bg-border'
            }`}
          />
        ))}
      </div>

      {/* Step 1: Store Selection */}
      {step === 1 && (
        <div className="space-y-4 animate-fade-in">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
            <input
              type="text"
              placeholder="Поиск по номеру, названию или городу..."
              value={storeSearch}
              onChange={e => setStoreSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-surface-muted/30 text-text-primary placeholder:text-text-tertiary text-body-sm focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40 transition-all"
              autoFocus
            />
          </div>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {filteredStores.map(store => (
              <button
                key={store.id}
                onClick={() => setSelectedStore(store)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  selectedStore?.id === store.id
                    ? 'border-accent/40 bg-accent/5 ring-2 ring-accent/15'
                    : 'border-border hover:border-border-strong hover:bg-surface-elevated/20'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${selectedStore?.id === store.id ? 'bg-accent/10' : 'bg-surface-elevated/60'}`}>
                    <Building2 className={`w-4 h-4 ${selectedStore?.id === store.id ? 'text-accent' : 'text-text-tertiary'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-body-sm font-semibold text-accent/80">#{store.store_number}</span>
                      <span className="text-body-sm font-medium text-text-primary truncate">{store.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <MapPin className="w-3 h-3 text-text-tertiary flex-shrink-0" />
                      <span className="text-caption text-text-tertiary truncate">
                        {store.city || 'Город не указан'}
                        {store.address && ` — ${store.address}`}
                      </span>
                    </div>
                    {store.division && (
                      <span className="inline-block mt-1.5 px-2 py-0.5 rounded text-micro font-medium bg-surface-elevated/60 text-text-tertiary">
                        {store.division.name}
                      </span>
                    )}
                  </div>
                  {selectedStore?.id === store.id && (
                    <Check className="w-5 h-5 text-accent flex-shrink-0" />
                  )}
                </div>
              </button>
            ))}
            {filteredStores.length === 0 && (
              <div className="text-center py-8 text-text-tertiary">
                <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-body-sm">Магазин не найден</p>
              </div>
            )}
          </div>

          {/* Store ticket history */}
          {selectedStore && (() => {
            const activeStatuses: TicketStatus[] = ['new', 'pending_approval', 'assigned', 'in_progress', 'info_requested']
            const doneStatuses: TicketStatus[] = ['completed', 'partially_completed', 'verified']
            const activeCount = storeHistory.filter(t => activeStatuses.includes(t.status)).length
            const doneCount = storeHistory.filter(t => doneStatuses.includes(t.status)).length
            return (
              <div className="card-premium p-4">
                <button
                  type="button"
                  onClick={() => setStoreHistoryOpen(v => !v)}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <div className="p-2 rounded-lg bg-accent/10">
                    <Clock className="w-4 h-4 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-semibold text-text-primary">По магазину за 30 дней</p>
                    <p className="text-caption text-text-tertiary">
                      {storeHistoryLoading
                        ? 'Загрузка…'
                        : storeHistory.length === 0
                          ? 'Заявок не было — первой будет текущая'
                          : `${activeCount} активных, ${doneCount} закрытых${storeHistory.length > activeCount + doneCount ? `, остальные прочее` : ''}`}
                    </p>
                  </div>
                  {storeHistoryOpen ? <ChevronUp className="w-4 h-4 text-text-tertiary" /> : <ChevronDown className="w-4 h-4 text-text-tertiary" />}
                </button>
                {storeHistoryOpen && storeHistory.length > 0 && (
                  <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto">
                    {storeHistory.map(t => {
                      const st = TICKET_STATUSES[t.status]
                      return (
                        <Link
                          key={t.id}
                          href={`/tickets/${t.id}`}
                          target="_blank"
                          className="flex items-start gap-2 p-2 rounded-lg bg-surface-elevated/20 hover:bg-surface-elevated/40 transition-colors"
                        >
                          <span className="text-caption font-semibold text-accent/80 flex-shrink-0">
                            {formatTicketNumber(t.ticket_number)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-caption text-text-primary truncate">{t.description}</p>
                            <p className="text-micro text-text-tertiary">
                              {st?.label || t.status} · {formatRelative(t.created_at)}
                            </p>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Step 2: Category Selection */}
      {step === 2 && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 gap-3">
            {categories.map(cat => {
              const Icon = CATEGORY_ICONS[cat.icon || 'Wrench'] || Wrench
              const isSelected = selectedCategory?.id === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'border-accent/40 bg-accent/5 ring-2 ring-accent/15'
                      : 'border-border hover:border-border-strong hover:bg-surface-elevated/20'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                    style={{ backgroundColor: `${cat.color}15` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: cat.color || undefined }} />
                  </div>
                  <p className={`text-body-sm font-medium ${isSelected ? 'text-text-primary' : 'text-text-secondary'}`}>
                    {cat.name}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Hint + external link for the selected category */}
          {selectedCategory && (selectedCategory.hint || selectedCategory.external_url) && (
            <div className="card-premium p-4 border-l-4 border-l-accent space-y-3 animate-fade-in">
              {selectedCategory.hint && (
                <p className="text-body-sm text-text-primary whitespace-pre-wrap">
                  {selectedCategory.hint}
                </p>
              )}
              {selectedCategory.external_url && (
                <a
                  href={selectedCategory.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg gradient-accent text-white text-body-sm font-semibold hover:opacity-90"
                >
                  Перейти в каталог
                  <ArrowRight className="w-4 h-4" />
                </a>
              )}
              <p className="text-caption text-text-tertiary">
                Если по ссылке не получилось — продолжайте заявку дальше.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Description + Contact */}
      {step === 3 && (
        <div className="space-y-5 animate-fade-in">
          <Textarea
            label="Опишите проблему"
            placeholder="Подробно опишите, что случилось и что нужно сделать..."
            value={description}
            onChange={e => { setDescription(e.target.value); setAiDismissed(false) }}
            rows={4}
            error={description.length > 0 && description.length < 5 ? 'Минимум 5 символов' : undefined}
          />

          {/* AI hint: shown after user pauses typing. Non-blocking — user can
              ignore and submit anyway. */}
          {!aiDismissed && (aiLoading || aiResult) && description.trim().length >= 10 && (
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
              <div className="flex items-start gap-2">
                <div className="p-1.5 rounded-lg bg-violet-500/15 flex-shrink-0">
                  {aiLoading
                    ? <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                    : <Sparkles className="w-3.5 h-3.5 text-violet-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  {aiLoading && (
                    <p className="text-caption text-text-secondary">AI проверяет описание…</p>
                  )}
                  {!aiLoading && aiResult && aiResult.ok && !aiResult.suggest_photo && (
                    <p className="text-caption text-emerald-400">Описание полное — подрядчик возьмёт без уточнений</p>
                  )}
                  {!aiLoading && aiResult && (!aiResult.ok || aiResult.suggest_photo) && (
                    <>
                      <p className="text-caption font-semibold text-text-primary mb-1.5">
                        Уточните, чтобы заявку взяли быстрее:
                      </p>
                      {aiResult.missing.length > 0 && (
                        <ul className="space-y-1 mb-1.5">
                          {aiResult.missing.map((m, i) => (
                            <li key={i} className="text-caption text-text-secondary flex gap-1.5">
                              <span className="text-violet-400 flex-shrink-0">•</span>
                              <span>{m}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {aiResult.suggest_photo && photos.length === 0 && (
                        <p className="text-caption text-text-secondary flex gap-1.5">
                          <Camera className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
                          <span>{aiResult.photo_reason || 'Желательно приложить фото'}</span>
                        </p>
                      )}
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setAiDismissed(true)}
                  className="p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-elevated/40 transition-colors flex-shrink-0"
                  title="Скрыть подсказку"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <Input
            label="Контактный телефон"
            type="tel"
            placeholder="+7 (___) ___-__-__"
            value={contactPhone}
            onChange={e => setContactPhone(e.target.value)}
          />

          <div>
            <label className="block text-body-sm font-medium text-text-secondary mb-2">Приоритет</label>
            <div className="flex gap-2">
              {[
                { value: 'normal' as const, label: 'Обычный', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
                { value: 'high' as const, label: 'Высокий', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
              ].map(p => (
                <button
                  key={p.value}
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 py-2 px-3 rounded-xl border text-body-sm font-medium transition-all ${
                    priority === p.value
                      ? `${p.color} ring-2 ring-current/10`
                      : 'border-border text-text-tertiary hover:border-border-strong'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Photo upload */}
          <div>
            <label className="block text-body-sm font-medium text-text-secondary mb-2">
              Фото проблемы <span className="text-text-tertiary">(до 5 фото)</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {photoPreviews.map((preview, i) => (
                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                  <img src={preview} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {photos.length < 5 && (
                <>
                  {/* Camera (forced) — for fresh on-the-spot photos */}
                  <label className="w-20 h-20 rounded-xl border-2 border-dashed border-border hover:border-accent/40 flex flex-col items-center justify-center cursor-pointer transition-colors">
                    <Camera className="w-5 h-5 text-text-tertiary" />
                    <span className="text-micro text-text-tertiary mt-1">Снять</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoAdd}
                      className="hidden"
                      capture="environment"
                    />
                  </label>
                  {/* Gallery — for photos already in Photos app */}
                  <label className="w-20 h-20 rounded-xl border-2 border-dashed border-border hover:border-accent/40 flex flex-col items-center justify-center cursor-pointer transition-colors">
                    <Upload className="w-5 h-5 text-text-tertiary" />
                    <span className="text-micro text-text-tertiary mt-1">Галерея</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoAdd}
                      className="hidden"
                    />
                  </label>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <div className="space-y-4 animate-fade-in">
          <div className="card-premium p-5">
            <h3 className="text-body-sm font-medium text-text-tertiary mb-3">Проверьте данные</h3>

            <div className="space-y-3">
              <div className="flex items-start gap-3 pb-3 border-b border-border">
                <Building2 className="w-4 h-4 text-text-tertiary mt-0.5" />
                <div>
                  <p className="text-caption text-text-tertiary">Магазин</p>
                  <p className="text-body-sm text-text-primary">
                    #{selectedStore?.store_number} {selectedStore?.name}
                  </p>
                  <p className="text-caption text-text-tertiary">{selectedStore?.city}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 pb-3 border-b border-border">
                <Wrench className="w-4 h-4 text-text-tertiary mt-0.5" />
                <div>
                  <p className="text-caption text-text-tertiary">Категория</p>
                  <p className="text-body-sm text-text-primary">{selectedCategory?.name}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 pb-3 border-b border-border">
                <Upload className="w-4 h-4 text-text-tertiary mt-0.5" />
                <div>
                  <p className="text-caption text-text-tertiary">Описание</p>
                  <p className="text-body-sm text-text-primary whitespace-pre-wrap">{description}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 pb-3 border-b border-border">
                <Phone className="w-4 h-4 text-text-tertiary mt-0.5" />
                <div>
                  <p className="text-caption text-text-tertiary">Контакт</p>
                  <p className="text-body-sm text-text-primary">{contactPhone}</p>
                </div>
              </div>

              {photos.length > 0 && (
                <div className="flex items-start gap-3">
                  <Camera className="w-4 h-4 text-text-tertiary mt-0.5" />
                  <div>
                    <p className="text-caption text-text-tertiary">Фото: {photos.length}</p>
                    <div className="flex gap-2 mt-2">
                      {photoPreviews.map((p, i) => (
                        <img key={i} src={p} alt="" className="w-12 h-12 rounded-lg object-cover border border-border" />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 mt-6 sticky bottom-4">
        {step > 1 && (
          <Button
            variant="secondary"
            onClick={() => setStep((step - 1) as Step)}
            className="flex-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад
          </Button>
        )}
        {step < 4 ? (
          <Button
            onClick={() => setStep((step + 1) as Step)}
            disabled={!canGoNext()}
            className="flex-1"
          >
            Далее
            <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            loading={loading}
            disabled={loading}
            className="flex-1"
          >
            <Check className="w-4 h-4" />
            Отправить заявку
          </Button>
        )}
      </div>
    </div>
  )
}
