import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ApiKeyCard } from '../components/ApiKeyCard'
import { PageHeader } from '../components/AppChrome'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Segmented, Toggle } from '../components/Segmented'
import { useToast } from '../components/Toast'
import { Button, Card, SectionTitle } from '../components/ui'
import { clearScans } from '../lib/db'
import { useSettings } from '../lib/settings'
import { useScans } from '../lib/useScans'

export function SettingsPage() {
  const { t, locale, theme, showUsd, update } = useSettings()
  const toast = useToast()
  const scans = useScans()
  const [confirmClear, setConfirmClear] = useState(false)

  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="space-y-4 pb-6">
        <ApiKeyCard />

        <Card>
          <SectionTitle>{t('settings.language')}</SectionTitle>
          <Segmented
            label={t('settings.language')}
            value={locale}
            onChange={(value) => update({ locale: value })}
            options={[
              { value: 'en', label: 'English', lang: 'en' },
              { value: 'ar', label: 'العربية', lang: 'ar' },
            ]}
          />
        </Card>

        <Card>
          <SectionTitle>{t('settings.theme')}</SectionTitle>
          <Segmented
            label={t('settings.theme')}
            value={theme}
            onChange={(value) => update({ theme: value })}
            options={[
              { value: 'dark', label: t('settings.themeDark') },
              { value: 'light', label: t('settings.themeLight') },
            ]}
          />
        </Card>

        <Card>
          <SectionTitle>{t('settings.currency')}</SectionTitle>
          <p className="mb-3 text-base">{t('settings.currencyBody')}</p>
          <Toggle
            checked={showUsd}
            onChange={(value) => update({ showUsd: value })}
            label={t('settings.showUsd')}
            description={t('settings.showUsdHint')}
          />
        </Card>

        <Card>
          <SectionTitle>{t('settings.data')}</SectionTitle>
          <p className="mb-3 text-sm text-muted">{t('history.count', { count: scans?.length ?? 0 })}</p>
          <Button
            variant="danger"
            block
            disabled={!scans?.length}
            icon={<Trash2 className="size-5" />}
            onClick={() => setConfirmClear(true)}
          >
            {t('settings.clearHistory')}
          </Button>
        </Card>

        <Card>
          <SectionTitle>{t('settings.privacy')}</SectionTitle>
          <p className="text-base leading-relaxed">{t('settings.privacyBody')}</p>
        </Card>

        <Card>
          <SectionTitle>{t('settings.about')}</SectionTitle>
          <p className="text-base">
            {t('app.name')} · {t('settings.version', { version: __APP_VERSION__ })}
          </p>
          <p className="mt-1 text-sm text-muted">{t('app.tagline')}</p>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmClear}
        message={t('history.clearConfirm', { count: scans?.length ?? 0 })}
        confirmLabel={t('history.clear')}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => void clearScans().then(() => toast(t('settings.cleared')))}
      />
    </>
  )
}
