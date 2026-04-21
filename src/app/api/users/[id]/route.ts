import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface Body {
  full_name?: string | null
  phone?: string | null
  role?: 'admin' | 'director' | 'employee' | 'contractor'
  division_id?: string | null
  store_id?: string | null
  is_active?: boolean
  password?: string
  release?: boolean
}

async function ensureAdmin(): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'unauthorized' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return { ok: false, status: 403, error: 'admin only' }
  }
  return { ok: true }
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const check = await ensureAdmin()
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  const targetId = ctx.params.id
  let body: Body
  try {
    body = await req.json() as Body
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const admin = createServiceRoleClient()

  if (body.release) {
    // Clear name/phone, block and reset to a random throwaway password
    const defaultName = 'Свободный аккаунт'
    const randomPass = 'free-' + Math.random().toString(36).slice(2, 10)
    const { error: pErr } = await admin
      .from('profiles')
      .update({
        full_name: defaultName,
        phone: '',
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetId)
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    const { error: aErr } = await admin.auth.admin.updateUserById(targetId, { password: randomPass })
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, released: true })
  }

  // Optional password change
  if (body.password) {
    const { error } = await admin.auth.admin.updateUserById(targetId, { password: body.password })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.full_name === 'string') updates.full_name = body.full_name
  if (typeof body.phone === 'string') updates.phone = body.phone
  if (body.role) updates.role = body.role
  if ('division_id' in body) updates.division_id = body.division_id ?? null
  if ('store_id' in body) updates.store_id = body.store_id ?? null
  if (typeof body.is_active === 'boolean') updates.is_active = body.is_active

  if (Object.keys(updates).length > 1) {
    const { error } = await admin.from('profiles').update(updates).eq('id', targetId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
