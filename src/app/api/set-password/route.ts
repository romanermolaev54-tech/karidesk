import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface Body {
  token?: string
  password?: string
}

// GET — validate token without consuming it. Used by the page to decide
// whether to show the form or an "invalid/expired link" message.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ ok: false, reason: 'missing_token' }, { status: 400 })

  const admin = createServiceRoleClient()
  const { data: row } = await admin
    .from('password_reset_tokens')
    .select('token, user_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()

  if (!row) return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 })
  if (row.used_at) return NextResponse.json({ ok: false, reason: 'used' }, { status: 410 })
  if (new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ ok: false, reason: 'expired' }, { status: 410 })
  }

  const { data: userRes } = await admin.auth.admin.getUserById(row.user_id)
  return NextResponse.json({
    ok: true,
    email: userRes?.user?.email ?? null,
  })
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = await req.json() as Body
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  const { token, password } = body
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'missing token' }, { status: 400 })
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return NextResponse.json({ error: 'Пароль должен содержать минимум 6 символов' }, { status: 400 })
  }

  const admin = createServiceRoleClient()

  // Consume the token atomically: only rows with used_at=null and expires_at
  // in the future flip to used. Prevents a race where two submits with the
  // same token both succeed.
  const nowIso = new Date().toISOString()
  const { data: consumed, error: updErr } = await admin
    .from('password_reset_tokens')
    .update({ used_at: nowIso })
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', nowIso)
    .select('user_id')
    .maybeSingle()

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  if (!consumed) return NextResponse.json({ error: 'Ссылка недействительна или уже использована' }, { status: 410 })

  const { error: pwErr } = await admin.auth.admin.updateUserById(consumed.user_id, { password })
  if (pwErr) {
    // Rollback: the token was consumed but password change failed — clear used_at
    // so the user can retry with the same link. Better than losing the link entirely.
    await admin
      .from('password_reset_tokens')
      .update({ used_at: null })
      .eq('token', token)
    return NextResponse.json({ error: pwErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
