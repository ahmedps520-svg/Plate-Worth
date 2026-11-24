import { cx } from '../lib/cx'

interface Option<T extends string> {
  value: T
  label: string
  lang?: string
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-surface-2 p-1">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={option.lang}
            onClick={() => onChange(option.value)}
            className={cx(
              'min-h-11 rounded-xl px-3 text-base font-semibold transition-all duration-200',
              selected ? 'bg-surface text-ink shadow ring-1 ring-line' : 'text-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-2 text-start"
    >
      <span>
        <span className="block text-base font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-muted">{description}</span>}
      </span>
      <span
        aria-hidden
        className={cx(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-brand-500' : 'bg-line',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 size-6 rounded-full bg-white shadow transition-[inset-inline-start] duration-200',
            checked ? 'start-[1.375rem]' : 'start-0.5',
          )}
        />
      </span>
    </button>
  )
}
