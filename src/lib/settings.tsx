/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Locale } from '../../shared/schema'
import { detectLocale, directionOf, translate, type Translate } from './i18n'

export type Theme = 'dark' | 'light'

export interface Settings {
  locale: Locale
  theme: Theme
  showUsd: boolean
}

// Keep in sync with public/theme-init.js (applies the theme before React loads).
export const SETTINGS_STORAGE_KEY = 'plateworth.settings.v1'
const ACK_STORAGE_KEY = 'plateworth.firstRunAck.v1'
const THEME_COLORS: Record<Theme, string> = { dark: '#0a0f0d', light: '#f5f7f4' }

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // private mode / storage disabled: settings just won't persist
  }
}

function loadSettings(): Settings {
  const defaults: Settings = { locale: detectLocale(), theme: 'dark', showUsd: false }
  const raw = readStorage(SETTINGS_STORAGE_KEY)
  if (!raw) return defaults
  try {
    const saved = JSON.parse(raw) as Partial<Settings>
    return {
      locale: saved.locale === 'ar' || saved.locale === 'en' ? saved.locale : defaults.locale,
      theme: saved.theme === 'light' || saved.theme === 'dark' ? saved.theme : defaults.theme,
      showUsd: typeof saved.showUsd === 'boolean' ? saved.showUsd : defaults.showUsd,
    }
  } catch {
    return defaults
  }
}

interface SettingsContextValue extends Settings {
  dir: 'rtl' | 'ltr'
  t: Translate
  update: (patch: Partial<Settings>) => void
  firstRunAcknowledged: boolean
  acknowledgeFirstRun: () => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [acknowledged, setAcknowledged] = useState(() => readStorage(ACK_STORAGE_KEY) === '1')

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      writeStorage(SETTINGS_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const acknowledgeFirstRun = useCallback(() => {
    writeStorage(ACK_STORAGE_KEY, '1')
    setAcknowledged(true)
  }, [])

  const dir = directionOf(settings.locale)

  useEffect(() => {
    const root = document.documentElement
    root.lang = settings.locale
    root.dir = dir
  }, [settings.locale, dir])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', settings.theme === 'dark')
    root.style.colorScheme = settings.theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[settings.theme])
  }, [settings.theme])

  const t = useCallback<Translate>((key, vars) => translate(settings.locale, key, vars), [settings.locale])

  const value = useMemo<SettingsContextValue>(
    () => ({ ...settings, dir, t, update, firstRunAcknowledged: acknowledged, acknowledgeFirstRun }),
    [settings, dir, t, update, acknowledged, acknowledgeFirstRun],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>')
  return ctx
}
