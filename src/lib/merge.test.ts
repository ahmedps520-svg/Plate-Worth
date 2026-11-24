import { describe, expect, it } from 'vitest'
import type { EstimateResult } from '../../shared/schema'
import { mergeReestimate } from './merge'

const previous: EstimateResult = {
  plate: { arabic: 'ا ب ح', latin: 'J B A', digits: '1111', confidence: 'high' },
  vehicle: { make: 'Toyota', model: 'Corolla', yearRange: '2015–2018', color: 'Silver', confidence: 'low' },
  vehiclePriceSAR: { low: 30000, typical: 35000, high: 40000, basis: 'old' },
  plateValueSAR: { low: 15000, typical: 25000, high: 40000, reasoning: 'Repeated digits' },
  sources: [
    { title: 'plate', url: 'https://haraj.com.sa/plate' },
    { title: 'old car', url: 'https://syarah.com/old' },
  ],
  notes: 'first',
}

const next: EstimateResult = {
  plate: previous.plate,
  vehicle: { make: 'Toyota', model: 'Camry', yearRange: '2020–2022', color: 'Silver', confidence: 'high' },
  vehiclePriceSAR: { low: 80000, typical: 88000, high: 96000, basis: 'new' },
  plateValueSAR: null,
  sources: [
    { title: 'new car', url: 'https://syarah.com/new' },
    { title: 'dup', url: 'https://syarah.com/old/' },
  ],
  notes: 'second',
}

describe('mergeReestimate', () => {
  it('keeps the plate reading and value, replaces the vehicle and its price', () => {
    const merged = mergeReestimate(previous, next, { make: 'Toyota', model: 'Camry', yearRange: '2020–2022', color: '' })
    expect(merged.plate).toBe(previous.plate)
    expect(merged.plateValueSAR).toBe(previous.plateValueSAR)
    expect(merged.vehicle).toEqual({ make: 'Toyota', model: 'Camry', yearRange: '2020–2022', color: 'Silver', confidence: 'high' })
    expect(merged.vehiclePriceSAR?.typical).toBe(88000)
    expect(merged.notes).toBe('second')
    expect(merged.sources.map((s) => s.title)).toEqual(['new car', 'dup', 'plate'])
  })
})
