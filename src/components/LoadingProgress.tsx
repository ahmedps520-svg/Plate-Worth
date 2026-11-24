import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ProgressStage } from '../../shared/schema'
import type { MessageKey } from '../lib/i18n'
import { useSettings } from '../lib/settings'
import { Spinner } from './ui'
import { cx } from '../lib/cx'

const STAGES: Array<{ stage: ProgressStage; key: MessageKey }> = [
  { stage: 'reading', key: 'progress.reading' },
  { stage: 'searching', key: 'progress.searching' },
  { stage: 'finalizing', key: 'progress.finalizing' },
]

interface LoadingProgressProps {
  stage: ProgressStage
  detail?: string
  startedAt: number
  /** Re-estimates have no photo to read, so they skip the first step. */
  skipReading?: boolean
}

export function LoadingProgress({ stage, detail, startedAt, skipReading }: LoadingProgressProps) {
  const { t } = useSettings()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const steps = skipReading ? STAGES.slice(1) : STAGES
  const current = steps.findIndex((s) => s.stage === stage)
  const elapsed = Math.max(0, Math.round((now - startedAt) / 1000))

  return (
    <div role="status" aria-live="polite" className="w-full">
      <ol className="space-y-3">
        {steps.map((step, i) => {
          const done = i < current
          const active = i === current
          return (
            <li
              key={step.stage}
              className={cx(
                'flex items-center gap-3 text-base transition-opacity duration-300',
                !done && !active && 'opacity-45',
              )}
            >
              <span
                className={cx(
                  'flex size-7 shrink-0 items-center justify-center rounded-full',
                  done ? 'bg-brand-500 text-white' : active ? 'bg-brand-500/15 text-brand-500' : 'bg-surface-2 text-muted',
                )}
              >
                {done ? <Check className="size-4" strokeWidth={3} /> : active ? <Spinner className="size-4" /> : i + 1}
              </span>
              <span className={cx('font-medium', active && 'font-semibold')}>{t(step.key)}</span>
            </li>
          )
        })}
      </ol>
      <p className="mt-4 min-h-5 truncate text-sm text-muted" dir="auto">
        {detail && stage === 'searching' ? t('progress.query', { query: detail }) : t('progress.wait')}
      </p>
      <p className="mt-1 text-xs text-muted tabular">{t('common.seconds', { n: elapsed })}</p>
    </div>
  )
}
