import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// TTL for a generated link. Long enough for an admin to hand it over the same
// day, short enough that a lost link stops being useful quickly.
const TTL_HOURS = 24

export async function POST(_req: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: me } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'admin only' }, { status: 403 })
  }

  const targetId = ctx.params.id
  const admin = createServiceRoleClient()

  // Verify the target user actually exists in auth.users
  const { data: targetUser, error: getErr } = await admin.auth.admin.getUserById(targetId)
  if (getErr || !targetUser?.user) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 })
  }

  // 32 bytes → 43-char urlsafe token. Enough entropy that guessing is not a threat.
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000).toISOString()

  // Invalidate any earlier unused tokens for this user so the freshly-sent
  // link is the only one that works.
  await admin
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', targetId)
    .is('used_at', null)

  const { error: insErr } = await admin
    .from('password_reset_tokens')
    .insert({
      token,
      user_id: targetId,
      created_by: user.id,
      expires_at: expiresAt,
    })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // Build absolute URL using the same host the admin is on right now.
  const proto = _req.headers.get('x-forwarded-proto') || 'https'
  const host = _req.headers.get('host') || 'localhost:3000'
  const url = `${proto}://${host}/set-password?token=${token}`

  return NextResponse.json({
    url,
    expires_at: expiresAt,
    email: targetUser.user.email,
  })
}
