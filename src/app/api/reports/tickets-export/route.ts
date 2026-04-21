import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { TICKET_STATUSES, TICKET_PRIORITIES } from '@/lib/constants'
import type { TicketStatus, TicketPriority } from '@/types/database'

export const dynamic = 'force-dynamic'

type Scope = 'active' | 'completed' | 'all'

const ACTIVE_STATUSES: TicketStatus[] = ['new', 'assigned', 'in_progress', 'info_requested']
const COMPLETED_STATUSES: TicketStatus[] = ['completed', 'partially_completed', 'verified']

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const scope = (url.searchParams.get('scope') || 'all') as Scope

  let query = supabase
    .from('tickets')
    .select(`
      ticket_number,
      description,
      status,
      priority,
      contact_phone,
      created_at,
      assigned_at,
      deadline,
      completed_at,
      verified_at,
      store:stores(store_number, name, city, address),
      category:ticket_categories(name),
      division:divisions(name),
      creator:profiles!tickets_created_by_fkey(full_name, phone),
      assignee:profiles!tickets_assigned_to_fkey(full_name, phone)
    `)
    .order('created_at', { ascending: false })

  if (scope === 'active') {
    query = query.in('status', ACTIVE_STATUSES)
    if (from) query = query.gte('created_at', from)
    if (to) query = query.lte('created_at', `${to}T23:59:59`)
  } else if (scope === 'completed') {
    query = query.in('status', COMPLETED_STATUSES)
    if (from) query = query.gte('completed_at', from)
    if (to) query = query.lte('completed_at', `${to}T23:59:59`)
  } else {
    if (from) query = query.gte('created_at', from)
    if (to) query = query.lte('created_at', `${to}T23:59:59`)
  }

  const { data: tickets, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const wb = new ExcelJS.Workbook()
  wb.creator = 'KariDesk'
  wb.created = new Date()
  const ws = wb.addWorksheet('Заявки', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  ws.columns = [
    { header: '№', key: 'num', width: 8 },
    { header: 'Дата создания', key: 'created', width: 18 },
    { header: 'Статус', key: 'status', width: 16 },
    { header: 'Приоритет', key: 'priority', width: 12 },
    { header: 'Категория', key: 'category', width: 22 },
    { header: 'Подразделение', key: 'division', width: 16 },
    { header: 'Магазин', key: 'store_num', width: 10 },
    { header: 'ТЦ / название', key: 'store_name', width: 28 },
    { header: 'Город', key: 'city', width: 18 },
    { header: 'Адрес', key: 'address', width: 36 },
    { header: 'Описание', key: 'description', width: 50 },
    { header: 'Контактный телефон', key: 'contact_phone', width: 18 },
    { header: 'Исполнитель', key: 'assignee', width: 24 },
    { header: 'Создал', key: 'creator', width: 24 },
    { header: 'Назначена', key: 'assigned_at', width: 18 },
    { header: 'Дедлайн', key: 'deadline', width: 18 },
    { header: 'Выполнена', key: 'completed_at', width: 18 },
  ]

  const header = ws.getRow(1)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  header.height = 28
  header.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE91E8C' } }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
    }
  })

  const fmtDate = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  const pick = <T extends Record<string, unknown>>(v: T | T[] | null | undefined): T | null => {
    if (!v) return null
    return Array.isArray(v) ? (v[0] ?? null) : v
  }

  ;(tickets || []).forEach(t => {
    const store = pick(t.store as never) as { store_number?: string; name?: string; city?: string; address?: string } | null
    const category = pick(t.category as never) as { name?: string } | null
    const division = pick(t.division as never) as { name?: string } | null
    const creator = pick(t.creator as never) as { full_name?: string; phone?: string } | null
    const assignee = pick(t.assignee as never) as { full_name?: string; phone?: string } | null

    ws.addRow({
      num: t.ticket_number,
      created: fmtDate(t.created_at as string),
      status: TICKET_STATUSES[t.status as TicketStatus]?.label || t.status,
      priority: TICKET_PRIORITIES[t.priority as TicketPriority]?.label || t.priority,
      category: category?.name || '',
      division: division?.name || '',
      store_num: store?.store_number || '',
      store_name: store?.name || '',
      city: store?.city || '',
      address: store?.address || '',
      description: t.description,
      contact_phone: t.contact_phone,
      assignee: assignee?.full_name || '',
      creator: creator?.full_name || '',
      assigned_at: fmtDate(t.assigned_at as string | null),
      deadline: fmtDate(t.deadline as string | null),
      completed_at: fmtDate(t.completed_at as string | null),
    })
  })

  ws.eachRow({ includeEmpty: false }, (row, idx) => {
    if (idx === 1) return
    row.alignment = { vertical: 'top', wrapText: true }
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFEDEDED' } },
        bottom: { style: 'thin', color: { argb: 'FFEDEDED' } },
        left: { style: 'thin', color: { argb: 'FFEDEDED' } },
        right: { style: 'thin', color: { argb: 'FFEDEDED' } },
      }
    })
  })

  const buffer = await wb.xlsx.writeBuffer()
  const fromTag = from || 'all'
  const toTag = to || 'all'
  const fileName = `tickets_${scope}_${fromTag}_${toTag}.xlsx`
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
