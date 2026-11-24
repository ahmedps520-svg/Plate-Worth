import type { Locale } from '../../shared/schema'

/** The riyal has been pegged to the US dollar at 3.75 since 1986. */
export const SAR_PER_USD = 3.75

// Western digits in both languages: they match how Saudi listing sites
// (Haraj, Syarah, …) show prices, which makes comparing easier.
const NUMBER_LOCALE: Record<Locale, string> = { en: 'en-US', ar: 'ar-SA-u-nu-latn' }
const DATE_LOCALE: Record<Locale, string> = { en: 'en-GB', ar: 'ar-SA-u-nu-latn-ca-gregory' }

const numberFormats = new Map<Locale, Intl.NumberFormat>()
function numberFormat(locale: Locale): Intl.NumberFormat {
  let fmt = numberFormats.get(locale)
  if (!fmt) {
    fmt = new Intl.NumberFormat(NUMBER_LOCALE[locale], { maximumFractionDigits: 0 })
    numberFormats.set(locale, fmt)
  }
  return fmt
}

export function formatNumber(value: number, locale: Locale): string {
  return numberFormat(locale).format(Math.round(value))
}

/** "SAR 85,000" / "85,000 ر.س" */
export function formatSAR(amount: number, locale: Locale): string {
  const n = formatNumber(amount, locale)
  return locale === 'ar' ? `${n} ر.س` : `SAR ${n}`
}

export function sarToUsd(amountSar: number): number {
  return amountSar / SAR_PER_USD
}

/** "≈ $22,667" / "≈ 22,667 دولار" */
export function formatUSDFromSAR(amountSar: number, locale: Locale): string {
  const n = formatNumber(sarToUsd(amountSar), locale)
  return locale === 'ar' ? `≈ ${n} دولار` : `≈ $${n}`
}

/** "SAR 80,000 – 95,000" / "80,000 – 95,000 ر.س" */
export function formatSARRange(low: number, high: number, locale: Locale): string {
  if (Math.round(low) === Math.round(high)) return formatSAR(low, locale)
  const range = `${formatNumber(low, locale)} – ${formatNumber(high, locale)}`
  return locale === 'ar' ? `${range} ر.س` : `SAR ${range}`
}

/** Compact amount for tight spaces: "SAR 1.2M" / "1.2 مليون ر.س". */
export function formatSARCompact(amount: number, locale: Locale): string {
  if (amount < 10_000) return formatSAR(amount, locale)
  const n = new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount)
  return locale === 'ar' ? `${n} ر.س` : `SAR ${n}`
}

export function formatDateTime(timestamp: number, locale: Locale): string {
  return new Intl.DateTimeFormat(DATE_LOCALE[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

/** Position of `typical` within [low, high] as a 0–100 percentage. */
export function rangePosition(low: number, typical: number, high: number): number {
  if (high <= low) return 50
  return Math.min(100, Math.max(0, ((typical - low) / (high - low)) * 100))
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
