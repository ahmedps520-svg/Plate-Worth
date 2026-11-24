import type { ScanRecord } from './db'

const HEADERS = [
  'scanned_at',
  'plate_arabic',
  'plate_latin',
  'plate_digits',
  'plate_confidence',
  'vehicle_make',
  'vehicle_model',
  'vehicle_year_range',
  'vehicle_color',
  'vehicle_confidence',
  'vehicle_price_low_sar',
  'vehicle_price_typical_sar',
  'vehicle_price_high_sar',
  'vehicle_price_basis',
  'plate_value_low_sar',
  'plate_value_typical_sar',
  'plate_value_high_sar',
  'plate_value_reasoning',
  'notes',
  'sources',
] as const

type Cell = string | number | null | undefined

/**
 * Quotes a CSV cell (RFC 4180) and neutralizes spreadsheet formula injection:
 * text starting with = + - @ (or a tab/CR) is prefixed with an apostrophe so
 * Excel/Sheets treat it as text. Numbers are written as-is.
 */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  let text = value
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  if (/[",\r\n]/.test(text) || text !== text.trim()) text = `"${text.replace(/"/g, '""')}"`
  return text
}

export function scansToCsv(records: ScanRecord[]): string {
  const rows = records.map((record) => {
    const { plate, vehicle, vehiclePriceSAR: vp, plateValueSAR: pv, sources, notes } = record.result
    const cells: Cell[] = [
      new Date(record.createdAt).toISOString(),
      plate.arabic,
      plate.latin,
      plate.digits,
      plate.confidence,
      vehicle?.make,
      vehicle?.model,
      vehicle?.yearRange,
      vehicle?.color,
      vehicle?.confidence,
      vp?.low,
      vp?.typical,
      vp?.high,
      vp?.basis,
      pv?.low,
      pv?.typical,
      pv?.high,
      pv?.reasoning,
      notes,
      sources.map((s) => s.url).join(' | '),
    ]
    return cells.map(csvCell).join(',')
  })
  // UTF-8 BOM so Excel opens Arabic text correctly; CRLF per RFC 4180.
  return `﻿${[HEADERS.join(','), ...rows].join('\r\n')}\r\n`
}

export function csvFilename(now = new Date()): string {
  return `plateworth-history-${now.toISOString().slice(0, 10)}.csv`
}

/** Saves the CSV via the share sheet on phones, or a regular download elsewhere. */
export async function exportCsv(filename: string, content: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([content], filename, { type: 'text/csv' })
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  if (coarse && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return 'cancelled'
      // Sharing failed for another reason: fall back to a download.
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.parentNode?.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
