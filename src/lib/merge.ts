import type { EstimateResult, Source, VehicleCorrection } from '../../shared/schema'

function dedupeSources(sources: Source[], limit: number): Source[] {
  const seen = new Set<string>()
  const out: Source[] = []
  for (const source of sources) {
    const key = source.url.replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(source)
    if (out.length >= limit) break
  }
  return out
}

/**
 * Combines a re-estimate (vehicle corrected by the user, no new photo) with
 * the original scan: the plate reading and plate value are kept, the vehicle
 * and its price come from the new answer.
 */
export function mergeReestimate(
  previous: EstimateResult,
  next: EstimateResult,
  correction: VehicleCorrection,
): EstimateResult {
  return {
    plate: previous.plate,
    vehicle: {
      make: correction.make,
      model: correction.model,
      yearRange: correction.yearRange,
      color: correction.color || next.vehicle?.color || previous.vehicle?.color || '',
      confidence: 'high',
    },
    vehiclePriceSAR: next.vehiclePriceSAR,
    plateValueSAR: previous.plateValueSAR ?? next.plateValueSAR,
    sources: dedupeSources([...next.sources, ...previous.sources], 10),
    notes: next.notes || previous.notes,
  }
}
