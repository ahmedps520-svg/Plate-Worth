import type { ReactNode } from 'react'
import { cx } from '../lib/cx'
import type { ErrorCopy } from '../lib/errorCopy'

export function ErrorState({
  copy,
  actions,
  className,
  tone = 'danger',
}: {
  copy: ErrorCopy
  actions?: ReactNode
  className?: string
  tone?: 'danger' | 'warn'
}) {
  const Icon = copy.icon
  return (
    <div role="alert" className={cx('flex flex-col items-center text-center animate-pop', className)}>
      <span
        className={cx(
          'flex size-16 items-center justify-center rounded-full',
          tone === 'danger' ? 'bg-danger/12 text-danger' : 'bg-warn/12 text-warn',
        )}
      >
        <Icon className="size-8" />
      </span>
      <h2 className="mt-4 text-xl font-bold">{copy.title}</h2>
      <p className="mt-2 max-w-sm text-base text-muted">{copy.body}</p>
      {actions && <div className="mt-6 flex w-full max-w-xs flex-col gap-3">{actions}</div>}
    </div>
  )
}
