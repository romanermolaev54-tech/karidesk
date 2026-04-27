import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'
const MODEL = 'deepseek-chat' // currently aliased to deepseek-v4-flash, very fast & cheap

interface CheckBody {
  category_name?: string
  description?: string
  has_photos?: boolean
}

interface AIResult {
  ok: boolean
  missing: string[]
  suggest_photo: boolean
  photo_reason: string | null
}

const SYSTEM_PROMPT = `Ты — опытный диспетчер службы эксплуатации сети магазинов «Кари». Твоя задача — посмотреть на описание заявки от сотрудника магазина и понять, достаточно ли в нём информации, чтобы подрядчик мог взять задачу без дополнительных уточнений.

Хорошее описание содержит:
1. ЧТО конкретно сломалось (не «сломалось», а «касса №2», «верхний светильник в примерочной»)
2. КАК проявляется проблема (не «не работает», а «зависает при печати», «мерцает», «совсем не включается»)
3. ГДЕ это находится (зал / склад / примерочная / касса №X / итд) — если применимо

Если описание уже содержит всё это — верни ok=true и пустой missing.
Если чего-то не хватает — верни ok=false и 1-3 КОРОТКИХ уточнения, сформулированных как вопросы (не как претензии).

Также: если категория или содержание предполагает физическое повреждение / поломку оборудования / утечку / визуальный осмотр — отметь suggest_photo=true (даже если описание идеальное), потому что фото сильно ускорит работу подрядчика. Не предлагай фото для бумажных вопросов (например, «нужно подписать акт»).

ВАЖНО: отвечай ТОЛЬКО валидным JSON по схеме:
{
  "ok": boolean,
  "missing": [string, string, ...],
  "suggest_photo": boolean,
  "photo_reason": string или null
}

Без пояснений, без markdown, без \`\`\`json. Только JSON-объект.`

function buildUserPrompt(body: CheckBody): string {
  const cat = body.category_name || 'не указана'
  const desc = (body.description || '').trim()
  const photos = body.has_photos ? 'да' : 'нет'
  return `Категория: ${cat}\nФото уже приложено: ${photos}\n\nОписание заявки:\n${desc}`
}

async function callDeepSeek(body: CheckBody, signal: AbortSignal): Promise<AIResult | null> {
  if (!DEEPSEEK_KEY) return null
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(body) },
      ],
      temperature: 0.2,
      max_tokens: 300,
      // DeepSeek supports JSON mode — forces the response to be valid JSON,
      // saves us from parsing markdown fences or apologetic prose.
      response_format: { type: 'json_object' },
    }),
    signal,
  })
  if (!res.ok) return null
  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = data.choices?.[0]?.message?.content
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as AIResult
    // Sanitize: ensure shape is what we expect, ignore anything extra
    return {
      ok: !!parsed.ok,
      missing: Array.isArray(parsed.missing) ? parsed.missing.filter(s => typeof s === 'string').slice(0, 3) : [],
      suggest_photo: !!parsed.suggest_photo,
      photo_reason: typeof parsed.photo_reason === 'string' ? parsed.photo_reason : null,
    }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  // Auth: only logged-in users can hit this. Prevents random people from
  // burning your DeepSeek credits.
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!DEEPSEEK_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  let body: CheckBody
  try {
    body = (await req.json()) as CheckBody
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const desc = (body.description || '').trim()
  // Skip very short input — no point analysing 5 chars.
  if (desc.length < 10) {
    return NextResponse.json({ skipped: true, reason: 'too_short' })
  }
  // Cap input — we never need more than ~1000 chars to evaluate completeness,
  // and very long input wastes tokens.
  if (desc.length > 1500) {
    body.description = desc.slice(0, 1500)
  }

  // Hard 6-second timeout. If DeepSeek is slow, the user shouldn't suffer —
  // we silently return null and the UI just doesn't show suggestions.
  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), 6000)
  try {
    const result = await callDeepSeek(body, ctrl.signal)
    if (!result) {
      return NextResponse.json({ skipped: true, reason: 'ai_unavailable' })
    }
    return NextResponse.json({ result })
  } catch {
    return NextResponse.json({ skipped: true, reason: 'timeout' })
  } finally {
    clearTimeout(timeoutId)
  }
}
