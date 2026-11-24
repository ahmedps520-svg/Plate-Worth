import { ChevronRight, Trash2 } from 'lucide-react'
import type { ScanRecord } from '../lib/db'
import { formatDateTime, formatSARCompact } from '../lib/format'
import { navigate } from '../lib/router'
import { useSettings } from '../lib/settings'
import { PlateDisplay } from './PlateDisplay'
import { IconButton } from './ui'

export function ScanListItem({ record, onDelete }: { record: ScanRecord; onDelete?: (record: ScanRecord) => void }) {
  const { t, locale } = useSettings()
  const { plate, vehicle, vehiclePriceSAR, plateValueSAR } = record.result
  const vehicleName = vehicle ? [vehicle.make, vehicle.model, vehicle.yearRange].filter(Boolean).join(' ') : t('history.unknownVehicle')

  return (
    <li className="flex items-stretch gap-1 rounded-3xl bg-surface ring-1 ring-line animate-fade-in">
      <button
        type="button"
        onClick={() => navigate({ name: 'result', id: record.id })}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-3xl p-3 text-start transition-colors hover:bg-surface-2/60 active:bg-surface-2"
      >
        <img
          src={record.thumbnail}
          alt=""
          className="size-16 shrink-0 rounded-2xl object-cover ring-1 ring-line"
          loading="lazy"
          decoding="async"
        />
        <span className="min-w-0 flex-1 space-y-1.5">
          <PlateDisplay size="sm" arabic={plate.arabic} latin={plate.latin} digits={plate.digits} className="max-w-full" />
          <span className="block truncate text-sm font-semibold" dir="auto">
            {vehicleName}
          </span>
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted tabular">
            {vehiclePriceSAR && (
              <span>
                {t('result.vehicle')}: {formatSARCompact(vehiclePriceSAR.typical, locale)}
              </span>
            )}
            {plateValueSAR && (
              <span>
                {t('result.plate')}: {formatSARCompact(plateValueSAR.typical, locale)}
              </span>
            )}
          </span>
          <span className="block text-xs text-muted">{formatDateTime(record.createdAt, locale)}</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted rtl:-scale-x-100" aria-hidden />
      </button>
      {onDelete && (
        <IconButton
          label={t('history.deleteOne')}
          onClick={() => onDelete(record)}
          className="my-auto me-1 text-muted hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 className="size-5" />
        </IconButton>
      )}
    </li>
  )
}
