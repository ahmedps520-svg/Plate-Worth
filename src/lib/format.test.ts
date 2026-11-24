import { describe, expect, it } from 'vitest'
import {
  formatNumber,
  formatSAR,
  formatSARCompact,
  formatSARRange,
  formatUSDFromSAR,
  hostnameOf,
  rangePosition,
  sarToUsd,
} from './format'

describe('price formatting', () => {
  it('formats SAR in English with grouping and no decimals', () => {
    expect(formatSAR(85000, 'en')).toBe('SAR 85,000')
    expect(formatSAR(1234567.6, 'en')).toBe('SAR 1,234,568')
    expect(formatSAR(0, 'en')).toBe('SAR 0')
  })

  it('formats SAR in Arabic with Western digits and the riyal abbreviation after the number', () => {
    expect(formatSAR(85000, 'ar')).toBe('85,000 ر.س')
    expect(formatNumber(1500, 'ar')).toBe('1,500')
  })

  it('formats ranges, collapsing equal bounds', () => {
    expect(formatSARRange(80000, 95000, 'en')).toBe('SAR 80,000 – 95,000')
    expect(formatSARRange(80000, 95000, 'ar')).toBe('80,000 – 95,000 ر.س')
    expect(formatSARRange(5000, 5000, 'en')).toBe('SAR 5,000')
  })

  it('converts to USD at the 3.75 peg', () => {
    expect(sarToUsd(375)).toBe(100)
    expect(formatUSDFromSAR(85000, 'en')).toBe('≈ $22,667')
    expect(formatUSDFromSAR(3750, 'ar')).toBe('≈ 1,000 دولار')
  })

  it('formats compact amounts for list rows', () => {
    expect(formatSARCompact(9500, 'en')).toBe('SAR 9,500')
    expect(formatSARCompact(1_250_000, 'en')).toBe('SAR 1.3M')
    expect(formatSARCompact(85_000, 'en')).toBe('SAR 85K')
  })
})

describe('helpers', () => {
  it('positions the typical value within the range', () => {
    expect(rangePosition(0, 50, 100)).toBe(50)
    expect(rangePosition(100, 100, 100)).toBe(50)
    expect(rangePosition(0, 150, 100)).toBe(100)
  })

  it('extracts hostnames', () => {
    expect(hostnameOf('https://www.haraj.com.sa/1234')).toBe('haraj.com.sa')
    expect(hostnameOf('not a url')).toBe('not a url')
  })
})
