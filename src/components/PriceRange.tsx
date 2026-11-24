import { formatSAR, formatSARRange, formatUSDFromSAR, rangePosition } from '../lib/format'
import { useSettings } from '../lib/settings'

interface PriceRangeProps {
  low: number
  typical: number
  high: number
}

/** Big "typical" figure, a low–high track with a marker, and optional USD. */
export function PriceRange({ low, typical, high }: PriceRangeProps) {
  const { t, locale, showUsd, dir } = useSettings()
  const position = rangePosition(low, typical, high)

  return (
    <div>
      <p className="text-xs font-medium text-muted">{t('result.typical')}</p>
      <p className="mt-0.5 text-3xl font-bold tracking-tight tabular">{formatSAR(typical, locale)}</p>
      {showUsd && <p className="mt-0.5 text-sm text-muted tabular">{formatUSDFromSAR(typical, locale)}</p>}

      <div className="mt-4" aria-label={formatSARRange(low, high, locale)}>
        <div className="relative h-2 rounded-full bg-gradient-to-r from-brand-100 via-brand-300 to-brand-500 rtl:bg-gradient-to-l">
          <span
            aria-hidden
            className="absolute top-1/2 size-4 -translate-y-1/2 rounded-full border-[3px] border-surface bg-brand-600 shadow"
            style={dir === 'rtl' ? { right: `calc(${position}% - 0.5rem)` } : { left: `calc(${position}% - 0.5rem)` }}
          />
        </div>
        <div className="mt-2 flex justify-between gap-4 text-xs">
          <div>
            <p className="text-muted">{t('result.low')}</p>
            <p className="font-semibold tabular">{formatSAR(low, locale)}</p>
            {showUsd && <p className="text-muted tabular">{formatUSDFromSAR(low, locale)}</p>}
          </div>
          <div className="text-end">
            <p className="text-muted">{t('result.high')}</p>
            <p className="font-semibold tabular">{formatSAR(high, locale)}</p>
            {showUsd && <p className="text-muted tabular">{formatUSDFromSAR(high, locale)}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
