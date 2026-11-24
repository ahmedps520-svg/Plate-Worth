/**
 * Saudi license plate alphabet.
 *
 * Saudi plates use a fixed set of 17 Arabic letters. Each one is printed with
 * a Latin equivalent directly beneath it. Digits are shown twice: Arabic-Indic
 * numerals (١٢٣٤) and Western numerals (1234).
 */
export const SAUDI_PLATE_LETTERS = [
  { arabic: 'ا', latin: 'A' },
  { arabic: 'ب', latin: 'B' },
  { arabic: 'ح', latin: 'J' },
  { arabic: 'د', latin: 'D' },
  { arabic: 'ر', latin: 'R' },
  { arabic: 'س', latin: 'S' },
  { arabic: 'ص', latin: 'X' },
  { arabic: 'ط', latin: 'T' },
  { arabic: 'ع', latin: 'E' },
  { arabic: 'ق', latin: 'G' },
  { arabic: 'ك', latin: 'K' },
  { arabic: 'ل', latin: 'L' },
  { arabic: 'م', latin: 'Z' },
  { arabic: 'ن', latin: 'N' },
  { arabic: 'ه', latin: 'H' },
  { arabic: 'و', latin: 'U' },
  { arabic: 'ى', latin: 'V' },
] as const

const ARABIC_TO_LATIN = new Map<string, string>(SAUDI_PLATE_LETTERS.map((l) => [l.arabic, l.latin]))
const LATIN_TO_ARABIC = new Map<string, string>(SAUDI_PLATE_LETTERS.map((l) => [l.latin, l.arabic]))

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const EASTERN_ARABIC_INDIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹' // Persian/Urdu variants, sometimes produced by OCR

/** Converts any Arabic-Indic digits to Western digits and drops everything else. */
export function normalizeDigits(input: string): string {
  let out = ''
  for (const ch of input) {
    const a = ARABIC_INDIC_DIGITS.indexOf(ch)
    const e = EASTERN_ARABIC_INDIC_DIGITS.indexOf(ch)
    if (a !== -1) out += String(a)
    else if (e !== -1) out += String(e)
    else if (ch >= '0' && ch <= '9') out += ch
  }
  return out
}

export function toArabicIndicDigits(digits: string): string {
  return digits.replace(/[0-9]/g, (d) => ARABIC_INDIC_DIGITS[Number(d)])
}

/** Maps common spelling variants to the canonical plate letter. */
function canonicalArabicLetter(ch: string): string {
  switch (ch) {
    case 'أ':
    case 'إ':
    case 'آ':
      return 'ا'
    case 'ي':
    case 'ئ':
      return 'ى'
    case 'ة':
      return 'ه'
    default:
      return ch
  }
}

/**
 * Normalizes Arabic plate letters to "ا ب ح" form: canonical letters only,
 * separated by single spaces, in right-to-left reading order (as given).
 * Tatweel (ـ, as in "هـ"), diacritics and other characters are removed.
 */
export function normalizeArabicLetters(input: string): string {
  const letters: string[] = []
  for (const raw of input) {
    const ch = canonicalArabicLetter(raw)
    if (ARABIC_TO_LATIN.has(ch)) letters.push(ch)
  }
  return letters.join(' ')
}

/** Normalizes Latin plate letters to "J B A" form (uppercase, single spaces, A–Z only). */
export function normalizeLatinLetters(input: string): string {
  return (input.toUpperCase().match(/[A-Z]/g) ?? []).join(' ')
}

export function arabicToLatinLetter(letter: string): string | undefined {
  return ARABIC_TO_LATIN.get(canonicalArabicLetter(letter))
}

export function latinToArabicLetter(letter: string): string | undefined {
  return LATIN_TO_ARABIC.get(letter.toUpperCase())
}

/** Splits a normalized letter string ("ا ب ح") into its letters. */
export function splitLetters(normalized: string): string[] {
  return normalized.split(' ').filter(Boolean)
}

/** How the plate font renders a letter (ه is printed with a tatweel: "هـ"). */
export function displayArabicLetter(letter: string): string {
  return letter === 'ه' ? 'هـ' : letter
}

/** True when nothing usable was read from the plate. */
export function isPlateUnreadable(plate: { arabic: string; latin: string; digits: string }): boolean {
  return plate.digits.length === 0 && plate.arabic.length === 0 && plate.latin.length === 0
}
