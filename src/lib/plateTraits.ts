/**
 * Spots the patterns that make a Saudi plate number "distinctive" (and so
 * potentially valuable). Shown as chips next to the AI's own reasoning.
 */
import { splitLetters } from '../../shared/plate'

export const PLATE_TRAITS = [
  'single_digit',
  'two_digits',
  'three_digits',
  'repeated_digits',
  'sequence',
  'mirror',
  'round',
  'repeating_pair',
  'same_letters',
] as const
export type PlateTrait = (typeof PLATE_TRAITS)[number]

function isSequence(digits: string): boolean {
  if (digits.length < 3) return false
  const d = [...digits].map(Number)
  const step = d[1] - d[0]
  if (step !== 1 && step !== -1) return false
  return d.every((n, i) => i === 0 || n - d[i - 1] === step)
}

/** `digits` in Western numerals ("1234"); `letters` normalized ("ا ب ح" or "J B A"). */
export function plateTraits(digits: string, letters: string): PlateTrait[] {
  const traits: PlateTrait[] = []
  const n = digits.length

  if (n === 1) traits.push('single_digit')
  else if (n === 2) traits.push('two_digits')
  else if (n === 3) traits.push('three_digits')

  if (n >= 2) {
    const allSame = [...digits].every((c) => c === digits[0])
    if (allSame) traits.push('repeated_digits')
    if (isSequence(digits)) traits.push('sequence')
    if (!allSame && n >= 3 && digits === [...digits].reverse().join('')) traits.push('mirror')
    if (/^[1-9]0+$/.test(digits)) traits.push('round')
    if (n === 4 && !allSame && digits.slice(0, 2) === digits.slice(2)) traits.push('repeating_pair')
  }

  const letterList = splitLetters(letters)
  if (letterList.length >= 2 && letterList.every((l) => l === letterList[0])) traits.push('same_letters')

  return traits
}
