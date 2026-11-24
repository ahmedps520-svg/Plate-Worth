/**
 * Data contract for estimates: what the app sends to Claude and what it
 * accepts back.
 *
 * `estimateResultSchema` validates what Claude returns. It is deliberately
 * forgiving about *formatting* (numbers sent as "85,000", stray whitespace,
 * swapped low/high, Arabic-Indic digits) and normalizes those, but strict
 * about *structure*, so a malformed answer triggers one retry.
 */
import { z } from 'zod'
import { normalizeArabicLetters, normalizeDigits, normalizeLatinLetters } from './plate.js'

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const
export type Confidence = (typeof CONFIDENCE_LEVELS)[number]

export const LOCALES = ['en', 'ar'] as const
export type Locale = (typeof LOCALES)[number]

export const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number]

/** Hard upper bound on base64 length accepted by the schema (~6 MB decoded). */
export const MAX_IMAGE_BASE64_CHARS = 8_000_000

const confidenceSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
  z.enum(CONFIDENCE_LEVELS),
)

/** A string that tolerates null/undefined (→ "") and is trimmed and length-capped. */
const looseText = (max: number) =>
  z.preprocess((v) => (v == null ? '' : v), z.string()).transform((s) => s.trim().slice(0, max))

/** Whole SAR amount. Accepts numbers or numeric strings like "85,000" / "SAR 85000". */
const sarAmount = z
  .preprocess((v) => {
    if (typeof v !== 'string') return v
    const cleaned = v.replace(/[٠-٩]/g, (d) => normalizeDigits(d)).replace(/[^0-9.]/g, '')
    return cleaned === '' ? v : Number(cleaned)
  }, z.number().finite().nonnegative().max(1_000_000_000))
  .transform((n) => Math.round(n))

function sortRange<T extends { low: number; typical: number; high: number }>(range: T): T {
  const [low, typical, high] = [range.low, range.typical, range.high].sort((a, b) => a - b)
  return { ...range, low, typical, high }
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.')
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Estimate result (Claude's answer)
// ---------------------------------------------------------------------------

export const plateSchema = z.object({
  arabic: looseText(40).transform(normalizeArabicLetters),
  latin: looseText(40).transform(normalizeLatinLetters),
  digits: looseText(20).transform((d) => normalizeDigits(d).slice(0, 8)),
  confidence: confidenceSchema,
})

const vehicleObjectSchema = z.object({
  make: looseText(60),
  model: looseText(60),
  yearRange: looseText(30),
  color: looseText(40),
  confidence: confidenceSchema,
})

export const vehicleSchema = vehicleObjectSchema
  .nullish()
  .transform((v) => (v && (v.make || v.model) ? v : null))

export const vehiclePriceSchema = z
  .object({ low: sarAmount, typical: sarAmount, high: sarAmount, basis: looseText(600) })
  .transform(sortRange)

export const plateValueSchema = z
  .object({ low: sarAmount, typical: sarAmount, high: sarAmount, reasoning: looseText(1200) })
  .transform(sortRange)

export const sourceSchema = z
  .object({ title: looseText(200), url: z.string().trim().refine(isHttpUrl, 'Must be an http(s) URL') })
  .transform((s) => ({ title: s.title || new URL(s.url).hostname, url: s.url }))

/** Keeps the valid entries of a sources array instead of rejecting the whole answer. */
const sourcesSchema = z
  .preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.unknown()))
  .transform((items) =>
    items
      .flatMap((item) => {
        const parsed = sourceSchema.safeParse(item)
        return parsed.success ? [parsed.data] : []
      })
      .slice(0, 12),
  )

export const estimateResultSchema = z.object({
  plate: plateSchema,
  vehicle: vehicleSchema,
  vehiclePriceSAR: vehiclePriceSchema.nullish().transform((v) => v ?? null),
  plateValueSAR: plateValueSchema.nullish().transform((v) => v ?? null),
  sources: sourcesSchema,
  notes: looseText(2000),
})

export type Plate = z.output<typeof plateSchema>
export type Vehicle = NonNullable<z.output<typeof vehicleSchema>>
export type VehiclePrice = z.output<typeof vehiclePriceSchema>
export type PlateValue = z.output<typeof plateValueSchema>
export type Source = z.output<typeof sourceSchema>
export type EstimateResult = z.output<typeof estimateResultSchema>

/**
 * Pulls the first JSON object out of a model reply, tolerating code fences or
 * stray prose around it. Returns undefined when no parseable object exists.
 */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) return undefined
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return undefined
  }
}

export type ParseOutcome =
  | { success: true; data: EstimateResult }
  | { success: false; error: string }

/** Validates a raw model reply against the result schema. */
export function parseEstimateReply(text: string): ParseOutcome {
  const json = extractJsonObject(text)
  if (json === undefined) {
    return { success: false, error: 'The reply did not contain a parseable JSON object.' }
  }
  const parsed = estimateResultSchema.safeParse(json)
  if (!parsed.success) return { success: false, error: z.prettifyError(parsed.error) }
  return { success: true, data: parsed.data }
}

// ---------------------------------------------------------------------------
// Requests (what the app asks Claude to estimate)
// ---------------------------------------------------------------------------

export const imageInputSchema = z.object({
  mediaType: z.enum(IMAGE_MEDIA_TYPES),
  data: z
    .string()
    .min(64, 'Image data is too short')
    .max(MAX_IMAGE_BASE64_CHARS, 'Image is too large')
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Image data must be plain base64 (no data: prefix)'),
})
export type ImageInput = z.infer<typeof imageInputSchema>

/** Free text typed by the user when correcting the vehicle. */
const userText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[\p{L}\p{M}\p{N}\s.,'’()&+/-]+$/u, 'Contains unsupported characters')

export const vehicleCorrectionSchema = z.object({
  make: userText(40),
  model: userText(60),
  yearRange: z
    .string()
    .trim()
    .min(4)
    .max(20)
    .regex(/^[0-9٠-٩\s\-–—/~+]+$/u, 'Use a year or range like 2018–2021')
    .transform((s) => s.replace(/[٠-٩]/g, (d) => normalizeDigits(d)).replace(/\s*[-–—~]\s*/g, '–')),
  color: z.union([userText(30), z.literal('')]).optional().default(''),
})
export type VehicleCorrection = z.output<typeof vehicleCorrectionSchema>

export const scanRequestSchema = z.object({
  type: z.literal('scan'),
  image: imageInputSchema,
  /** Optional high-resolution crop of the camera's plate guide area. */
  plateCrop: imageInputSchema.optional(),
  locale: z.enum(LOCALES).default('en'),
})

export const reestimateRequestSchema = z.object({
  type: z.literal('reestimate'),
  plate: plateSchema,
  vehicle: vehicleCorrectionSchema,
  locale: z.enum(LOCALES).default('en'),
})

export const estimateRequestSchema = z.discriminatedUnion('type', [scanRequestSchema, reestimateRequestSchema])

export type ScanRequest = z.input<typeof scanRequestSchema>
export type ReestimateRequest = z.input<typeof reestimateRequestSchema>
export type EstimateRequestInput = z.input<typeof estimateRequestSchema>
export type EstimateRequest = z.output<typeof estimateRequestSchema>

// ---------------------------------------------------------------------------
// Progress, errors and metadata
// ---------------------------------------------------------------------------

export const PROGRESS_STAGES = ['reading', 'searching', 'finalizing'] as const
export type ProgressStage = (typeof PROGRESS_STAGES)[number]

export const ERROR_CODES = [
  'missing_api_key',
  'invalid_api_key',
  'offline',
  'network',
  'bad_request',
  'rate_limited',
  'upstream_busy',
  'upstream_error',
  'invalid_output',
  'refused',
  'timeout',
  'aborted',
  'internal',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export interface EstimateMeta {
  model: string
  searches: number
  durationMs: number
}
