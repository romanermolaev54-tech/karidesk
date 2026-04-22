import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@24karidesk.ru'
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
const SEND_SECRET = process.env.PUSH_SEND_SECRET

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

interface SendBody {
  user_id?: string
  notification_id?: string
  title?: string
  body?: string
  ticket_id?: string | null
  type?: string
}

interface PushSubRow {
  endpoint: string
  p256dh: string
  auth: string
}

function extractSecret(req: NextRequest): string | null {
  const raw = req.headers.get('x-push-secret') || req.headers.get('authorization')
  if (!raw) return null
  return raw.replace(/^Bearer\s+/i, '').trim()
}

export async function POST(req: NextRequest) {
  if (!SEND_SECRET) {
    return NextResponse.json({ error: 'PUSH_SEND_SECRET not configured' }, { status: 500 })
  }
  const provided = extractSecret(req)
  if (!provided || provided !== SEND_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return NextResponse.json({ error: 'VAPID not configured' }, { status: 500 })
  }

  let payload: SendBody
  try {
    payload = await req.json() as SendBody
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  let title = payload.title
  let body = payload.body
  let ticketId = payload.ticket_id
  let type = payload.type
  let userId = payload.user_id

  // If notification_id is provided, load the row from DB (used by DB trigger)
  if (payload.notification_id) {
    const { data: notif } = await supabase
      .from('notifications')
      .select('user_id, title, message, ticket_id, type')
      .eq('id', payload.notification_id)
      .single()
    if (notif) {
      userId = notif.user_id as string
      title = notif.title as string
      body = notif.message as string
      ticketId = notif.ticket_id as string | null
      type = notif.type as string
    }
  }

  if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: 'no subscriptions' })
  }

  const pushPayload = JSON.stringify({
    title: title || 'KariDesk',
    body: body || '',
    ticket_id: ticketId,
    type,
    url: ticketId ? `/tickets/${ticketId}` : '/notifications',
  })

  let sent = 0
  const toDelete: string[] = []

  await Promise.all((subs as PushSubRow[]).map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        pushPayload
      )
      sent++
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) {
        toDelete.push(sub.endpoint)
      }
    }
  }))

  if (toDelete.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', toDelete)
  }

  return NextResponse.json({ ok: true, sent, cleaned: toDelete.length })
}
