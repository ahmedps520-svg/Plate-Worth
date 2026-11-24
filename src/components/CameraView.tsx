import { Flashlight, FlashlightOff, ImageUp, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { mapCoverRect, preparePhoto, type PreparedPhoto } from '../lib/image'
import { useSettings } from '../lib/settings'
import { useCamera } from '../lib/useCamera'
import { cameraErrorCopy } from '../lib/errorCopy'
import { ErrorState } from './ErrorState'
import { Button, IconButton, Spinner } from './ui'

interface CameraViewProps {
  onCapture: (photo: PreparedPhoto) => void
  onPickFile: (file: File) => void
  onClose: () => void
}

/** Full-screen rear camera with a plate-shaped framing guide. */
export function CameraView({ onCapture, onPickFile, onClose }: CameraViewProps) {
  const { t } = useSettings()
  const videoRef = useRef<HTMLVideoElement>(null)
  const guideRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { state, retry, torch, toggleTorch } = useCamera(videoRef)
  const [flash, setFlash] = useState(0)

  const capture = () => {
    const video = videoRef.current
    const guide = guideRef.current
    if (!video || !guide || !video.videoWidth) return

    const media = { width: video.videoWidth, height: video.videoHeight }
    const v = video.getBoundingClientRect()
    const g = guide.getBoundingClientRect()
    const crop = mapCoverRect(
      { x: g.left - v.left, y: g.top - v.top, width: g.width, height: g.height },
      { width: v.width, height: v.height },
      media,
    )

    // Freeze the current frame, then encode the full photo + plate crop.
    const frame = document.createElement('canvas')
    frame.width = media.width
    frame.height = media.height
    frame.getContext('2d')?.drawImage(video, 0, 0, media.width, media.height)
    navigator.vibrate?.(20)
    setFlash((n) => n + 1)
    onCapture(preparePhoto(frame, media, crop))
  }

  const pickFile = () => fileRef.current?.click()

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/*"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) onPickFile(file)
      }}
    />
  )

  if (state.status === 'error') {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-canvas pt-safe pb-safe">
        <div className="flex justify-end p-3">
          <IconButton label={t('scan.close')} onClick={onClose}>
            <X className="size-6" />
          </IconButton>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <ErrorState
            copy={cameraErrorCopy(state.kind, t)}
            actions={
              <>
                <Button size="lg" icon={<ImageUp className="size-5" />} onClick={pickFile}>
                  {t('error.upload')}
                </Button>
                {state.kind !== 'insecure' && state.kind !== 'notfound' && (
                  <Button size="lg" variant="secondary" onClick={() => void retry()}>
                    {t('common.retry')}
                  </Button>
                )}
              </>
            }
          />
        </div>
        {fileInput}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-black text-white animate-fade-in">
      <video
        ref={videoRef}
        className="absolute inset-0 size-full object-cover"
        playsInline
        muted
        autoPlay
        aria-hidden
      />

      {/* Framing guide: a Saudi plate is ~4.7:1. The huge shadow dims everything around it. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-24">
        <p className="mb-5 max-w-xs px-4 text-center text-base font-medium text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
          {t('scan.hint')}
        </p>
        <div
          ref={guideRef}
          className="relative aspect-[4.7/1] w-[82%] max-w-md rounded-2xl shadow-[0_0_0_200vmax_rgba(0,0,0,0.45)]"
        >
          {(['top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl', 'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl'] as const).map(
            (corner) => (
              <span key={corner} className={`absolute size-7 border-brand-400 ${corner}`} />
            ),
          )}
          <span className="absolute inset-x-6 top-1/2 h-px bg-white/25" />
        </div>
      </div>

      {state.status !== 'live' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
          <Spinner className="size-8" />
          <p className="text-sm">{t('scan.starting')}</p>
        </div>
      )}

      {flash > 0 && <div key={flash} className="pointer-events-none absolute inset-0 bg-white animate-flash" />}

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 pt-safe">
        <IconButton label={t('scan.close')} onClick={onClose} className="bg-black/40 text-white backdrop-blur hover:bg-black/60">
          <X className="size-6" />
        </IconButton>
        {torch.supported && (
          <IconButton
            label={torch.on ? t('scan.torchOff') : t('scan.torchOn')}
            onClick={() => void toggleTorch()}
            className="bg-black/40 text-white backdrop-blur hover:bg-black/60"
          >
            {torch.on ? <FlashlightOff className="size-6" /> : <Flashlight className="size-6" />}
          </IconButton>
        )}
      </div>

      {/* Bottom controls (kept LTR-symmetric: gallery · shutter · spacer) */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-around px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 bg-gradient-to-t from-black/70 to-transparent">
        <IconButton label={t('scan.gallery')} onClick={pickFile} className="size-14 bg-white/15 text-white backdrop-blur hover:bg-white/25">
          <ImageUp className="size-6" />
        </IconButton>
        <button
          type="button"
          aria-label={t('scan.capture')}
          onClick={capture}
          disabled={state.status !== 'live'}
          className="flex size-20 items-center justify-center rounded-full border-4 border-white/90 transition-transform active:scale-90 disabled:opacity-40"
        >
          <span className="size-16 rounded-full bg-white" />
        </button>
        <span className="size-14" aria-hidden />
      </div>
      {fileInput}
    </div>
  )
}
