import { useId, useState, type FormEvent } from 'react'
import { vehicleCorrectionSchema, type Vehicle, type VehicleCorrection } from '../../shared/schema'
import { useSettings } from '../lib/settings'
import { Button } from './ui'

interface VehicleEditorProps {
  initial: Vehicle | null
  busy: boolean
  onSubmit: (correction: VehicleCorrection) => void
  onCancel: () => void
}

export function VehicleEditor({ initial, busy, onSubmit, onCancel }: VehicleEditorProps) {
  const { t } = useSettings()
  const id = useId()
  const [make, setMake] = useState(initial?.make ?? '')
  const [model, setModel] = useState(initial?.model ?? '')
  const [yearRange, setYearRange] = useState(initial?.yearRange ?? '')
  const [color, setColor] = useState(initial?.color ?? '')
  const [invalid, setInvalid] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = vehicleCorrectionSchema.safeParse({ make, model, yearRange, color })
    if (!parsed.success) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onSubmit(parsed.data)
  }

  const fields = [
    { key: 'make', label: t('result.make'), value: make, set: setMake, placeholder: t('editor.makePlaceholder'), max: 40, dir: 'auto' },
    { key: 'model', label: t('result.model'), value: model, set: setModel, placeholder: t('editor.modelPlaceholder'), max: 60, dir: 'auto' },
    {
      key: 'year',
      label: t('result.yearRange'),
      value: yearRange,
      set: setYearRange,
      placeholder: t('editor.yearPlaceholder'),
      max: 20,
      dir: 'ltr',
      inputMode: 'numeric' as const,
    },
    { key: 'color', label: t('result.color'), value: color, set: setColor, placeholder: t('editor.colorPlaceholder'), max: 30, dir: 'auto' },
  ]

  return (
    <form onSubmit={submit} noValidate className="space-y-4 animate-fade-in">
      <h3 className="text-lg font-bold">{t('editor.title')}</h3>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((field) => (
          <label key={field.key} htmlFor={`${id}-${field.key}`} className="block">
            <span className="mb-1.5 block text-sm font-medium text-muted">{field.label}</span>
            <input
              id={`${id}-${field.key}`}
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
              placeholder={field.placeholder}
              maxLength={field.max}
              dir={field.dir}
              inputMode={field.inputMode}
              autoComplete="off"
              disabled={busy}
              className="h-12 w-full rounded-xl bg-surface-2 px-3.5 text-base text-ink ring-1 ring-line placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
            />
          </label>
        ))}
      </div>
      {invalid && (
        <p role="alert" className="text-sm font-medium text-danger">
          {t('editor.invalid')}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? t('editor.working') : t('editor.submit')}
        </Button>
      </div>
    </form>
  )
}
