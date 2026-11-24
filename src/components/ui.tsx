import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from '../lib/cx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'lg' | 'md' | 'sm'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-500 text-brand-ink shadow-lg shadow-brand-500/20 hover:bg-brand-600 active:bg-brand-700 disabled:bg-brand-500/50',
  secondary: 'bg-surface-2 text-ink ring-1 ring-line hover:bg-line/60 active:bg-line disabled:opacity-50',
  ghost: 'text-ink hover:bg-surface-2 active:bg-line/70 disabled:opacity-50',
  danger: 'bg-danger/10 text-danger ring-1 ring-danger/30 hover:bg-danger/15 active:bg-danger/25 disabled:opacity-50',
}

const SIZES: Record<Size, string> = {
  lg: 'min-h-14 px-6 text-lg gap-3 rounded-2xl',
  md: 'min-h-12 px-5 text-base gap-2 rounded-xl',
  sm: 'min-h-10 px-3.5 text-sm gap-1.5 rounded-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, block, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex select-none items-center justify-center font-semibold transition-[background-color,transform,box-shadow] duration-150 active:scale-[0.98]',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-12 items-center justify-center rounded-full transition-colors active:scale-95',
        className ?? 'text-ink hover:bg-surface-2',
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cx('rounded-3xl bg-surface p-5 ring-1 ring-line animate-slide-up', className)}>
      {children}
    </section>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {action}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
    />
  )
}
