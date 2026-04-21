import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const MONTH_NAMES_RU = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

function parseMonth(month: string | null): { year: number; monthIdx: number } | null {
  if (!month) return null
  const m = month.match(/^(\d{4})-(\d{1,2})$/)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const monthIdx = parseInt(m[2], 10) - 1
  if (monthIdx < 0 || monthIdx > 11) return null
  return { year, monthIdx }
}

function firstDayOfMonth(year: number, monthIdx: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`
}

function firstDayOfNextMonth(year: number, monthIdx: number): string {
  const ny = monthIdx === 11 ? year + 1 : year
  const nm = monthIdx === 11 ? 0 : monthIdx + 1
  return `${ny}-${String(nm + 1).padStart(2, '0')}-01`
}

const THIN = { style: 'thin' as const, color: { argb: 'FF000000' } }
const BORDER_ALL = { top: THIN, bottom: THIN, left: THIN, right: THIN }

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const monthParam = url.searchParams.get('month')
  const rowsPerStoreParam = parseInt(url.searchParams.get('rows') || '8', 10)
  const rowsPerStore = Math.max(3, Math.min(30, isNaN(rowsPerStoreParam) ? 8 : rowsPerStoreParam))

  const parsed = parseMonth(monthParam)
  if (!parsed) {
    return NextResponse.json({ error: 'month parameter required in YYYY-MM format' }, { status: 400 })
  }
  const { year, monthIdx } = parsed
  const fromIso = firstDayOfMonth(year, monthIdx)
  const toIso = firstDayOfNextMonth(year, monthIdx)

  const { data: tickets, error } = await supabase
    .from('tickets')
    .select(`
      completed_at,
      store:stores(store_number, name)
    `)
    .in('status', ['completed', 'verified'])
    .gte('completed_at', fromIso)
    .lt('completed_at', toIso)
    .order('completed_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Entry = { date: Date; storeNumber: string; storeName: string }
  const seen = new Set<string>()
  const entries: Entry[] = []
  ;(tickets || []).forEach(t => {
    const store = Array.isArray(t.store) ? t.store[0] : t.store
    if (!t.completed_at || !store) return
    const d = new Date(t.completed_at as string)
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const num = (store as { store_number?: string }).store_number || ''
    const name = (store as { name?: string }).name || ''
    const key = `${dateKey}|${num}|${name}`
    if (seen.has(key)) return
    seen.add(key)
    entries.push({
      date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
      storeNumber: num,
      storeName: name,
    })
  })

  entries.sort((a, b) => a.date.getTime() - b.date.getTime())

  const wb = new ExcelJS.Workbook()
  wb.creator = 'KariDesk'
  wb.created = new Date()
  const sheetName = (MONTH_NAMES_RU[monthIdx].charAt(0).toUpperCase() + MONTH_NAMES_RU[monthIdx].slice(1)).slice(0, 31)
  const ws = wb.addWorksheet(sheetName)

  ws.getColumn(1).width = 8
  ws.getColumn(2).width = 14
  ws.getColumn(3).width = 36
  ws.getColumn(4).width = 12
  ws.getColumn(5).width = 18
  ws.getColumn(6).width = 10
  ws.getColumn(7).width = 14
  ws.getColumn(8).width = 14
  ws.getColumn(9).width = 12

  ws.mergeCells('C1:F1')
  const titleCell = ws.getCell('C1')
  titleCell.value = 'Магазины Kari'
  titleCell.font = { bold: true, size: 14 }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 22

  ws.mergeCells('A3:H3')
  const descCell = ws.getCell('A3')
  descCell.value = 'ЗАКАЗЧИК поручает ИСПОЛНИТЕЛЮ, а ИСПОЛНИТЕЛЬ обязуется выполнить следующую работу на объектах ЗАКАЗЧИКА'
  descCell.font = { bold: true }
  descCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  ws.getRow(3).height = 28

  ws.mergeCells('A4:A5')
  ws.getCell('A4').value = 'Номер'
  ws.mergeCells('B4:B5')
  ws.getCell('B4').value = ''
  ws.mergeCells('C4:C5')
  ws.getCell('C4').value = 'Наименование работ'
  ws.mergeCells('D4:D5')
  ws.getCell('D4').value = 'Номер единичной расценки'
  ws.mergeCells('E4:E5')
  ws.getCell('E4').value = 'Единица измерения'
  ws.mergeCells('F4:H4')
  ws.getCell('F4').value = 'выполнено работ'
  ws.getCell('A5').value = 'по\nпоряд-\nку'
  ws.getCell('B5').value = 'позиции по смете'
  ws.getCell('F5').value = 'кол-во'
  ws.getCell('G5').value = 'цена за единицу,\nруб.'
  ws.getCell('H5').value = 'стоимость,\nруб.'

  for (let r = 4; r <= 5; r++) {
    for (let c = 1; c <= 8; c++) {
      const cell = ws.getCell(r, c)
      cell.font = { bold: true, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = BORDER_ALL
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
    }
  }
  ws.getRow(4).height = 30
  ws.getRow(5).height = 40

  let currentRow = 6

  if (entries.length === 0) {
    ws.mergeCells(`A${currentRow}:H${currentRow}`)
    const c = ws.getCell(`A${currentRow}`)
    c.value = `За ${MONTH_NAMES_RU[monthIdx]} ${year} выполненных заявок не найдено`
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.font = { italic: true, color: { argb: 'FF888888' } }
  }

  entries.forEach(entry => {
    ws.mergeCells(`A${currentRow}:H${currentRow}`)
    const dateCell = ws.getCell(`A${currentRow}`)
    dateCell.value = entry.date
    dateCell.numFmt = 'dd.mm.yyyy'
    dateCell.font = { bold: true }
    dateCell.alignment = { horizontal: 'left', vertical: 'middle' }
    dateCell.border = BORDER_ALL
    currentRow += 1

    const storeNameCell = ws.getCell(`E${currentRow}`)
    storeNameCell.value = entry.storeName
    storeNameCell.font = { bold: true }
    storeNameCell.alignment = { horizontal: 'center', vertical: 'middle' }
    const storeNumCell = ws.getCell(`H${currentRow}`)
    const numAsInt = /^\d+$/.test(entry.storeNumber) ? parseInt(entry.storeNumber, 10) : entry.storeNumber
    storeNumCell.value = numAsInt
    storeNumCell.font = { bold: true }
    storeNumCell.alignment = { horizontal: 'center', vertical: 'middle' }
    for (let c = 1; c <= 8; c++) ws.getCell(currentRow, c).border = BORDER_ALL
    currentRow += 1

    const firstWorkRow = currentRow
    for (let i = 1; i <= rowsPerStore; i++) {
      const r = currentRow
      ws.getCell(r, 1).value = i
      ws.getCell(r, 1).alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getCell(r, 8).value = { formula: `F${r}*G${r}`, result: null as unknown as number }
      for (let c = 1; c <= 8; c++) ws.getCell(r, c).border = BORDER_ALL
      currentRow += 1
    }
    const lastWorkRow = currentRow - 1

    const totalRow = currentRow
    ws.getCell(totalRow, 8).value = { formula: `SUM(H${firstWorkRow}:H${lastWorkRow})`, result: null as unknown as number }
    ws.getCell(totalRow, 8).font = { bold: true }
    ws.getCell(totalRow, 9).value = { formula: `H${totalRow}`, result: null as unknown as number }
    for (let c = 1; c <= 8; c++) ws.getCell(totalRow, c).border = BORDER_ALL
    currentRow += 1
  })

  const buffer = await wb.xlsx.writeBuffer()
  const fileName = `estimate_template_${year}_${String(monthIdx + 1).padStart(2, '0')}.xlsx`
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
