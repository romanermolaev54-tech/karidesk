'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { formatDate, formatRelative, formatTicketNumber, formatPhone } from '@/lib/utils'
import { TICKET_STATUSES, TICKET_PRIORITIES, PRIORITY_SHOWS_BADGE } from '@/lib/constants'
import type { Ticket, TicketMessage, TicketPhoto, TicketHistory, TicketStatus, Profile } from '@/types/database'
import {
  ArrowLeft,
  Phone,
  Clock,
  User,
  UserCheck,
  Camera,
  Send,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Building2,
  MessageCircle,
  History,
  Image,
  X,
  Upload,
  Loader2,
  Paperclip,
  Share2,
  Flame,
  Edit3,
  Siren,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { compressImage } from '@/lib/image'
import { AssigneeBadge } from '@/components/tickets/AssigneeBadge'
import { Trash2 } from 'lucide-react'

export default function TicketDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, profile, isAdmin, isDirector, isEmployee } = useAuth()
  const supabase = createClient()
  const ticketId = params.id as string

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<TicketMessage[]>([])
  const [photos, setPhotos] = useState<TicketPhoto[]>([])
  const [history, setHistory] = useState<TicketHistory[]>([])
  const [contractors, setContractors] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'info' | 'messages' | 'photos' | 'history'>('info')

  // Action states
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedContractor, setSelectedContractor] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [completeMode, setCompleteMode] = useState<'full' | 'partial'>('full')
  const [partialComment, setPartialComment] = useState('')
  const [completing, setCompleting] = useState(false)
  const [creatingContinuation, setCreatingContinuation] = useState(false)
  const [sendingPhoto, setSendingPhoto] = useState(false)
  const [adminComment, setAdminComment] = useState('')
  const [adminCommentEditing, setAdminCommentEditing] = useState(false)
  const [adminCommentSaving, setAdminCommentSaving] = useState(false)
  const [showEscalateModal, setShowEscalateModal] = useState(false)
  const [escalateNote, setEscalateNote] = useState('')
  const [escalating, setEscalating] = useState(false)
  // Admin metadata edit (category / priority / is_emergency override)
  const [showEditMetaModal, setShowEditMetaModal] = useState(false)
  const [editCategoryId, setEditCategoryId] = useState<string>('')
  const [editPriority, setEditPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal')
  const [editIsEmergency, setEditIsEmergency] = useState(false)
  const [editAllCategories, setEditAllCategories] = useState<Array<{ id: string; name: string }>>([])
  const [savingMeta, setSavingMeta] = useState(false)

  const loadTicket = useCallback(async () => {
    const { data } = await supabase
      .from('tickets')
      .select(`
        *,
        store:stores(*, division:divisions(*)),
        category:ticket_categories(*),
        division:divisions(*),
        creator:profiles!tickets_created_by_fkey(*),
        assignee:profiles!tickets_assigned_to_fkey(*)
      `)
      .eq('id', ticketId)
      .single()

    if (data) setTicket(data)
    setLoading(false)
  }, [ticketId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from('ticket_messages')
      .select('*, sender:profiles!ticket_messages_sender_id_fkey(*)')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })
    if (!data) { setMessages([]); return }

    // Chat attachments live in the same private ticket-photos bucket; their
    // attachment_url was saved as the (now-broken) public URL when the
    // bucket was public. Extract the storage path from each URL and batch-
    // sign them so the chat renders correctly post-private-switch.
    const PUBLIC_PREFIX = '/storage/v1/object/public/ticket-photos/'
    const pathByMsgId = new Map<string, string>()
    for (const m of data) {
      const url = (m as { attachment_url?: string }).attachment_url
      if (!url) continue
      const idx = url.indexOf(PUBLIC_PREFIX)
      if (idx >= 0) pathByMsgId.set(m.id, url.slice(idx + PUBLIC_PREFIX.length))
    }
    if (pathByMsgId.size > 0) {
      const paths = Array.from(pathByMsgId.values())
      const { data: signed } = await supabase.storage
        .from('ticket-photos')
        .createSignedUrls(paths, 3600)
      const signedByPath = new Map<string, string>()
      ;(signed || []).forEach(s => { if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl) })
      const remapped = data.map(m => {
        const p = pathByMsgId.get(m.id)
        if (!p) return m
        const signedUrl = signedByPath.get(p)
        if (!signedUrl) return m
        return { ...m, attachment_url: signedUrl }
      })
      setMessages(remapped)
    } else {
      setMessages(data)
    }
  }, [ticketId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadPhotos = useCallback(async () => {
    const { data } = await supabase
      .from('ticket_photos')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at')
    if (!data) { setPhotos([]); return }

    // Bucket is private (since 2026-04-28 security pass) — public URLs no
    // longer work. Generate short-lived signed URLs in one batch call so
    // we don't wait on N round-trips for N photos. Falls back to whatever
    // file_url is in the DB if signing fails (e.g. orphan rows).
    const paths = data.map(p => p.storage_path).filter(Boolean) as string[]
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from('ticket-photos')
        .createSignedUrls(paths, 3600) // 1 hour — refreshed on next page load
      const urlByPath = new Map<string, string>()
      ;(signed || []).forEach(s => { if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl) })
      const withSigned = data.map(p => ({
        ...p,
        file_url: urlByPath.get(p.storage_path) || p.file_url,
      }))
      setPhotos(withSigned)
    } else {
      setPhotos(data)
    }
  }, [ticketId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('ticket_history')
      .select('*, actor:profiles!ticket_history_actor_id_fkey(id, full_name)')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false })
    if (data) setHistory(data)
  }, [ticketId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ticket?.admin_comment !== undefined && !adminCommentEditing) {
      setAdminComment(ticket.admin_comment || '')
    }
  }, [ticket?.admin_comment, adminCommentEditing])

  const saveAdminComment = async () => {
    setAdminCommentSaving(true)
    const value = adminComment.trim() || null
    const { error } = await supabase
      .from('tickets')
      .update({ admin_comment: value })
      .eq('id', ticketId)
    setAdminCommentSaving(false)
    if (error) { toast.error('Не сохранилось: ' + error.message); return }
    setAdminCommentEditing(false)
    toast.success('Комментарий сохранён')
    await loadTicket()
  }

  useEffect(() => {
    if (!photoPreview) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPhotoPreview(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photoPreview])

  useEffect(() => {
    loadTicket()
    loadMessages()
    loadPhotos()
    loadHistory()
  }, [loadTicket, loadMessages, loadPhotos, loadHistory])

  // Load contractors for assignment
  useEffect(() => {
    if (isAdmin) {
      supabase
        .from('profiles')
        .select('*')
        .eq('role', 'contractor')
        .eq('is_active', true)
        .then(({ data }) => {
          if (data) setContractors(data)
        })
    }
  }, [isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = async () => {
    if (!newMessage.trim() || !user) return
    setSendingMessage(true)
    const { error } = await supabase.from('ticket_messages').insert({
      ticket_id: ticketId,
      sender_id: user.id,
      message: newMessage.trim(),
      message_type: 'comment',
    })
    setSendingMessage(false)
    if (error) { toast.error('Не удалось отправить: ' + error.message); return }
    setNewMessage('')
    await loadMessages()
  }

  const MAX_PHOTO_BYTES = 8 * 1024 * 1024 // 8 MB hard cap (compression should reduce most below 1 MB)

  const sendChatPhoto = async (rawFile: File) => {
    if (!user || !rawFile) return
    if (!rawFile.type.startsWith('image/')) {
      toast.error('Прикрепите изображение')
      return
    }
    if (rawFile.size > MAX_PHOTO_BYTES) {
      toast.error('Файл слишком большой (макс. 8 МБ)')
      return
    }
    setSendingPhoto(true)
    try {
      const file = await compressImage(rawFile).catch(() => rawFile)
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${ticketId}/chat/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from('ticket-photos').upload(path, file)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('ticket-photos').getPublicUrl(path)
      const { error: msgErr } = await supabase.from('ticket_messages').insert({
        ticket_id: ticketId,
        sender_id: user.id,
        message: newMessage.trim() || '',
        message_type: 'comment',
        attachment_url: urlData.publicUrl,
        attachment_type: 'image',
      })
      if (msgErr) throw msgErr
      setNewMessage('')
      await loadMessages()
    } catch (e) {
      toast.error('Ошибка отправки: ' + (e as Error).message)
    } finally {
      setSendingPhoto(false)
    }
  }

  const assignTicket = async () => {
    if (!selectedContractor || !user) return
    setAssigning(true)
    const { error: updateErr } = await supabase
      .from('tickets')
      .update({
        assigned_to: selectedContractor,
        assigned_by: user.id,
        assigned_at: new Date().toISOString(),
        status: 'assigned',
      })
      .eq('id', ticketId)
    if (updateErr) {
      setAssigning(false)
      toast.error('Не удалось назначить: ' + updateErr.message)
      return
    }

    await supabase.from('ticket_history').insert({
      ticket_id: ticketId,
      action: 'assigned',
      old_value: ticket?.status,
      new_value: 'assigned',
      actor_id: user.id,
      details: { assigned_to: selectedContractor },
    })

    setAssigning(false)
    setShowAssignModal(false)
    toast.success('Исполнитель назначен')
    await loadTicket()
    await loadHistory()
  }

  const updateStatus = async (newStatus: TicketStatus) => {
    if (!user) return
    const updates: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'completed') updates.completed_at = new Date().toISOString()
    if (newStatus === 'verified') {
      updates.verified_at = new Date().toISOString()
      updates.verified_by = user.id
    }

    const { error } = await supabase.from('tickets').update(updates).eq('id', ticketId)
    if (error) {
      toast.error('Не удалось изменить статус: ' + error.message)
      return
    }
    await supabase.from('ticket_history').insert({
      ticket_id: ticketId,
      action: 'status_changed',
      old_value: ticket?.status,
      new_value: newStatus,
      actor_id: user.id,
    })
    await loadTicket()
    await loadHistory()
  }

  const completeTicket = async () => {
    if (!user) return
    setCompleting(true)
    const nowIso = new Date().toISOString()
    const updates: Record<string, unknown> = { completed_at: nowIso }
    if (completeMode === 'full') {
      updates.status = 'completed'
      updates.partial_comment = null
    } else {
      updates.status = 'partially_completed'
      updates.partial_comment = partialComment.trim()
    }
    const { error } = await supabase.from('tickets').update(updates).eq('id', ticketId)
    if (error) {
      setCompleting(false)
      toast.error('Не удалось завершить: ' + error.message)
      return
    }
    await supabase.from('ticket_history').insert({
      ticket_id: ticketId,
      action: 'status_changed',
      old_value: ticket?.status,
      new_value: updates.status,
      actor_id: user.id,
      details: completeMode === 'partial' ? { partial_comment: partialComment.trim() } : null,
    })
    setShowCompleteModal(false)
    setPartialComment('')
    setCompleteMode('full')
    setCompleting(false)
    toast.success(completeMode === 'partial' ? 'Заявка частично закрыта' : 'Заявка завершена')
    await loadTicket()
    await loadHistory()
  }

  const createContinuation = async () => {
    if (!user || !ticket) return
    setCreatingContinuation(true)
    const description = (ticket.partial_comment?.trim() || 'Продолжение заявки #' + ticket.ticket_number)
    const { data: newTicket, error } = await supabase
      .from('tickets')
      .insert({
        store_id: ticket.store_id,
        category_id: ticket.category_id,
        division_id: ticket.division_id,
        description,
        contact_phone: ticket.contact_phone,
        priority: ticket.priority,
        created_by: user.id,
        status: 'new',
        continuation_of: ticket.id,
      })
      .select('id, ticket_number')
      .single()
    setCreatingContinuation(false)
    if (error || !newTicket) {
      alert('Ошибка: ' + (error?.message || 'не удалось создать продолжение'))
      return
    }
    router.push(`/tickets/${newTicket.id}`)
  }

  const shareTicket = async () => {
    if (!ticket) return
    const url = `${window.location.origin}/tickets/${ticket.id}`
    const summary = `Заявка ${formatTicketNumber(ticket.ticket_number)}\n${ticket.description}\n${ticket.store ? `Магазин: #${ticket.store.store_number} ${ticket.store.name}\n` : ''}${url}`
    try {
      const navAny = navigator as Navigator & { share?: (data: ShareData) => Promise<void> }
      if (navAny.share) {
        await navAny.share({ title: `KariDesk · ${formatTicketNumber(ticket.ticket_number)}`, text: summary, url })
        return
      }
      await navigator.clipboard.writeText(summary)
      toast.success('Ссылка и описание скопированы — вставь в мессенджер')
    } catch {
      // user cancelled share or copy failed
    }
  }

  /** Open the metadata-edit modal and lazy-load the categories list. */
  const openEditMetaModal = async () => {
    if (!ticket) return
    setEditCategoryId(ticket.category_id)
    setEditPriority(ticket.priority)
    setEditIsEmergency(!!ticket.is_emergency)
    if (editAllCategories.length === 0) {
      const { data } = await supabase
        .from('ticket_categories')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order')
      if (data) setEditAllCategories(data)
    }
    setShowEditMetaModal(true)
  }

  const saveMeta = async () => {
    if (!ticket) return
    setSavingMeta(true)
    const { error } = await supabase
      .from('tickets')
      .update({
        category_id: editCategoryId,
        priority: editPriority,
        is_emergency: editIsEmergency,
      })
      .eq('id', ticket.id)
    setSavingMeta(false)
    if (error) {
      toast.error('Ошибка: ' + error.message)
      return
    }
    // Audit trail — record what changed in ticket_history. Best-effort,
    // never blocks the UI even if it fails.
    const changes: string[] = []
    if (editCategoryId !== ticket.category_id) changes.push('категория')
    if (editPriority !== ticket.priority) changes.push('приоритет')
    if (editIsEmergency !== !!ticket.is_emergency) changes.push(editIsEmergency ? 'отмечена аварийной' : 'снят флаг аварии')
    if (changes.length > 0 && user) {
      await supabase.from('ticket_history').insert({
        ticket_id: ticket.id,
        action: 'meta_changed',
        new_value: changes.join(', '),
        actor_id: user.id,
      }).then(() => null, () => null)
    }
    setShowEditMetaModal(false)
    toast.success('Сохранено')
    // Refresh local copy
    loadTicket()
  }

  const ESCALATE_COOLDOWN_MIN = 60

  const lastEscalateKey = (id: string) => `karidesk_escalate_${id}`

  const escalateTicket = async () => {
    if (!ticket || !user) return
    const note = escalateNote.trim()
    if (note.length < 10) {
      toast.error('Опиши причину ускорения (минимум 10 символов)')
      return
    }
    setEscalating(true)
    const url = `${window.location.origin}/tickets/${ticket.id}`
    const messageText = `🔥 Прошу ускорить выполнение!\nПричина: ${note}`
    // 1) Drop a chat message — admins/contractor will get standard notification
    await supabase.from('ticket_messages').insert({
      ticket_id: ticket.id,
      sender_id: user.id,
      message: messageText,
      message_type: 'comment',
    })
    // 2) Push every admin separately so the notification stands out
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true)
    if (admins && admins.length > 0) {
      const rows = admins.map(a => ({
        user_id: a.id,
        ticket_id: ticket.id,
        title: `🔥 Просьба ускорить заявку #${ticket.ticket_number}`,
        message: `${profile?.full_name || 'Магазин'}: ${note}`,
        type: 'action_required' as const,
      }))
      await supabase.from('notifications').insert(rows)
    }
    try { localStorage.setItem(lastEscalateKey(ticket.id), String(Date.now())) } catch { /* noop */ }
    setEscalating(false)
    setShowEscalateModal(false)
    setEscalateNote('')
    toast.success('Запрос отправлен админам')
    void url
    loadMessages()
  }

  const escalateCooldownRemaining = (): number => {
    if (typeof window === 'undefined' || !ticket) return 0
    try {
      const last = parseInt(localStorage.getItem(lastEscalateKey(ticket.id)) || '0', 10)
      if (!last) return 0
      const elapsed = Date.now() - last
      const remaining = ESCALATE_COOLDOWN_MIN * 60 * 1000 - elapsed
      return remaining > 0 ? remaining : 0
    } catch { return 0 }
  }

  const rejectTicket = async () => {
    if (!user) return
    if (!rejectReason.trim()) { toast.error('Укажите причину'); return }
    const { error } = await supabase
      .from('tickets')
      .update({ status: 'rejected', rejection_reason: rejectReason })
      .eq('id', ticketId)
    if (error) {
      toast.error('Не удалось отклонить: ' + error.message)
      return
    }

    await supabase.from('ticket_history').insert({
      ticket_id: ticketId,
      action: 'rejected',
      old_value: ticket?.status,
      new_value: 'rejected',
      actor_id: user.id,
      details: { reason: rejectReason },
    })
    toast.success('Заявка отклонена')

    setShowRejectModal(false)
    loadTicket()
    loadHistory()
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, photoType: 'completion' | 'act') => {
    const rawFile = e.target.files?.[0]
    e.target.value = ''
    if (!rawFile || !user) return
    if (!rawFile.type.startsWith('image/')) {
      toast.error('Прикрепите изображение')
      return
    }
    if (rawFile.size > MAX_PHOTO_BYTES) {
      toast.error('Файл слишком большой (макс. 8 МБ)')
      return
    }
    setUploading(true)

    const file = await compressImage(rawFile).catch(() => rawFile)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${ticketId}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('ticket-photos').upload(path, file)

    if (upErr) {
      setUploading(false)
      toast.error('Ошибка загрузки: ' + upErr.message)
      return
    }

    const { data: urlData } = supabase.storage.from('ticket-photos').getPublicUrl(path)
    const { error: insErr } = await supabase.from('ticket_photos').insert({
      ticket_id: ticketId,
      storage_path: path,
      file_url: urlData.publicUrl,
      photo_type: photoType,
      uploaded_by: user.id,
      file_size: file.size,
      mime_type: file.type,
    })
    if (insErr) {
      // Clean up the orphaned storage object since DB row failed
      await supabase.storage.from('ticket-photos').remove([path]).catch(() => {})
      setUploading(false)
      toast.error('Не удалось сохранить фото: ' + insErr.message)
      return
    }
    toast.success(photoType === 'completion' ? 'Фото выполнения добавлено' : 'Акт добавлен')
    await loadPhotos()
    setUploading(false)
  }

  /**
   * Delete a ticket photo (and its underlying storage blob).
   *
   * The DB layer (RLS policy added in migration 20260429120000) is the source
   * of truth for permission — an admin can delete anything, a contractor can
   * only delete their own uploads on tickets assigned to them, employees and
   * directors can't delete at all. The UI below mirrors this so we don't show
   * a button that will then 403, but the policy is the real enforcement.
   *
   * Order matters: storage first, then row. If the row delete fails after the
   * storage delete succeeded we'd be left with a dangling DB row pointing at
   * a missing blob, which is recoverable. The other order would leave an
   * orphan blob with no DB pointer — much harder to find and clean up.
   */
  const handleDeletePhoto = async (photo: TicketPhoto) => {
    if (!user) return
    if (!confirm('Удалить это фото? Это действие нельзя отменить.')) return
    // Optimistic: remove from local state first so the UI feels snappy. We
    // restore on failure below.
    const prev = photos
    setPhotos(prev.filter(p => p.id !== photo.id))
    if (photoPreview === photo.file_url) setPhotoPreview(null)

    const { error: stErr } = await supabase.storage.from('ticket-photos').remove([photo.storage_path])
    if (stErr) {
      // Rare but possible if the blob is already gone — proceed to delete the
      // row anyway so we don't strand it. Log for debugging but don't bail.
      console.warn('Storage delete failed (continuing):', stErr.message)
    }
    const { error: rowErr } = await supabase.from('ticket_photos').delete().eq('id', photo.id)
    if (rowErr) {
      // RLS rejection (e.g. somebody tampered with the client) — restore.
      setPhotos(prev)
      toast.error('Не удалось удалить: ' + rowErr.message)
      return
    }
    toast.success('Фото удалено')
  }

  /**
   * Can the current user delete *this specific* photo? Mirrors the RLS rule
   * exactly so the trash button only renders when the action will actually
   * succeed. The DB still has the final say if the rules diverge.
   */
  const canDeletePhoto = (photo: TicketPhoto): boolean => {
    if (!user || !ticket) return false
    if (isAdmin) return true
    // Contractor: their own upload, on a ticket assigned to them.
    if (profile?.role === 'contractor'
        && photo.uploaded_by === user.id
        && ticket.assigned_to === user.id) {
      return true
    }
    return false
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="text-center py-20">
        <p className="text-body text-text-secondary">Заявка не найдена</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
          Назад
        </Button>
      </div>
    )
  }

  const statusInfo = TICKET_STATUSES[ticket.status]
  const priorityInfo = TICKET_PRIORITIES[ticket.priority]
  const isAssignee = user?.id === ticket.assigned_to
  const canManage = isAdmin || isDirector

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-surface-elevated/40 transition-colors mt-0.5"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Coloured initial circle for the assigned contractor — same
                colour follows them across all lists. Render only when assigned;
                unassigned tickets keep the row visually clean. */}
            <AssigneeBadge assignee={ticket.assignee} size="md" />
            <h1 className="text-heading-2 text-text-primary">
              {formatTicketNumber(ticket.ticket_number)}
            </h1>
            <button
              onClick={shareTicket}
              className="p-1.5 rounded-lg text-text-tertiary hover:text-accent hover:bg-accent/5 transition-colors"
              title="Скопировать ссылку и описание"
            >
              <Share2 className="w-4 h-4" />
            </button>
            {/* Admin-only metadata edit. Lets admin reclassify a ticket
                (correct category / priority) and flip the emergency flag. */}
            {isAdmin && (
              <button
                onClick={openEditMetaModal}
                className="p-1.5 rounded-lg text-text-tertiary hover:text-accent hover:bg-accent/5 transition-colors"
                title="Изменить категорию / приоритет / аварийность"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
            <Badge
              variant={statusInfo.color as 'info' | 'warning' | 'success' | 'danger' | 'accent'}
              size="md"
              dot
            >
              {statusInfo.label}
            </Badge>
            {/* Priority — only render if it's actually meaningful (high/urgent
                map to "Высокий" badge; low/normal hide entirely for less noise). */}
            {PRIORITY_SHOWS_BADGE[ticket.priority] && (
              <Badge variant={priorityInfo.color as 'warning' | 'danger'} size="md">
                {priorityInfo.label}
              </Badge>
            )}
            {/* Emergency flag — separate, louder badge. Drives the dashboard
                "Аварийные" tile and bypasses ДП approval. */}
            {ticket.is_emergency && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 text-caption font-bold uppercase tracking-wide">
                🚨 Аварийная
              </span>
            )}
          </div>
          <p className="text-body-sm text-text-tertiary mt-1">
            {ticket.category?.name} — {formatDate(ticket.created_at)}
          </p>
        </div>
      </div>

      {/* Escalate (store creator only) */}
      {isEmployee && user?.id === ticket.created_by && !['completed', 'verified', 'rejected', 'merged', 'partially_completed'].includes(ticket.status) && (() => {
        const cooldown = escalateCooldownRemaining()
        const cooldownMin = Math.ceil(cooldown / 60000)
        return (
          <Button
            onClick={() => setShowEscalateModal(true)}
            disabled={cooldown > 0}
            variant={cooldown > 0 ? 'secondary' : 'danger'}
            className="w-full"
          >
            <Flame className="w-4 h-4" />
            {cooldown > 0 ? `Уже отправлено · повторно через ${cooldownMin} мин` : 'Поторопить с заявкой'}
          </Button>
        )
      })()}

      {/* Action buttons */}
      {(isAdmin || isDirector) && ticket.status === 'pending_approval' && (
        <div className="flex gap-2">
          <Button onClick={() => updateStatus('new')} className="flex-1">
            <CheckCircle className="w-4 h-4" />
            Одобрить
          </Button>
          <Button variant="danger" onClick={() => setShowRejectModal(true)} className="flex-1">
            <XCircle className="w-4 h-4" />
            Отклонить
          </Button>
        </div>
      )}

      {canManage && ticket.status === 'new' && (
        <div className="flex gap-2">
          <Button onClick={() => setShowAssignModal(true)} className="flex-1">
            <UserCheck className="w-4 h-4" />
            Назначить
          </Button>
          <Button variant="danger" onClick={() => setShowRejectModal(true)}>
            <XCircle className="w-4 h-4" />
          </Button>
        </div>
      )}

      {ticket.status === 'partially_completed' && (
        <div className="card-premium p-4 border-l-4 border-l-amber-400">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-body-sm font-semibold text-text-primary">Заявка выполнена частично</p>
              {ticket.partial_comment && (
                <p className="text-body-sm text-text-secondary mt-1 whitespace-pre-wrap">{ticket.partial_comment}</p>
              )}
              {isAdmin && (
                <Button size="sm" className="mt-3" onClick={createContinuation} loading={creatingContinuation}>
                  <CheckCircle className="w-4 h-4" />
                  Создать продолжение
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {canManage && (ticket.status === 'completed' || ticket.status === 'partially_completed') && (
        <div className="flex gap-2">
          <Button onClick={() => updateStatus('verified')} className="flex-1">
            <CheckCircle className="w-4 h-4" />
            Подтвердить
          </Button>
          <Button variant="danger" onClick={() => setShowRejectModal(true)}>
            <XCircle className="w-4 h-4" />
            Отклонить
          </Button>
        </div>
      )}

      {isAssignee && (ticket.status === 'assigned' || ticket.status === 'in_progress') && (
        <div className="flex gap-2">
          {ticket.status === 'assigned' && (
            <Button onClick={() => updateStatus('in_progress')} className="flex-1">
              Взять в работу
            </Button>
          )}
          {ticket.status === 'in_progress' && (
            <Button onClick={() => { setCompleteMode('full'); setPartialComment(''); setShowCompleteModal(true) }} className="flex-1">
              <CheckCircle className="w-4 h-4" />
              Завершить
            </Button>
          )}
          <label className="cursor-pointer">
            <Button variant="secondary" onClick={() => {}}>
              <Camera className="w-4 h-4" />
              Фото
            </Button>
            {/* No capture attr → iOS shows native picker with Take Photo + Photo Library options */}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handlePhotoUpload(e, 'completion')}
            />
          </label>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface-elevated/30 border border-border">
        {[
          { id: 'info' as const, label: 'Информация', icon: Building2 },
          { id: 'messages' as const, label: 'Чат', icon: MessageCircle, count: messages.length },
          { id: 'photos' as const, label: 'Фото', icon: Image, count: photos.length },
          { id: 'history' as const, label: 'История', icon: History },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-caption font-medium transition-all ${
              activeTab === tab.id
                ? 'gradient-accent text-white shadow-sm'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`text-micro px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? 'bg-white/20' : 'bg-surface-elevated/60'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Info tab */}
      {activeTab === 'info' && (
        <div className="card-premium p-5 space-y-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-caption text-text-tertiary mb-1">Магазин</p>
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-text-tertiary" />
                <span className="text-body-sm text-text-primary">
                  #{ticket.store?.store_number} {ticket.store?.name}
                </span>
              </div>
              {ticket.store?.city && (
                <p className="text-caption text-text-tertiary mt-0.5 ml-6">
                  {ticket.store.city}{ticket.store.address ? `, ${ticket.store.address}` : ''}
                </p>
              )}
            </div>

            <div>
              <p className="text-caption text-text-tertiary mb-1">Подразделение</p>
              <p className="text-body-sm text-text-primary">{ticket.division?.name}</p>
            </div>

            <div>
              <p className="text-caption text-text-tertiary mb-1">Создал</p>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-text-tertiary" />
                <span className="text-body-sm text-text-primary">{ticket.creator?.full_name}</span>
              </div>
            </div>

            <div>
              <p className="text-caption text-text-tertiary mb-1">Контактный телефон</p>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-text-tertiary" />
                <a href={`tel:${ticket.contact_phone}`} className="text-body-sm text-accent hover:underline">
                  {formatPhone(ticket.contact_phone)}
                </a>
              </div>
            </div>

            {ticket.assignee && (
              <div>
                <p className="text-caption text-text-tertiary mb-1">Исполнитель</p>
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-text-tertiary" />
                  <span className="text-body-sm text-text-primary">{ticket.assignee.full_name}</span>
                </div>
              </div>
            )}

            {ticket.deadline && (
              <div>
                <p className="text-caption text-text-tertiary mb-1">Дедлайн</p>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-text-tertiary" />
                  <span className="text-body-sm text-text-primary">{formatDate(ticket.deadline)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-caption text-text-tertiary mb-2">Описание</p>
            <p className="text-body-sm text-text-primary whitespace-pre-wrap">{ticket.description}</p>
          </div>

          {ticket.rejection_reason && (
            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <p className="text-caption text-red-400 font-medium">Причина отклонения</p>
              </div>
              <p className="text-body-sm text-text-primary">{ticket.rejection_reason}</p>
            </div>
          )}

          {/* Admin / director comment (editable) */}
          {(isAdmin || isDirector) && (
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-caption text-text-tertiary font-medium">Комментарий администратора</p>
                {!adminCommentEditing && (
                  <button
                    onClick={() => setAdminCommentEditing(true)}
                    className="text-caption text-accent hover:underline"
                  >
                    {ticket.admin_comment ? 'Изменить' : 'Добавить'}
                  </button>
                )}
              </div>
              {adminCommentEditing ? (
                <div className="space-y-2">
                  <Textarea
                    value={adminComment}
                    onChange={e => setAdminComment(e.target.value)}
                    rows={3}
                    placeholder="Внутренняя заметка по заявке (видна только admin/ДП)"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => { setAdminCommentEditing(false); setAdminComment(ticket.admin_comment || '') }} className="flex-1">
                      Отмена
                    </Button>
                    <Button size="sm" onClick={saveAdminComment} loading={adminCommentSaving} className="flex-1">
                      Сохранить
                    </Button>
                  </div>
                </div>
              ) : ticket.admin_comment ? (
                <p className="text-body-sm text-text-primary whitespace-pre-wrap">{ticket.admin_comment}</p>
              ) : (
                <p className="text-caption text-text-tertiary italic">Комментария нет</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Messages tab */}
      {activeTab === 'messages' && (
        <div className="space-y-3 animate-fade-in">
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {messages.length === 0 ? (
              <div className="card-premium p-6 text-center">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 text-text-tertiary opacity-40" />
                <p className="text-body-sm text-text-tertiary">Нет сообщений</p>
              </div>
            ) : (
              messages.map(msg => {
                const isOwn = msg.sender_id === user?.id
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] p-3 rounded-2xl ${
                      isOwn
                        ? 'bg-accent/10 border border-accent/20 rounded-br-md'
                        : 'card-premium rounded-bl-md'
                    }`}>
                      {!isOwn && (
                        <p className="text-caption font-medium text-accent mb-1">
                          {msg.sender?.full_name}
                        </p>
                      )}
                      {msg.attachment_url && msg.attachment_type === 'image' && (
                        <button
                          type="button"
                          onClick={() => setPhotoPreview(msg.attachment_url)}
                          className="block mb-2 rounded-lg overflow-hidden max-w-full"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={msg.attachment_url}
                            alt="Вложение"
                            className="w-full max-h-64 object-cover"
                          />
                        </button>
                      )}
                      {msg.message && (
                        <p className="text-body-sm text-text-primary whitespace-pre-wrap">{msg.message}</p>
                      )}
                      <p className="text-micro text-text-tertiary mt-1">
                        {formatRelative(msg.created_at)}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Message input */}
          <div className="flex gap-2">
            <label className="cursor-pointer p-2.5 rounded-xl border border-border bg-surface-muted/30 hover:bg-surface-elevated/40 text-text-tertiary hover:text-accent transition-colors flex items-center justify-center" title="Прикрепить фото">
              {sendingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={sendingPhoto}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) sendChatPhoto(file)
                  e.target.value = ''
                }}
              />
            </label>
            <input
              type="text"
              placeholder="Написать сообщение..."
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-surface-muted/30 text-text-primary placeholder:text-text-tertiary text-body-sm focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40 transition-all"
            />
            <Button
              onClick={sendMessage}
              loading={sendingMessage}
              disabled={!newMessage.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Photos tab */}
      {activeTab === 'photos' && (
        <div className="space-y-4 animate-fade-in">
          {['problem', 'completion', 'act'].map(type => {
            const typePhotos = photos.filter(p => p.photo_type === type)
            if (typePhotos.length === 0 && type !== 'problem') return null
            const typeLabels: Record<string, string> = {
              problem: 'Фото проблемы',
              completion: 'Фото выполнения',
              act: 'Акты',
            }
            return (
              <div key={type}>
                <h3 className="text-body-sm font-medium text-text-secondary mb-2">{typeLabels[type]}</h3>
                <div className="grid grid-cols-3 gap-2">
                  {typePhotos.map(photo => {
                    // Show a small trash chip in the top-right corner only
                    // when the current user can actually delete this photo
                    // (admin: any; contractor: own uploads on assigned ticket).
                    // Wrapped in a non-button div so the inner trash button
                    // doesn't nest inside another button (HTML invalid).
                    const showDelete = canDeletePhoto(photo)
                    return (
                      <div
                        key={photo.id}
                        className="relative aspect-square rounded-xl overflow-hidden border border-border hover:border-accent/40 transition-colors group"
                      >
                        <button
                          type="button"
                          onClick={() => setPhotoPreview(photo.file_url)}
                          className="w-full h-full"
                        >
                          <img
                            src={photo.file_url || ''}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </button>
                        {showDelete && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo) }}
                            className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm text-white/90 hover:bg-red-500/90 hover:text-white transition-colors"
                            title="Удалить фото"
                            aria-label="Удалить фото"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {typePhotos.length === 0 && (
                    <div className="aspect-square rounded-xl border-2 border-dashed border-border flex items-center justify-center">
                      <Camera className="w-6 h-6 text-text-tertiary opacity-40" />
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Upload buttons for assignee */}
          {isAssignee && ['in_progress', 'assigned'].includes(ticket.status) && (
            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer">
                <div className="card-interactive p-3 text-center">
                  {uploading ? <Loader2 className="w-4 h-4 mx-auto mb-1 text-text-tertiary animate-spin" /> : <Upload className="w-4 h-4 mx-auto mb-1 text-text-tertiary" />}
                  <p className="text-caption text-text-tertiary">Фото выполнения</p>
                </div>
                {/* No capture attr → iOS shows native picker with Take Photo + Photo Library options */}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => handlePhotoUpload(e, 'completion')}
                />
              </label>
              <label className="flex-1 cursor-pointer">
                <div className="card-interactive p-3 text-center">
                  <Upload className="w-4 h-4 mx-auto mb-1 text-text-tertiary" />
                  <p className="text-caption text-text-tertiary">Акт работ</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => handlePhotoUpload(e, 'act')}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {/* History tab */}
      {activeTab === 'history' && (
        <div className="space-y-2 animate-fade-in">
          {history.length === 0 ? (
            <div className="card-premium p-6 text-center">
              <History className="w-8 h-8 mx-auto mb-2 text-text-tertiary opacity-40" />
              <p className="text-body-sm text-text-tertiary">Нет записей</p>
            </div>
          ) : (
            history.map(entry => (
              <div key={entry.id} className="card-premium p-3 flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-accent/40 mt-2 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-body-sm text-text-primary">
                    {entry.action === 'created' && 'Заявка создана'}
                    {entry.action === 'assigned' && 'Назначен исполнитель'}
                    {entry.action === 'status_changed' && `Статус: ${TICKET_STATUSES[entry.new_value as TicketStatus]?.label || entry.new_value}`}
                    {entry.action === 'rejected' && 'Заявка отклонена'}
                  </p>
                  <p className="text-caption text-text-tertiary">
                    {entry.actor?.full_name} — {formatRelative(entry.created_at)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Photo preview modal */}
      {photoPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPhotoPreview(null)}>
          <button className="absolute top-4 right-4 p-2 text-white/80 hover:text-white" onClick={() => setPhotoPreview(null)}>
            <X className="w-6 h-6" />
          </button>
          <img src={photoPreview} alt="" className="max-w-full max-h-full object-contain rounded-xl" />
        </div>
      )}

      {/* Assign modal */}
      <Modal isOpen={showAssignModal} onClose={() => setShowAssignModal(false)} title="Назначить исполнителя">
        <div className="space-y-4">
          <Select
            label="Исполнитель"
            placeholder="Выберите исполнителя..."
            value={selectedContractor}
            onChange={e => setSelectedContractor(e.target.value)}
            options={contractors.map(c => ({ value: c.id, label: c.full_name }))}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowAssignModal(false)} className="flex-1">
              Отмена
            </Button>
            <Button onClick={assignTicket} loading={assigning} disabled={!selectedContractor} className="flex-1">
              Назначить
            </Button>
          </div>
        </div>
      </Modal>

      {/* Escalate modal */}
      <Modal isOpen={showEscalateModal} onClose={() => setShowEscalateModal(false)} title="Поторопить с заявкой">
        <div className="space-y-4">
          <p className="text-body-sm text-text-secondary">
            Все администраторы получат моментальный пуш-сигнал «🔥 Просьба ускорить». Используйте только если заявка реально срочная — повторно можно отправить через час.
          </p>
          <div>
            <Textarea
              label="Причина — почему нужно ускорить"
              placeholder="Например: завтра приёмка от управляющей компании; клиенты падают в магазине; магазин не открыть без розетки"
              value={escalateNote}
              onChange={e => setEscalateNote(e.target.value)}
              rows={4}
              required
            />
            <p className={`text-caption mt-1 ${escalateNote.trim().length >= 10 ? 'text-text-tertiary' : 'text-amber-400'}`}>
              Минимум 10 символов · сейчас {escalateNote.trim().length}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowEscalateModal(false)} className="flex-1">Отмена</Button>
            <Button
              variant="danger"
              onClick={escalateTicket}
              loading={escalating}
              disabled={escalateNote.trim().length < 10}
              className="flex-1"
            >
              <Flame className="w-4 h-4" />
              Отправить
            </Button>
          </div>
        </div>
      </Modal>

      {/* Complete modal (full / partial) */}
      <Modal isOpen={showCompleteModal} onClose={() => setShowCompleteModal(false)} title="Завершение заявки">
        {(() => {
          const completionPhotos = photos.filter(p => p.photo_type === 'completion').length
          const actPhotos = photos.filter(p => p.photo_type === 'act').length
          const photosOk = completionPhotos > 0 && actPhotos > 0
          return (
        <div className="space-y-4">
          <p className="text-body-sm text-text-secondary">Укажите, как была выполнена заявка. Выезд исполнителя попадает в отчёт в обоих случаях.</p>

          {/* Required photos — load right here */}
          <div className="space-y-3">
            <p className="text-caption font-semibold text-text-primary">Обязательные вложения</p>

            {/* Completion photos block */}
            <div className={`rounded-xl border p-3 space-y-2 ${
              completionPhotos > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-400/30 bg-amber-400/5'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-body-sm">
                  {completionPhotos > 0
                    ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    : <XCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                  <span className="text-text-primary">
                    Фото выполнения {completionPhotos > 0 && `(${completionPhotos})`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <label className="cursor-pointer flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-elevated/60 hover:bg-surface-elevated text-caption text-text-primary">
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                    Снять
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={uploading}
                      onChange={e => handlePhotoUpload(e, 'completion')}
                    />
                  </label>
                  <label className="cursor-pointer flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-elevated/60 hover:bg-surface-elevated text-caption text-text-primary">
                    <Image className="w-3.5 h-3.5" />
                    Галерея
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={e => handlePhotoUpload(e, 'completion')}
                    />
                  </label>
                </div>
              </div>
              {photos.filter(p => p.photo_type === 'completion').length > 0 && (
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {photos.filter(p => p.photo_type === 'completion').map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPhotoPreview(p.file_url)}
                      className="aspect-square rounded-lg overflow-hidden border border-border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.file_url || ''} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Act photos block */}
            <div className={`rounded-xl border p-3 space-y-2 ${
              actPhotos > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-400/30 bg-amber-400/5'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-body-sm">
                  {actPhotos > 0
                    ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    : <XCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                  <span className="text-text-primary">
                    Акт выполненных работ {actPhotos > 0 && `(${actPhotos})`}
                  </span>
                </div>
                <label className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-elevated/60 hover:bg-surface-elevated text-caption text-text-primary">
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Добавить
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={e => handlePhotoUpload(e, 'act')}
                  />
                </label>
              </div>
              {photos.filter(p => p.photo_type === 'act').length > 0 && (
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {photos.filter(p => p.photo_type === 'act').map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPhotoPreview(p.file_url)}
                      className="aspect-square rounded-lg overflow-hidden border border-border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.file_url || ''} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
              completeMode === 'full' ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/40'
            }`}>
              <input
                type="radio"
                name="complete_mode"
                checked={completeMode === 'full'}
                onChange={() => setCompleteMode('full')}
                className="mt-0.5"
              />
              <div className="flex-1">
                <p className="text-body-sm font-medium text-text-primary">Выполнена полностью</p>
                <p className="text-caption text-text-tertiary mt-0.5">Все работы по заявке сделаны.</p>
              </div>
            </label>
            <label className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
              completeMode === 'partial' ? 'border-amber-400 bg-amber-400/10' : 'border-border hover:border-amber-400/40'
            }`}>
              <input
                type="radio"
                name="complete_mode"
                checked={completeMode === 'partial'}
                onChange={() => setCompleteMode('partial')}
                className="mt-0.5"
              />
              <div className="flex-1">
                <p className="text-body-sm font-medium text-text-primary">Выполнена частично / не выполнена</p>
                <p className="text-caption text-text-tertiary mt-0.5">Выезд был, но часть работ осталась. Обязательно укажите, что осталось сделать.</p>
              </div>
            </label>
          </div>
          {completeMode === 'partial' && (
            <Textarea
              label="Что осталось сделать / причина"
              placeholder="Например: не хватило светильника, нужно приехать повторно"
              value={partialComment}
              onChange={e => setPartialComment(e.target.value)}
              rows={3}
            />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowCompleteModal(false)} className="flex-1">Отмена</Button>
            <Button
              onClick={completeTicket}
              loading={completing}
              disabled={!photosOk || (completeMode === 'partial' && !partialComment.trim())}
              className="flex-1"
            >
              <CheckCircle className="w-4 h-4" />
              Подтвердить
            </Button>
          </div>
        </div>
          )
        })()}
      </Modal>

      {/* Admin: edit ticket metadata (category / priority / emergency) */}
      <Modal isOpen={showEditMetaModal} onClose={() => setShowEditMetaModal(false)} title="Параметры заявки">
        <div className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-text-secondary mb-1.5">Категория</label>
            <select
              value={editCategoryId}
              onChange={e => setEditCategoryId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-surface-muted/30 text-text-primary text-body-sm focus:outline-none focus:ring-2 focus:ring-accent/15"
            >
              {editAllCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-body-sm font-medium text-text-secondary mb-1.5">Приоритет</label>
            <div className="flex gap-2">
              {[
                { value: 'normal' as const, label: 'Обычный' },
                { value: 'high' as const, label: 'Высокий' },
              ].map(p => (
                <button
                  key={p.value}
                  onClick={() => setEditPriority(p.value)}
                  className={`flex-1 py-2 px-3 rounded-xl border text-body-sm font-medium transition-all ${
                    editPriority === p.value
                      ? 'border-accent/40 bg-accent/10 text-accent ring-2 ring-accent/15'
                      : 'border-border text-text-tertiary hover:border-border-strong'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {(editPriority === 'low' || editPriority === 'urgent') && (
              <p className="text-caption text-text-tertiary mt-1">
                Текущее значение «{editPriority === 'low' ? 'Низкий' : 'Срочный'}» осталось от старой схемы. При сохранении новый приоритет перезапишет его.
              </p>
            )}
          </div>
          <label className="flex items-start gap-3 p-3 rounded-xl border border-red-500/20 bg-red-500/5 cursor-pointer">
            <input
              type="checkbox"
              checked={editIsEmergency}
              onChange={e => setEditIsEmergency(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-red-500"
            />
            <div className="flex-1">
              <p className="text-body-sm font-semibold text-text-primary flex items-center gap-1.5">
                <Siren className="w-3.5 h-3.5 text-red-400" />
                Аварийная заявка
              </p>
              <p className="text-caption text-text-tertiary mt-0.5">
                Попадает в плитку «Аварийные» на дашборде. Выставляется автоматически для аварийных категорий — но вы можете включить вручную для любой заявки.
              </p>
            </div>
          </label>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowEditMetaModal(false)} className="flex-1">Отмена</Button>
            <Button onClick={saveMeta} loading={savingMeta} className="flex-1">Сохранить</Button>
          </div>
        </div>
      </Modal>

      {/* Reject modal */}
      <Modal isOpen={showRejectModal} onClose={() => setShowRejectModal(false)} title="Отклонить заявку">
        <div className="space-y-4">
          <Textarea
            label="Причина отклонения"
            placeholder="Укажите причину..."
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            rows={3}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowRejectModal(false)} className="flex-1">
              Отмена
            </Button>
            <Button variant="danger" onClick={rejectTicket} disabled={!rejectReason.trim()} className="flex-1">
              Отклонить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
