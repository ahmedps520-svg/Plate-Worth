import { AlertTriangle, Camera, Info, PencilLine, RotateCcw, SearchX, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProgressStage, VehicleCorrection } from '../../shared/schema'
import { PageHeader } from '../components/AppChrome'
import { ConfidenceBadge } from '../components/ConfidenceBadge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorState } from '../components/ErrorState'
import { apiErrorCopy, isKeyError } from '../lib/errorCopy'
import { LoadingProgress } from '../components/LoadingProgress'
import { PlateDisplay } from '../components/PlateDisplay'
import { PriceRange } from '../components/PriceRange'
import { SourcesList } from '../components/SourcesList'
import { useToast } from '../components/Toast'
import { Button, Card, IconButton, SectionTitle, Spinner } from '../components/ui'
import { VehicleEditor } from '../components/VehicleEditor'
import { ApiError } from '../lib/apiError'
import { deleteScan, getScan, saveScan, type ScanRecord } from '../lib/db'
import { formatDateTime } from '../lib/format'
import { mergeReestimate } from '../lib/merge'
import { plateTraits } from '../lib/plateTraits'
import { goBack, navigate } from '../lib/router'
import type { ScanErrorInfo } from '../lib/scan'
import { useSettings } from '../lib/settings'

interface Pending {
  stage: ProgressStage
  detail?: string
  startedAt: number
}

export function ResultPage({ id }: { id: string }) {
  const { t, locale, apiKey } = useSettings()
  const toast = useToast()
  const [record, setRecord] = useState<ScanRecord | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [reestimateError, setReestimateError] = useState<ScanErrorInfo | null>(null)
  const [lastCorrection, setLastCorrection] = useState<VehicleCorrection | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let active = true
    getScan(id)
      .then((r) => active && setRecord(r ?? null))
      .catch(() => active && setRecord(null))
    return () => {
      active = false
      abortRef.current?.abort()
    }
  }, [id])

  const reestimate = useCallback(
    async (correction: VehicleCorrection) => {
      if (!record) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLastCorrection(correction)
      setReestimateError(null)
      setPending({ stage: 'searching', startedAt: Date.now() })
      try {
        const { requestEstimate } = await import('../lib/api')
        const { result, meta } = await requestEstimate(
          { type: 'reestimate', plate: record.result.plate, vehicle: correction, locale },
          {
            apiKey,
            signal: controller.signal,
            onProgress: ({ stage, detail }) =>
              setPending((p) => (p ? { ...p, stage, detail: detail ?? (stage === p.stage ? p.detail : undefined) } : p)),
          },
        )
        const updated: ScanRecord = {
          ...record,
          result: mergeReestimate(record.result, result, correction),
          corrected: true,
          updatedAt: Date.now(),
          meta,
        }
        await saveScan(updated)
        setRecord(updated)
        setEditing(false)
        toast(t('result.updated'))
      } catch (error) {
        if (controller.signal.aborted) return
        const code = error instanceof ApiError ? error.code : 'internal'
        if (code !== 'aborted') {
          setReestimateError({
            code,
            retryAfter: error instanceof ApiError ? error.retryAfter : undefined,
            details: error instanceof ApiError ? error.details : undefined,
          })
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setPending(null)
      }
    },
    [record, locale, apiKey, toast, t],
  )

  const header = (
    <PageHeader
      title={t('result.title')}
      onBack={() => goBack({ name: 'history' })}
      actions={
        record && (
          <IconButton
            label={t('result.delete')}
            onClick={() => setConfirmDelete(true)}
            className="text-muted hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="size-5" />
          </IconButton>
        )
      }
    />
  )

  if (record === undefined) {
    return (
      <>
        {header}
        <div className="flex justify-center py-24 text-muted">
          <Spinner className="size-8" />
        </div>
      </>
    )
  }

  if (record === null) {
    return (
      <>
        {header}
        <ErrorState
          className="py-16"
          copy={{ title: t('result.notFound.title'), body: t('result.notFound.body'), icon: SearchX }}
          actions={
            <Button onClick={() => navigate({ name: 'history' }, { replace: true })}>{t('nav.history')}</Button>
          }
        />
      </>
    )
  }

  const { plate, vehicle, vehiclePriceSAR, plateValueSAR, sources, notes } = record.result
  const traits = plateTraits(plate.digits, plate.arabic)
  const plateReadable = Boolean(plate.arabic || plate.digits || plate.latin)

  return (
    <>
      {header}
      <div className="space-y-4 pb-6">
        {/* Plate */}
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <img
              src={record.thumbnail}
              alt={t('result.photoAlt')}
              className="size-14 shrink-0 rounded-2xl object-cover ring-1 ring-line"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted">{formatDateTime(record.createdAt, locale)}</p>
              <div className="mt-1">
                <ConfidenceBadge level={plate.confidence} />
              </div>
            </div>
          </div>
          <PlateDisplay size="lg" arabic={plate.arabic} latin={plate.latin} digits={plate.digits} className="mx-auto" />
          {/* LTR line with the Arabic letters isolated, so it reads like the plate: letters · digits · Latin. */}
          <p className="mt-3 text-center text-sm text-muted tabular" dir="ltr">
            {plateReadable ? (
              <>
                <bdi dir="rtl">{plate.arabic}</bdi>
                {[plate.digits, plate.latin].filter(Boolean).map((part) => ` · ${part}`)}
              </>
            ) : (
              <span dir="auto">{t('result.plateUnreadable')}</span>
            )}
          </p>
          {traits.length > 0 && (
            <ul className="mt-3 flex flex-wrap justify-center gap-2">
              {traits.map((trait) => (
                <li
                  key={trait}
                  className="rounded-full bg-brand-500/12 px-3 py-1 text-xs font-semibold text-brand-600 ring-1 ring-brand-500/25 dark:text-brand-300"
                >
                  {t(`traits.${trait}`)}
                </li>
              ))}
            </ul>
          )}
          {plate.confidence === 'low' && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-warn/10 p-3 text-sm ring-1 ring-warn/30">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
              <p className="flex-1">{t('result.lowConfidence')}</p>
              <Button size="sm" variant="secondary" onClick={() => navigate({ name: 'scan' })}>
                {t('result.retake')}
              </Button>
            </div>
          )}
        </Card>

        {/* Vehicle + price */}
        <Card>
          <SectionTitle
            action={
              !editing &&
              !pending && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<PencilLine className="size-4" />}
                  onClick={() => {
                    setReestimateError(null)
                    setEditing(true)
                  }}
                >
                  {vehicle ? t('result.edit') : t('result.addVehicle')}
                </Button>
              )
            }
          >
            {t('result.vehicle')}
          </SectionTitle>

          {pending ? (
            <LoadingProgress skipReading stage={pending.stage} detail={pending.detail} startedAt={pending.startedAt} />
          ) : editing ? (
            <VehicleEditor
              initial={lastCorrection ? { ...lastCorrection, confidence: 'high' } : vehicle}
              busy={Boolean(pending)}
              onSubmit={(c) => void reestimate(c)}
              onCancel={() => {
                setEditing(false)
                setReestimateError(null)
              }}
            />
          ) : vehicle ? (
            <>
              <p className="text-2xl font-bold" dir="auto">
                {vehicle.make} {vehicle.model}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-surface-2 p-3">
                  <dt className="text-muted">{t('result.yearRange')}</dt>
                  <dd className="mt-0.5 font-semibold tabular" dir="ltr">
                    {vehicle.yearRange || '—'}
                  </dd>
                </div>
                <div className="rounded-2xl bg-surface-2 p-3">
                  <dt className="text-muted">{t('result.color')}</dt>
                  <dd className="mt-0.5 font-semibold" dir="auto">
                    {vehicle.color || '—'}
                  </dd>
                </div>
              </dl>
              <div className="mt-3">
                {record.corrected ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold ring-1 ring-line">
                    <PencilLine className="size-3.5" />
                    {t('result.corrected')}
                  </span>
                ) : (
                  <ConfidenceBadge level={vehicle.confidence} />
                )}
              </div>
            </>
          ) : (
            <p className="text-base text-muted">{t('result.vehicleUnknown')}</p>
          )}

          {reestimateError && !pending && (
            <div className="mt-4 rounded-2xl bg-danger/8 p-4 ring-1 ring-danger/25">
              <p className="font-semibold text-danger">{apiErrorCopy(reestimateError, t).title}</p>
              <p className="mt-1 text-sm text-muted">{apiErrorCopy(reestimateError, t).body}</p>
              {apiErrorCopy(reestimateError, t).details && (
                <p className="mt-2 text-xs text-muted" dir="auto">
                  {apiErrorCopy(reestimateError, t).details}
                </p>
              )}
              {isKeyError(reestimateError.code) && (
                <Button size="sm" className="mt-3 me-2" onClick={() => navigate({ name: 'settings' })}>
                  {t('error.openSettings')}
                </Button>
              )}
              {lastCorrection && !isKeyError(reestimateError.code) && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  icon={<RotateCcw className="size-4" />}
                  onClick={() => void reestimate(lastCorrection)}
                >
                  {t('common.retry')}
                </Button>
              )}
            </div>
          )}

          {!pending && (
            <div className="mt-5 border-t border-line pt-5">
              <SectionTitle>{t('result.vehiclePrice')}</SectionTitle>
              {vehiclePriceSAR ? (
                <>
                  <PriceRange {...vehiclePriceSAR} />
                  {vehiclePriceSAR.basis && (
                    <Explanation label={t('result.basis')} text={vehiclePriceSAR.basis} />
                  )}
                </>
              ) : (
                <p className="text-sm text-muted">{t('result.vehiclePriceNone')}</p>
              )}
            </div>
          )}
        </Card>

        {/* Plate value */}
        <Card>
          <SectionTitle>{t('result.plateValue')}</SectionTitle>
          {plateValueSAR ? (
            <>
              <PriceRange {...plateValueSAR} />
              {plateValueSAR.reasoning && (
                <Explanation label={t('result.reasoning')} text={plateValueSAR.reasoning} />
              )}
            </>
          ) : (
            <p className="text-sm text-muted">{t('result.plateValueNone')}</p>
          )}
        </Card>

        {notes && (
          <Card>
            <SectionTitle>{t('result.notes')}</SectionTitle>
            <p className="text-base leading-relaxed" dir="auto">
              {notes}
            </p>
          </Card>
        )}

        <Card>
          <SectionTitle>{t('result.sources')}</SectionTitle>
          <SourcesList sources={sources} />
        </Card>

        <div className="flex gap-3 rounded-3xl bg-surface-2 p-4 text-sm leading-relaxed text-muted ring-1 ring-line">
          <Info className="mt-0.5 size-5 shrink-0" />
          <p>{t('result.disclaimer')}</p>
        </div>

        <Button size="lg" block icon={<Camera className="size-5" />} onClick={() => navigate({ name: 'scan' })}>
          {t('result.scanAnother')}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        message={t('result.deleteConfirm')}
        confirmLabel={t('common.delete')}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          void deleteScan(record.id).then(() => navigate({ name: 'history' }, { replace: true }))
        }}
      />
    </>
  )
}

/** Label + free text from the AI; the text gets its own direction (it may be English in the Arabic UI). */
function Explanation({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-4 text-sm leading-relaxed">
      <p className="font-semibold">{label}</p>
      <p className="mt-0.5 text-muted" dir="auto">
        {text}
      </p>
    </div>
  )
}
