import type { ImageInput, ImageMediaType } from '../shared/schema.js'

/** Exact decoded byte length of a (padded or unpadded) base64 string. */
export function base64DecodedLength(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}

/** Identifies JPEG / PNG / WebP from the first bytes of base64 data. */
export function sniffImageType(b64: string): ImageMediaType | undefined {
  let bytes: Uint8Array
  try {
    const head = atob(b64.slice(0, 24)) // 24 base64 chars → 18 bytes
    bytes = Uint8Array.from(head, (c) => c.charCodeAt(0))
  } catch {
    return undefined
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  const ascii = String.fromCharCode(...bytes.slice(0, 12))
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'image/webp'
  return undefined
}

export type ImageCheck =
  | { ok: true }
  | { ok: false; status: 400 | 413; code: 'bad_request' | 'payload_too_large'; message: string }

export function checkImage(image: ImageInput, maxBytes: number, label = 'image'): ImageCheck {
  const size = base64DecodedLength(image.data)
  if (size > maxBytes) {
    return {
      ok: false,
      status: 413,
      code: 'payload_too_large',
      message: `The ${label} is ${(size / 1024 / 1024).toFixed(1)} MB; the limit is ${(maxBytes / 1024 / 1024).toFixed(1)} MB.`,
    }
  }
  const actual = sniffImageType(image.data)
  if (!actual) {
    return { ok: false, status: 400, code: 'bad_request', message: `The ${label} is not a JPEG, PNG or WebP file.` }
  }
  if (actual !== image.mediaType) {
    return {
      ok: false,
      status: 400,
      code: 'bad_request',
      message: `The ${label} is declared as ${image.mediaType} but contains ${actual} data.`,
    }
  }
  return { ok: true }
}
