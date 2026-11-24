/* eslint-disable react-refresh/only-export-components */
/**
 * Scan session state, shared by the Home page (gallery upload) and the Scan
 * page (camera): prepare the photo → stream the estimate → save to history →
 * open the result.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { isPlateUnreadable } from '../../shared/plate'
import type { ProgressStage } from '../../shared/schema'
import { ApiError, requestEstimate, type ClientErrorCode } from './api'
import { newScanId, saveScan } from './db'
import { decodeImageFile, preparePhoto, type PreparedPhoto } from './image'
import { navigate } from './router'
import { useSettings } from './settings'

export interface ScanErrorInfo {
  code: ClientErrorCode | 'unsupported_image'
  retryAfter?: number
}

export type ScanStatus =
  | { phase: 'idle' }
  | { phase: 'processing'; preview: string; stage: ProgressStage; detail?: string; startedAt: number }
  | { phase: 'error'; preview?: string; error: ScanErrorInfo }
  | { phase: 'noplate'; preview: string; notes: string }

interface ScanContextValue {
  status: ScanStatus
  startFromPhoto: (photo: PreparedPhoto) => void
  startFromFile: (file: File) => void
  /** Re-sends the last photo (e.g. after a network error) without retaking it. */
  retry: () => void
  canRetry: boolean
  cancel: () => void
  reset: () => void
}

const ScanContext = createContext<ScanContextValue | null>(null)

export function ScanProvider({ children }: { children: ReactNode }) {
  const { locale } = useSettings()
  const [status, setStatus] = useState<ScanStatus>({ phase: 'idle' })
  const abortRef = useRef<AbortController | null>(null)
  const lastPhotoRef = useRef<PreparedPhoto | null>(null)

  const run = useCallback(
    async (photo: PreparedPhoto) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      lastPhotoRef.current = photo
      setStatus({ phase: 'processing', preview: photo.preview, stage: 'reading', startedAt: Date.now() })

      try {
        const { result, meta } = await requestEstimate(
          {
            type: 'scan',
            image: { mediaType: photo.image.mediaType, data: photo.image.data },
            ...(photo.plateCrop
              ? { plateCrop: { mediaType: photo.plateCrop.mediaType, data: photo.plateCrop.data } }
              : {}),
            locale,
          },
          {
            signal: controller.signal,
            onProgress: ({ stage, detail }) =>
              setStatus((s) =>
                s.phase === 'processing'
                  ? { ...s, stage, detail: detail ?? (stage === s.stage ? s.detail : undefined) }
                  : s,
              ),
          },
        )
        if (controller.signal.aborted) return

        if (isPlateUnreadable(result.plate)) {
          setStatus({ phase: 'noplate', preview: photo.preview, notes: result.notes })
          return
        }

        const id = newScanId()
        const now = Date.now()
        await saveScan({ id, createdAt: now, updatedAt: now, thumbnail: photo.thumbnail, result, locale, meta })
        lastPhotoRef.current = null
        setStatus({ phase: 'idle' })
        navigate({ name: 'result', id }, { replace: true })
      } catch (error) {
        if (controller.signal.aborted) return
        const info: ScanErrorInfo =
          error instanceof ApiError ? { code: error.code, retryAfter: error.retryAfter } : { code: 'internal' }
        if (info.code === 'aborted') return
        setStatus({ phase: 'error', preview: photo.preview, error: info })
      } finally {
        if (abortRef.current === controller) abortRef.current = null
      }
    },
    [locale],
  )

  const startFromPhoto = useCallback((photo: PreparedPhoto) => void run(photo), [run])

  const startFromFile = useCallback(
    (file: File) => {
      // Show the progress screen right away (decoding a large photo takes a moment).
      setStatus({ phase: 'processing', preview: '', stage: 'reading', startedAt: Date.now() })
      void (async () => {
        let photo: PreparedPhoto
        try {
          const decoded = await decodeImageFile(file)
          try {
            photo = preparePhoto(decoded.source, decoded)
          } finally {
            decoded.release()
          }
        } catch {
          setStatus({ phase: 'error', error: { code: 'unsupported_image' } })
          return
        }
        await run(photo)
      })()
    },
    [run],
  )

  const retry = useCallback(() => {
    if (lastPhotoRef.current) void run(lastPhotoRef.current)
  }, [run])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus({ phase: 'idle' })
  }, [])

  const reset = useCallback(() => {
    lastPhotoRef.current = null
    cancel()
  }, [cancel])

  const canRetry = status.phase === 'error' && status.preview !== undefined

  const value = useMemo(
    () => ({ status, startFromPhoto, startFromFile, retry, canRetry, cancel, reset }),
    [status, startFromPhoto, startFromFile, retry, canRetry, cancel, reset],
  )
  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>
}

export function useScan(): ScanContextValue {
  const ctx = useContext(ScanContext)
  if (!ctx) throw new Error('useScan must be used inside <ScanProvider>')
  return ctx
}
