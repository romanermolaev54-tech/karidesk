import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// User-initiated test push: inserts a notification for themself.
// The DB trigger then calls /api/push/send via pg_net and the user receives
// the push on every device they're subscribed on.
export async function POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: user.id,
      title: '✅ Тест уведомлений',
      message: 'Если вы видите это сообщение как push — всё работает.',
      type: 'info',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, notification_id: data.id })
}
