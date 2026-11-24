import { ExternalLink } from 'lucide-react'
import type { Source } from '../../shared/schema'
import { hostnameOf } from '../lib/format'
import { useSettings } from '../lib/settings'

export function SourcesList({ sources }: { sources: Source[] }) {
  const { t } = useSettings()
  if (sources.length === 0) return <p className="text-sm text-muted">{t('result.noSources')}</p>

  return (
    <ol className="space-y-2">
      {sources.map((source, i) => (
        <li key={source.url}>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5 ring-1 ring-line/70 transition-colors hover:bg-line/50 active:bg-line"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-600 dark:text-brand-300 tabular">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 block text-sm font-medium" dir="auto">
                {source.title}
              </span>
              <span className="block truncate text-xs text-muted" dir="ltr">
                {hostnameOf(source.url)}
              </span>
            </span>
            <ExternalLink className="size-4 shrink-0 text-muted rtl:-scale-x-100" />
          </a>
        </li>
      ))}
    </ol>
  )
}
