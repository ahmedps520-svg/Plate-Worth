import { describe, expect, it } from 'vitest'
import {
  arabicToLatinLetter,
  isPlateUnreadable,
  latinToArabicLetter,
  normalizeArabicLetters,
  normalizeDigits,
  normalizeLatinLetters,
  SAUDI_PLATE_LETTERS,
  toArabicIndicDigits,
} from './plate'

describe('Saudi plate alphabet', () => {
  it('has 17 letters with unique Latin equivalents', () => {
    expect(SAUDI_PLATE_LETTERS).toHaveLength(17)
    expect(new Set(SAUDI_PLATE_LETTERS.map((l) => l.latin)).size).toBe(17)
  })

  it('maps letters both ways', () => {
    expect(arabicToLatinLetter('ح')).toBe('J')
    expect(arabicToLatinLetter('أ')).toBe('A')
    expect(latinToArabicLetter('x')).toBe('ص')
    expect(latinToArabicLetter('Q')).toBeUndefined()
  })
})

describe('normalizers', () => {
  it('converts Arabic-Indic and Persian digits', () => {
    expect(normalizeDigits('١٢٣٤')).toBe('1234')
    expect(normalizeDigits('۷ 7-7')).toBe('777')
    expect(toArabicIndicDigits('2050')).toBe('٢٠٥٠')
  })

  it('normalizes letters to spaced canonical form', () => {
    expect(normalizeArabicLetters('ابح')).toBe('ا ب ح')
    expect(normalizeArabicLetters('هـ ي إ')).toBe('ه ى ا')
    expect(normalizeArabicLetters('ا ب ف')).toBe('ا ب') // ف is not a plate letter
    expect(normalizeLatinLetters('j-b a1')).toBe('J B A')
  })

  it('detects unreadable plates', () => {
    expect(isPlateUnreadable({ arabic: '', latin: '', digits: '' })).toBe(true)
    expect(isPlateUnreadable({ arabic: '', latin: '', digits: '1' })).toBe(false)
  })
})
