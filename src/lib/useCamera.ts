import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export type CameraErrorKind = 'denied' | 'notfound' | 'inuse' | 'insecure' | 'unknown'

export type CameraState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'live' }
  | { status: 'error'; kind: CameraErrorKind }

export function cameraErrorKind(error: unknown): CameraErrorKind {
  const name = (error as DOMException | undefined)?.name
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'notfound'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'inuse'
    default:
      return 'unknown'
  }
}

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean }

/**
 * Opens the rear camera into `videoRef` while the calling component is
 * mounted. Stops the stream on unmount or when the page is hidden (and
 * resumes when visible again) so the camera never stays on needlessly.
 */
export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<CameraState>({ status: 'starting' })
  const [torch, setTorch] = useState({ supported: false, on: false })
  const streamRef = useRef<MediaStream | null>(null)
  const attemptRef = useRef(0)

  const stop = useCallback(() => {
    attemptRef.current += 1
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [videoRef])

  const start = useCallback(async () => {
    stop()
    const attempt = attemptRef.current
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setState({ status: 'error', kind: 'insecure' })
      return
    }
    setState({ status: 'starting' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      if (attempt !== attemptRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play().catch(() => {})
      }
      const track = stream.getVideoTracks()[0]
      const caps = (track?.getCapabilities?.() ?? {}) as TorchCapabilities
      setTorch({ supported: Boolean(caps.torch), on: false })
      setState({ status: 'live' })
    } catch (error) {
      if (attempt !== attemptRef.current) return
      setState({ status: 'error', kind: cameraErrorKind(error) })
    }
  }, [stop, videoRef])

  useEffect(() => {
    // Syncing with an external system (the camera) is what effects are for;
    // start() reports its progress through state.
    // oxlint-disable-next-line react/set-state-in-effect
    void start()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop()
      else void start()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [start, stop])

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torch.on
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorch((t) => ({ ...t, on: next }))
    } catch {
      setTorch({ supported: false, on: false })
    }
  }, [torch.on])

  return { state, retry: start, torch, toggleTorch }
}
