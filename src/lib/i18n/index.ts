import type { Locale } from '../../../shared/schema'
import { ar } from './ar'
import { en, type MessageKey } from './en'

export type { MessageKey }
export type TranslateVars = Record<string, string | number>
export type Translate = (key: MessageKey, vars?: TranslateVars) => string

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { en, ar }

export function translate(locale: Locale, key: MessageKey, vars?: TranslateVars): string {
  const template = DICTIONARIES[locale][key] ?? en[key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match))
}

export function directionOf(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr'
}

export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  return languages.some((l) => l?.toLowerCase().startsWith('ar')) ? 'ar' : 'en'
}
