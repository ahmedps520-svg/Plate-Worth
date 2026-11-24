import { CheckCircle2, ExternalLink, Eye, EyeOff, ShieldCheck, Trash2, XCircle } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import type { KeyCheck } from '../lib/api'
import { cx } from '../lib/cx'
import { maskApiKey, useSettings } from '../lib/settings'
import { ConfirmDialog } from './ConfirmDialog'
import { useToast } from './Toast'
import { Button, Card, IconButton, SectionTitle } from './ui'

const KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,}$/

/**
 * Paste / check / remove the user's own Anthropic API key. The key is kept in
 * this browser's localStorage only and sent only to api.anthropic.com.
 */
export function ApiKeyCard({ id }: { id?: string }) {
  const { t, apiKey, setApiKey } = useSettings()
  const toast = useToast()
  const inputId = useId()
  const [editing, setEditing] = useState(!apiKey)
  const [draft, setDraft] = useState('')
  const [visible, setVisible] = useState(false)
  const [check, setCheck] = useState<KeyCheck | 'checking' | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const draftTrimmed = draft.trim()
  const formatWarning = draftTrimmed.length > 0 && !KEY_PATTERN.test(draftTrimmed)

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!draftTrimmed) return
    setApiKey(draftTrimmed)
    setDraft('')
    setVisible(false)
    setEditing(false)
    setCheck(null)
    toast(t('settings.apiKeySaved'))
  }

  const runCheck = async () => {
    if (!apiKey) return
    setCheck('checking')
    const { checkApiKey } = await import('../lib/api')
    const { status } = await checkApiKey(apiKey)
    setCheck(status)
  }

  return (
    <Card>
      <span id={id} className="relative -top-20 block" aria-hidden />
      <SectionTitle>{t('settings.apiKey')}</SectionTitle>
      <p className="text-sm leading-relaxed text-muted">{t('settings.apiKeyBody')}</p>

      {apiKey && !editing ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
            <ShieldCheck className="size-5 shrink-0 text-brand-500" />
            <p className="min-w-0 flex-1 text-sm">
              {t('settings.apiKeyStatus', { masked: '' })}
              <span className="font-mono font-semibold" dir="ltr">
                {maskApiKey(apiKey)}
              </span>
            </p>
          </div>

          {check && check !== 'checking' && (
            <p
              role="status"
              className={cx(
                'flex items-center gap-2 text-sm font-medium',
                check === 'valid' ? 'text-brand-600 dark:text-brand-300' : 'text-danger',
              )}
            >
              {check === 'valid' ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
              {check === 'valid'
                ? t('settings.apiKeyValid')
                : check === 'invalid'
                  ? t('settings.apiKeyInvalid')
                  : check === 'offline'
                    ? t('settings.apiKeyOffline')
                    : t('settings.apiKeyCheckFailed')}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => void runCheck()} disabled={check === 'checking'}>
              {check === 'checking' ? t('settings.apiKeyChecking') : t('settings.apiKeyCheck')}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t('settings.apiKeyReplace')}
            </Button>
          </div>
          <Button variant="danger" block icon={<Trash2 className="size-4" />} onClick={() => setConfirmRemove(true)}>
            {t('settings.apiKeyRemove')}
          </Button>
        </div>
      ) : (
        <form onSubmit={save} className="mt-4 space-y-3" autoComplete="off">
          {!apiKey && <p className="text-sm font-medium">{t('settings.apiKeyNone')}</p>}
          <label htmlFor={inputId} className="block">
            <span className="mb-1.5 block text-sm font-medium text-muted">{t('settings.apiKeyLabel')}</span>
            <span className="flex items-center gap-2">
              <input
                id={inputId}
                name="anthropic-api-key"
                type={visible ? 'text' : 'password'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('settings.apiKeyPlaceholder')}
                dir="ltr"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="h-12 min-w-0 flex-1 rounded-xl bg-surface-2 px-3.5 font-mono text-sm text-ink ring-1 ring-line placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <IconButton
                label={visible ? t('settings.apiKeyHide') : t('settings.apiKeyShow')}
                onClick={() => setVisible((v) => !v)}
                className="text-muted hover:bg-surface-2"
              >
                {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </IconButton>
            </span>
          </label>
          {formatWarning && <p className="text-sm text-warn">{t('settings.apiKeyFormat')}</p>}
          <div className={cx('grid gap-3', apiKey ? 'grid-cols-2' : 'grid-cols-1')}>
            {apiKey && (
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft('')
                  setEditing(false)
                }}
              >
                {t('common.cancel')}
              </Button>
            )}
            <Button type="submit" disabled={!draftTrimmed}>
              {t('settings.apiKeySave')}
            </Button>
          </div>
        </form>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted">{t('settings.apiKeyCost')}</p>
      <a
        href="https://console.anthropic.com/settings/keys"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
      >
        {t('settings.apiKeyGet')}
        <ExternalLink className="size-3.5 rtl:-scale-x-100" />
      </a>

      <ConfirmDialog
        open={confirmRemove}
        message={t('settings.apiKeyRemoveConfirm')}
        confirmLabel={t('settings.apiKeyRemove')}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => {
          setApiKey(null)
          setEditing(true)
          setCheck(null)
          toast(t('settings.apiKeyRemoved'))
        }}
      />
    </Card>
  )
}
