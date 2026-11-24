/**
 * Client-side image handling: decode, downscale, crop and JPEG-encode before
 * upload, so requests stay small (≈150–400 KB) and fast on mobile networks.
 */
import type { ImageInput } from '../../shared/schema'

export const UPLOAD_MAX_DIMENSION = 1280
export const UPLOAD_QUALITY = 0.8
export const CROP_QUALITY = 0.85
export const THUMB_MAX_DIMENSION = 320
/** Keep each image well under the server's 4 MB default limit. */
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export interface EncodedImage extends ImageInput {
  dataUrl: string
  width: number
  height: number
  bytes: number
}

export interface DecodedImage extends Size {
  source: CanvasImageSource
  release: () => void
}

export function base64Bytes(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}

/** Size that fits inside `maxDimension` on its longest edge (never upscales). */
export function fitWithin(size: Size, maxDimension: number): Size {
  const scale = Math.min(1, maxDimension / Math.max(size.width, size.height))
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) }
}

/** Draws `region` of `source` downscaled into a JPEG. */
export function encodeJpeg(
  source: CanvasImageSource,
  region: Rect,
  maxDimension: number,
  quality: number,
): EncodedImage {
  const out = fitWithin(region, maxDimension)
  const canvas = document.createElement('canvas')
  canvas.width = out.width
  canvas.height = out.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, out.width, out.height)

  let q = quality
  let dataUrl = canvas.toDataURL('image/jpeg', q)
  let data = dataUrl.slice(dataUrl.indexOf(',') + 1)
  while (base64Bytes(data) > MAX_UPLOAD_BYTES && q > 0.4) {
    q -= 0.15
    dataUrl = canvas.toDataURL('image/jpeg', q)
    data = dataUrl.slice(dataUrl.indexOf(',') + 1)
  }
  return { mediaType: 'image/jpeg', data, dataUrl, width: out.width, height: out.height, bytes: base64Bytes(data) }
}

/** Decodes a picked file, honoring EXIF orientation. */
export async function decodeImageFile(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    } catch {
      // Fall back to <img> (older Safari, unusual formats).
    }
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  try {
    await img.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new Error('unsupported_image')
  }
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) }
}

/**
 * Maps a rectangle drawn over a `object-fit: cover` <video> (CSS pixels of the
 * element) to the video's own pixel coordinates, then pads it so a slightly
 * misaligned plate still lands fully inside the crop.
 */
export function mapCoverRect(guide: Rect, element: Size, media: Size, padding = 0.2): Rect {
  const scale = Math.max(element.width / media.width, element.height / media.height)
  const offsetX = (media.width * scale - element.width) / 2
  const offsetY = (media.height * scale - element.height) / 2

  const x = (guide.x + offsetX) / scale
  const y = (guide.y + offsetY) / scale
  const width = guide.width / scale
  const height = guide.height / scale

  // Pad horizontally by `padding`, and make the crop at least 2.5:1 so there
  // is room above and below a plate that sits a bit off-center.
  const paddedWidth = width * (1 + 2 * padding)
  const paddedHeight = Math.max(height * (1 + 4 * padding), paddedWidth / 2.5)
  const cx = x + width / 2
  const cy = y + height / 2

  const left = Math.max(0, cx - paddedWidth / 2)
  const top = Math.max(0, cy - paddedHeight / 2)
  const right = Math.min(media.width, cx + paddedWidth / 2)
  const bottom = Math.min(media.height, cy + paddedHeight / 2)
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
  }
}

export interface PreparedPhoto {
  image: EncodedImage
  plateCrop?: EncodedImage
  thumbnail: string
  preview: string
}

/** Full frame (for the vehicle) + optional plate-guide crop + thumbnail. */
export function preparePhoto(source: CanvasImageSource, size: Size, crop?: Rect): PreparedPhoto {
  const full: Rect = { x: 0, y: 0, width: size.width, height: size.height }
  const image = encodeJpeg(source, full, UPLOAD_MAX_DIMENSION, UPLOAD_QUALITY)
  const plateCrop =
    crop && crop.width > 32 && crop.height > 16 ? encodeJpeg(source, crop, UPLOAD_MAX_DIMENSION, CROP_QUALITY) : undefined
  const thumbnail = encodeJpeg(source, full, THUMB_MAX_DIMENSION, 0.7).dataUrl
  return { image, plateCrop, thumbnail, preview: image.dataUrl }
}
