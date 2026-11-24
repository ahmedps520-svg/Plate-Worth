import { Camera, Download, History as HistoryIcon, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../components/AppChrome'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ScanListItem } from '../components/ScanListItem'
import { useToast } from '../components/Toast'
import { Button, IconButton, Spinner } from '../components/ui'
import { clearScans, deleteScan, type ScanRecord } from '../lib/db'
import { csvFilename, exportCsv, scansToCsv } from '../lib/csv'
import { navigate } from '../lib/router'
import { useSettings } from '../lib/settings'
import { useScans } from '../lib/useScans'

export function HistoryPage() {
  const { t } = useSettings()
  const toast = useToast()
  const scans = useScans()
  const [pendingDelete, setPendingDelete] = useState<ScanRecord | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const onExport = async () => {
    if (!scans?.length) return
    try {
      const outcome = await exportCsv(csvFilename(), scansToCsv(scans))
      if (outcome !== 'cancelled') toast(t('history.exported'))
    } catch {
      toast(t('history.exportFailed'), 'error')
    }
  }

  const hasScans = Boolean(scans?.length)

  return (
    <>
      <PageHeader
        title={t('history.title')}
        actions={
          hasScans && (
            <>
              <IconButton label={t('history.export')} onClick={() => void onExport()}>
                <Download className="size-5" />
              </IconButton>
              <IconButton
                label={t('history.clear')}
                onClick={() => setConfirmClear(true)}
                className="text-muted hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="size-5" />
              </IconButton>
            </>
          )
        }
      />

      {scans === null ? (
        <div className="flex justify-center py-24 text-muted">
          <Spinner className="size-8" />
        </div>
      ) : scans.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center animate-fade-in">
          <span className="flex size-20 items-center justify-center rounded-full bg-surface-2 text-muted">
            <HistoryIcon className="size-9" />
          </span>
          <h2 className="mt-5 text-xl font-bold">{t('history.empty.title')}</h2>
          <p className="mt-2 max-w-xs text-muted">{t('history.empty.body')}</p>
          <Button size="lg" className="mt-6" icon={<Camera className="size-5" />} onClick={() => navigate({ name: 'scan' })}>
            {t('home.scan')}
          </Button>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">{t('history.count', { count: scans.length })}</p>
          <ul className="space-y-3 pb-6">
            {scans.map((record) => (
              <ScanListItem key={record.id} record={record} onDelete={setPendingDelete} />
            ))}
          </ul>
          <Button variant="secondary" block icon={<Download className="size-5" />} onClick={() => void onExport()}>
            {t('history.export')}
          </Button>
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        message={t('result.deleteConfirm')}
        confirmLabel={t('common.delete')}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && void deleteScan(pendingDelete.id)}
      />
      <ConfirmDialog
        open={confirmClear}
        message={t('history.clearConfirm', { count: scans?.length ?? 0 })}
        confirmLabel={t('history.clear')}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => void clearScans()}
      />
    </>
  )
}
