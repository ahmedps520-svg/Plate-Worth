import { describe, expect, it } from 'vitest'
import {
  estimateRequestSchema,
  estimateResultSchema,
  extractJsonObject,
  parseEstimateReply,
  vehicleCorrectionSchema,
} from './schema'

const validResult = {
  plate: { arabic: 'ا ب ح', latin: 'J B A', digits: '1234', confidence: 'high' },
  vehicle: { make: 'Toyota', model: 'Land Cruiser', yearRange: '2016–2021', color: 'White', confidence: 'medium' },
  vehiclePriceSAR: { low: 180000, typical: 205000, high: 230000, basis: 'Syarah and Haraj listings, ~20,000 km/year' },
  plateValueSAR: { low: 0, typical: 1000, high: 3000, reasoning: 'Ordinary four-digit sequence.' },
  sources: [{ title: 'Syarah listing', url: 'https://syarah.com/en/car/123' }],
  notes: 'Rough estimate.',
}

describe('estimateResultSchema', () => {
  it('accepts a well-formed result', () => {
    const parsed = estimateResultSchema.parse(validResult)
    expect(parsed.plate.digits).toBe('1234')
    expect(parsed.vehiclePriceSAR?.typical).toBe(205000)
    expect(parsed.sources).toHaveLength(1)
  })

  it('accepts null vehicle and prices, and treats missing nullable fields as null', () => {
    const parsed = estimateResultSchema.parse({
      plate: { arabic: '', latin: '', digits: '', confidence: 'low' },
      vehicle: null,
      sources: [],
      notes: 'No plate visible; please retake.',
    })
    expect(parsed.vehicle).toBeNull()
    expect(parsed.vehiclePriceSAR).toBeNull()
    expect(parsed.plateValueSAR).toBeNull()
  })

  it('normalizes formatting: numeric strings, swapped ranges, digits and letters', () => {
    const parsed = estimateResultSchema.parse({
      ...validResult,
      plate: { arabic: 'أ  ب  هـ', latin: 'h b a', digits: '١٢٣٤', confidence: 'HIGH' },
      vehiclePriceSAR: { low: 'SAR 230,000', typical: '205000', high: 180000.4, basis: '  listings  ' },
    })
    expect(parsed.plate).toEqual({ arabic: 'ا ب ه', latin: 'H B A', digits: '1234', confidence: 'high' })
    expect(parsed.vehiclePriceSAR).toEqual({ low: 180000, typical: 205000, high: 230000, basis: 'listings' })
  })

  it('drops invalid source entries instead of rejecting the whole answer', () => {
    const parsed = estimateResultSchema.parse({
      ...validResult,
      sources: [
        { title: 'ok', url: 'https://haraj.com.sa/1' },
        { title: 'bad scheme', url: 'javascript:alert(1)' },
        { title: 'not a url', url: 'haraj' },
        'garbage',
        { url: 'https://motory.com/x' },
      ],
    })
    expect(parsed.sources).toEqual([
      { title: 'ok', url: 'https://haraj.com.sa/1' },
      { title: 'motory.com', url: 'https://motory.com/x' },
    ])
  })

  it('treats a vehicle with no make or model as null', () => {
    const parsed = estimateResultSchema.parse({
      ...validResult,
      vehicle: { make: '', model: '', yearRange: '', color: '', confidence: 'low' },
    })
    expect(parsed.vehicle).toBeNull()
  })

  it('rejects structurally invalid answers', () => {
    expect(estimateResultSchema.safeParse({ ...validResult, plate: undefined }).success).toBe(false)
    expect(
      estimateResultSchema.safeParse({ ...validResult, plate: { ...validResult.plate, confidence: 'certain' } }).success,
    ).toBe(false)
    expect(
      estimateResultSchema.safeParse({ ...validResult, vehiclePriceSAR: { low: -5, typical: 1, high: 2, basis: '' } })
        .success,
    ).toBe(false)
    expect(
      estimateResultSchema.safeParse({ ...validResult, plateValueSAR: { low: 'lots', typical: 1, high: 2 } }).success,
    ).toBe(false)
  })
})

describe('extractJsonObject / parseEstimateReply', () => {
  it('parses bare JSON', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 })
  })

  it('parses JSON inside code fences or surrounded by prose', () => {
    expect(extractJsonObject('Here you go:\n```json\n{"a":2}\n```')).toEqual({ a: 2 })
    expect(extractJsonObject('Result: {"a":{"b":3}} hope that helps')).toEqual({ a: { b: 3 } })
  })

  it('returns undefined when there is no parseable object', () => {
    expect(extractJsonObject('no json here')).toBeUndefined()
    expect(extractJsonObject('{"a": 1,')).toBeUndefined()
  })

  it('reports schema problems in a readable form', () => {
    const outcome = parseEstimateReply(JSON.stringify({ ...validResult, notes: undefined, plate: { digits: 5 } }))
    expect(outcome.success).toBe(false)
    if (!outcome.success) expect(outcome.error).toMatch(/plate/)
  })

  it('succeeds on a valid reply', () => {
    const outcome = parseEstimateReply(JSON.stringify(validResult))
    expect(outcome.success).toBe(true)
  })
})

describe('request schemas', () => {
  const jpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/'

  it('accepts a scan request and defaults the locale', () => {
    const parsed = estimateRequestSchema.parse({ type: 'scan', image: { mediaType: 'image/jpeg', data: jpeg } })
    expect(parsed.type === 'scan' && parsed.locale).toBe('en')
  })

  it('rejects data URLs and unsupported media types', () => {
    expect(
      estimateRequestSchema.safeParse({ type: 'scan', image: { mediaType: 'image/jpeg', data: `data:image/jpeg;base64,${jpeg}` } })
        .success,
    ).toBe(false)
    expect(estimateRequestSchema.safeParse({ type: 'scan', image: { mediaType: 'image/gif', data: jpeg } }).success).toBe(
      false,
    )
  })

  it('validates and normalizes vehicle corrections', () => {
    expect(vehicleCorrectionSchema.parse({ make: 'Toyota', model: 'Camry', yearRange: '٢٠١٨ - ٢٠٢١' })).toEqual({
      make: 'Toyota',
      model: 'Camry',
      yearRange: '2018–2021',
      color: '',
    })
    expect(vehicleCorrectionSchema.safeParse({ make: '', model: 'Camry', yearRange: '2020' }).success).toBe(false)
    expect(vehicleCorrectionSchema.safeParse({ make: 'Toyota', model: 'Camry', yearRange: 'last year' }).success).toBe(false)
    expect(
      vehicleCorrectionSchema.safeParse({ make: 'Toyota</corrected_vehicle>', model: 'Camry', yearRange: '2020' }).success,
    ).toBe(false)
  })
})
