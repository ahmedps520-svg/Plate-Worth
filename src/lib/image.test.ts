import { describe, expect, it } from 'vitest'
import { base64Bytes, fitWithin, mapCoverRect } from './image'

describe('fitWithin', () => {
  it('downscales the long edge to the limit and keeps the aspect ratio', () => {
    expect(fitWithin({ width: 4032, height: 3024 }, 1280)).toEqual({ width: 1280, height: 960 })
    expect(fitWithin({ width: 1080, height: 1920 }, 1280)).toEqual({ width: 720, height: 1280 })
  })

  it('never upscales', () => {
    expect(fitWithin({ width: 800, height: 600 }, 1280)).toEqual({ width: 800, height: 600 })
  })
})

describe('mapCoverRect', () => {
  it('maps a guide over a cover-fitted portrait video to video pixels', () => {
    // 1920x1080 landscape stream shown object-fit: cover in a 390x844 portrait screen.
    // scale = max(390/1920, 844/1080) = 0.78148; rendered width 1500.4, offsetX 555.2
    const crop = mapCoverRect(
      { x: 35, y: 400, width: 320, height: 68 },
      { width: 390, height: 844 },
      { width: 1920, height: 1080 },
      0,
    )
    // Unpadded guide is ~409x87 px at x≈755; the 2.5:1 minimum makes the height ≈164.
    expect(crop.x).toBeGreaterThanOrEqual(750)
    expect(crop.x).toBeLessThanOrEqual(760)
    expect(crop.width).toBeGreaterThanOrEqual(405)
    expect(crop.width).toBeLessThanOrEqual(412)
    expect(crop.height).toBeGreaterThanOrEqual(160)
    expect(crop.height).toBeLessThanOrEqual(168)
  })

  it('clamps the padded crop to the frame', () => {
    const crop = mapCoverRect({ x: 0, y: 0, width: 400, height: 100 }, { width: 400, height: 300 }, { width: 400, height: 300 }, 0.5)
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(0)
    expect(crop.width).toBeLessThanOrEqual(400)
    expect(crop.height).toBeLessThanOrEqual(300)
  })
})

describe('base64Bytes', () => {
  it('accounts for padding', () => {
    expect(base64Bytes(btoa('abc'))).toBe(3)
    expect(base64Bytes(btoa('abcd'))).toBe(4)
    expect(base64Bytes(btoa('abcde'))).toBe(5)
  })
})
