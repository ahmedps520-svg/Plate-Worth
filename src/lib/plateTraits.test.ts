import { describe, expect, it } from 'vitest'
import { plateTraits } from './plateTraits'

describe('plateTraits', () => {
  it('flags short numbers', () => {
    expect(plateTraits('7', '')).toEqual(['single_digit'])
    expect(plateTraits('55', '')).toEqual(['two_digits', 'repeated_digits'])
    expect(plateTraits('100', '')).toEqual(['three_digits', 'round'])
  })

  it('flags repeated digits, sequences, mirrors and pairs', () => {
    expect(plateTraits('7777', '')).toEqual(['repeated_digits'])
    expect(plateTraits('1234', '')).toEqual(['sequence'])
    expect(plateTraits('4321', '')).toEqual(['sequence'])
    expect(plateTraits('1221', '')).toEqual(['mirror'])
    expect(plateTraits('1212', '')).toEqual(['repeating_pair'])
    expect(plateTraits('9000', '')).toEqual(['round'])
  })

  it('flags matching letters', () => {
    expect(plateTraits('4821', 'ا ا ا')).toEqual(['same_letters'])
    expect(plateTraits('4821', 'ا ب ح')).toEqual([])
  })

  it('returns nothing for an ordinary or unreadable plate', () => {
    expect(plateTraits('4821', 'J B A')).toEqual([])
    expect(plateTraits('', '')).toEqual([])
  })
})
