import { displayArabicLetter, splitLetters, toArabicIndicDigits } from '../../shared/plate'
import { cx } from '../lib/cx'

interface PlateDisplayProps {
  arabic: string
  latin: string
  digits: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
}

const SIZES = {
  sm: { width: 'w-40', top: 'text-lg', bottom: 'text-sm', band: 'w-6 text-[0.45rem]', pad: 'px-1.5 py-1' },
  md: { width: 'w-64', top: 'text-3xl', bottom: 'text-xl', band: 'w-9 text-[0.6rem]', pad: 'px-2.5 py-1.5' },
  lg: { width: 'w-full max-w-sm', top: 'text-4xl', bottom: 'text-2xl', band: 'w-11 text-[0.7rem]', pad: 'px-3 py-2' },
} as const

/**
 * A Saudi-style plate: white body, digits block, letters block (Arabic above,
 * Latin below) and a green KSA band. The layout is a physical object, so it
 * stays left-to-right in both UI languages.
 */
export function PlateDisplay({ arabic, latin, digits, size = 'md', className, label }: PlateDisplayProps) {
  const s = SIZES[size]
  const arabicLetters = splitLetters(arabic).map(displayArabicLetter)
  const latinLetters = splitLetters(latin)
  const placeholder = '—'

  return (
    <figure
      dir="ltr"
      role="img"
      aria-label={label ?? `${arabic} ${digits} ${latin}`.trim()}
      className={cx(
        'relative flex overflow-hidden rounded-xl bg-white text-neutral-950 shadow-lg ring-[3px] ring-neutral-900/85 aspect-[4.4/1]',
        s.width,
        className,
      )}
    >
      <div className="grid flex-1 grid-cols-2 grid-rows-2 font-bold tabular">
        {/* Top-left: Arabic-Indic digits */}
        <div
          className={cx(
            'flex items-center justify-center border-r-2 border-b-2 border-neutral-900/80 leading-none',
            s.top,
            s.pad,
          )}
        >
          {digits ? toArabicIndicDigits(digits) : placeholder}
        </div>
        {/* Top-right: Arabic letters (right-to-left) */}
        <div
          dir="rtl"
          className={cx('flex items-center justify-center gap-[0.3em] border-b-2 border-neutral-900/80 leading-none', s.top, s.pad)}
        >
          {arabicLetters.length ? arabicLetters.map((l, i) => <span key={i}>{l}</span>) : placeholder}
        </div>
        {/* Bottom-left: Western digits */}
        <div
          className={cx(
            'flex items-center justify-center border-r-2 border-neutral-900/80 tracking-[0.12em] leading-none',
            s.bottom,
            s.pad,
          )}
        >
          {digits || placeholder}
        </div>
        {/* Bottom-right: Latin letters, as printed */}
        <div className={cx('flex items-center justify-center gap-[0.35em] leading-none', s.bottom, s.pad)}>
          {latinLetters.length ? latinLetters.map((l, i) => <span key={i}>{l}</span>) : placeholder}
        </div>
      </div>
      {/* Green KSA band */}
      <div
        aria-hidden
        className={cx(
          'flex flex-col items-center justify-between bg-brand-600 py-1 font-bold leading-none text-white',
          s.band,
        )}
      >
        {size !== 'sm' && (
          <svg viewBox="0 0 24 24" className="size-[1.6em] opacity-95" fill="currentColor" aria-hidden>
            <path d="M12 3c.4 2.1 1.7 3.4 3.8 3.8-1.6.3-2.8 1-3.4 2.2l.1 9.5h-1l.1-9.5C11 7.8 9.8 7.1 8.2 6.8 10.3 6.4 11.6 5.1 12 3Zm-6 15.5h12v1.5H6v-1.5Z" />
          </svg>
        )}
        <span className="flex flex-1 flex-col items-center justify-center gap-px">
          <span>K</span>
          <span>S</span>
          <span>A</span>
        </span>
      </div>
    </figure>
  )
}
