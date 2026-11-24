import { ArrowLeft, History, House, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { navigate, type Route } from '../lib/router'
import { useSettings } from '../lib/settings'
import { IconButton } from './ui'
import { cx } from '../lib/cx'

export function PageHeader({
  title,
  onBack,
  actions,
}: {
  title: ReactNode
  onBack?: () => void
  actions?: ReactNode
}) {
  const { t } = useSettings()
  return (
    <header className="sticky top-0 z-30 -mx-4 mb-4 flex min-h-16 items-center gap-2 bg-canvas/85 px-2 pt-safe backdrop-blur-lg">
      {onBack ? (
        <IconButton label={t('common.back')} onClick={onBack}>
          <ArrowLeft className="size-6 rtl:-scale-x-100" />
        </IconButton>
      ) : (
        <span className="w-2" />
      )}
      <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{title}</h1>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </header>
  )
}

const TABS: Array<{ route: Route; icon: typeof House; key: 'nav.home' | 'nav.history' | 'nav.settings' }> = [
  { route: { name: 'home' }, icon: House, key: 'nav.home' },
  { route: { name: 'history' }, icon: History, key: 'nav.history' },
  { route: { name: 'settings' }, icon: Settings, key: 'nav.settings' },
]

export function BottomNav({ current }: { current: Route['name'] }) {
  const { t } = useSettings()
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-safe backdrop-blur-lg"
    >
      <div className="mx-auto grid max-w-lg grid-cols-3">
        {TABS.map(({ route, icon: Icon, key }) => {
          const active = current === route.name || (route.name === 'history' && current === 'result')
          return (
            <button
              key={route.name}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(route, { replace: true })}
              className={cx(
                'flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors',
                active ? 'text-brand-500' : 'text-muted hover:text-ink',
              )}
            >
              <Icon className="size-6" strokeWidth={active ? 2.4 : 2} />
              {t(key)}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
