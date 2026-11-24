import { useEffect, useRef } from 'react'
import { useSettings } from '../lib/settings'
import { Button } from './ui'

interface ConfirmDialogProps {
  open: boolean
  message: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({ open, message, confirmLabel, onConfirm, onClose }: ConfirmDialogProps) {
  const { t } = useSettings()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="m-auto w-[min(92vw,24rem)] rounded-3xl bg-surface p-0 text-ink shadow-2xl ring-1 ring-line backdrop:bg-black/60 animate-pop"
    >
      <div className="p-6">
        <p className="text-lg font-medium leading-relaxed">{message}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
