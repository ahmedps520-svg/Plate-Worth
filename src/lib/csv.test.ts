import { describe, expect, it } from 'vitest'
import { csvCell, scansToCsv } from './csv'
import type { ScanRecord } from './db'

const record: ScanRecord = {
  id: 'a',
  createdAt: Date.UTC(2026, 10, 24, 9, 30),
  updatedAt: Date.UTC(2026, 10, 24, 9, 30),
  thumbnail: 'data:image/jpeg;base64,xx',
  locale: 'en',
  result: {
    plate: { arabic: 'ا ب ح', latin: 'J B A', digits: '7777', confidence: 'high' },
    vehicle: { make: 'Toyota', model: 'Camry', yearRange: '2019–2021', color: 'White', confidence: 'medium' },
    vehiclePriceSAR: { low: 70000, typical: 78000, high: 86000, basis: 'Syarah, "used" listings' },
    plateValueSAR: { low: 20000, typical: 35000, high: 60000, reasoning: 'Four repeated digits' },
    sources: [
      { title: 'A', url: 'https://syarah.com/1' },
      { title: 'B', url: 'https://haraj.com.sa/2' },
    ],
    notes: '=HYPERLINK("http://evil")',
  },
}

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('neutralizes spreadsheet formulas', () => {
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('-2')).toBe("'-2")
  })

  it('writes numbers raw and empties for missing values', () => {
    expect(csvCell(78000)).toBe('78000')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })
})

describe('scansToCsv', () => {
  it('produces a BOM, a header row and one row per scan', () => {
    const csv = scansToCsv([record])
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).trimEnd().split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0].split(',')).toHaveLength(20)
    expect(lines[1]).toContain('2026-11-24T09:30:00.000Z')
    expect(lines[1]).toContain('ا ب ح')
    expect(lines[1]).toContain('"Syarah, ""used"" listings"')
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil"")"`)
    expect(lines[1]).toContain('https://syarah.com/1 | https://haraj.com.sa/2')
  })

  it('leaves empty cells for missing vehicle and prices', () => {
    const csv = scansToCsv([
      { ...record, result: { ...record.result, vehicle: null, vehiclePriceSAR: null, plateValueSAR: null, sources: [] } },
    ])
    const row = csv.slice(1).trimEnd().split('\r\n')[1]
    expect(row).toMatch(/^2026-11-24T09:30:00\.000Z,ا ب ح,J B A,7777,high,,,,,,,,,,,,,,/)
  })
})
