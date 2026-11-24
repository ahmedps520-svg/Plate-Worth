import type { Confidence } from '../../shared/schema'
import { useSettings } from '../lib/settings'
import { cx } from '../lib/cx'

const STYLES: Record<Confidence, string> = {
  high: 'bg-brand-500/12 text-brand-600 ring-brand-500/30 dark:text-brand-300',
  medium: 'bg-warn/12 text-warn ring-warn/30',
  low: 'bg-danger/12 text-danger ring-danger/30',
}

export function ConfidenceBadge({ level, className }: { level: Confidence; className?: string }) {
  const { t } = useSettings()
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
        STYLES[level],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {t(`confidence.${level}`)}
    </span>
  )
}
