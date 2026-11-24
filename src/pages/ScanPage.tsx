import { Camera, ImageUp, KeyRound, RotateCcw, ScanSearch, Settings, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { CameraView } from '../components/CameraView'
import { ErrorState } from '../components/ErrorState'
import { apiErrorCopy, isKeyError } from '../lib/errorCopy'
import { LoadingProgress } from '../components/LoadingProgress'
import { Button, IconButton } from '../components/ui'
import { goBack, navigate } from '../lib/router'
import { useScan } from '../lib/scan'
import { useSettings } from '../lib/settings'

/** Codes where resending the same photo can't help. */
const NOT_RETRYABLE = new Set([
  'refused',
  'bad_request',
  'payload_too_large',
  'unsupported_media_type',
  'unsupported_image',
  'missing_api_key',
  'invalid_api_key',
])

export function ScanPage() {
  const { t, apiKey } = useSettings()
  const scan = useScan()
  const { status } = scan
  const fileRef = useRef<HTMLInputElement>(null)

  // Leaving the page (back button, tab switch) cancels any in-flight scan.
  // The microtask check ignores React StrictMode's simulated unmount in dev.
  const { reset } = scan
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      queueMicrotask(() => {
        if (!mounted.current) reset()
      })
    }
  }, [reset])

  const close = () => {
    scan.reset()
    goBack({ name: 'home' })
  }

  const openSettings = () => {
    scan.reset()
    navigate({ name: 'settings' }, { replace: true })
  }
  const settingsButton = (
    <Button size="lg" icon={<Settings className="size-5" />} onClick={openSettings}>
      {t('error.openSettings')}
    </Button>
  )

  // No key yet: don't open the camera, point to Settings instead.
  if (status.phase === 'idle' && !apiKey) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-canvas pt-safe pb-safe">
        <div className="flex justify-end p-3">
          <IconButton label={t('scan.close')} onClick={close}>
            <X className="size-6" />
          </IconButton>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <ErrorState
            tone="warn"
            copy={{ title: t('error.missing_api_key.title'), body: t('error.missing_api_key.body'), icon: KeyRound }}
            actions={settingsButton}
          />
        </div>
      </div>
    )
  }

  if (status.phase === 'idle') {
    return <CameraView onCapture={scan.startFromPhoto} onPickFile={scan.startFromFile} onClose={close} />
  }

  const preview = status.preview
  const canRetry = status.phase === 'error' && scan.canRetry && !NOT_RETRYABLE.has(status.error.code)
  const pickFile = () => fileRef.current?.click()
  const retakeButton = (primary: boolean) => (
    <Button size="lg" variant={primary ? 'primary' : 'secondary'} icon={<Camera className="size-5" />} onClick={scan.reset}>
      {t('error.retake')}
    </Button>
  )
  const uploadButton = (
    <Button size="lg" variant="secondary" icon={<ImageUp className="size-5" />} onClick={pickFile}>
      {t('error.upload')}
    </Button>
  )

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-canvas">
      {preview && (
        <img src={preview} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-25 blur-xl" />
      )}
      <div className="relative mx-auto flex h-full max-w-lg flex-col pt-safe pb-safe">
        <div className="flex justify-end p-3">
          <IconButton label={t('scan.close')} onClick={close}>
            <X className="size-6" />
          </IconButton>
        </div>

        {/* min-h-0 lets this area scroll on short screens; my-auto (not justify-center) keeps the top reachable. */}
        <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-5 pb-10">
          {status.phase === 'processing' && (
            <div className="my-auto w-full rounded-3xl bg-surface/95 p-6 shadow-2xl ring-1 ring-line backdrop-blur animate-pop">
              {preview && (
                <img
                  src={preview}
                  alt={t('result.photoAlt')}
                  className="mb-5 aspect-[4/3] max-h-[35dvh] w-full rounded-2xl object-cover ring-1 ring-line"
                />
              )}
              <h1 className="mb-4 text-xl font-bold">{t('scan.analyzing')}</h1>
              <LoadingProgress stage={status.stage} detail={status.detail} startedAt={status.startedAt} />
              <Button variant="ghost" block className="mt-5" onClick={close}>
                {t('scan.cancel')}
              </Button>
            </div>
          )}

          {status.phase === 'error' && (
            <ErrorState
              className="my-auto"
              copy={apiErrorCopy(status.error, t)}
              actions={
                <>
                  {isKeyError(status.error.code) && settingsButton}
                  {canRetry && (
                    <Button size="lg" icon={<RotateCcw className="size-5" />} onClick={scan.retry}>
                      {t('common.retry')}
                    </Button>
                  )}
                  {retakeButton(!canRetry && !isKeyError(status.error.code))}
                  {uploadButton}
                </>
              }
            />
          )}

          {status.phase === 'noplate' && (
            <ErrorState
              className="my-auto"
              tone="warn"
              copy={{ title: t('noPlate.title'), body: `${t('noPlate.body')} ${t('noPlate.tips')}`, icon: ScanSearch }}
              actions={
                <>
                  {retakeButton(true)}
                  {uploadButton}
                </>
              }
            />
          )}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) scan.startFromFile(file)
        }}
      />
    </div>
  )
}
