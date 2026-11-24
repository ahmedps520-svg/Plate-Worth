/**
 * Minimal hash router. Hash URLs keep the app fully static (no rewrites), work
 * offline from the service worker's single index.html, and give the Android
 * back button natural behavior.
 */
import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'scan' }
  | { name: 'result'; id: string }
  | { name: 'history' }
  | { name: 'settings' }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+/, '').replace(/\/+$/, '')
  const [first, second] = path.split('/')
  switch (first) {
    case 'scan':
      return { name: 'scan' }
    case 'history':
      return { name: 'history' }
    case 'settings':
      return { name: 'settings' }
    case 'result':
      return second ? { name: 'result', id: decodeURIComponent(second) } : { name: 'history' }
    default:
      return { name: 'home' }
  }
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'result':
      return `#/result/${encodeURIComponent(route.id)}`
    default:
      return `#/${route.name}`
  }
}

/** How many in-app entries sit below the current one in the history stack. */
function depth(): number {
  const state = history.state as { pwDepth?: number } | null
  return typeof state?.pwDepth === 'number' ? state.pwDepth : 0
}

function emit(): void {
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function navigate(route: Route, opts: { replace?: boolean } = {}): void {
  const href = hrefFor(route)
  if (opts.replace) {
    history.replaceState({ pwDepth: depth() }, '', href)
  } else {
    if (location.hash === href) return
    history.pushState({ pwDepth: depth() + 1 }, '', href)
  }
  emit()
}

/** Goes back within the app, or to `fallback` when opened directly on a deep link. */
export function goBack(fallback: Route = { name: 'home' }): void {
  if (depth() > 0) history.back()
  else navigate(fallback, { replace: true })
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback)
  window.addEventListener('popstate', callback)
  return () => {
    window.removeEventListener('hashchange', callback)
    window.removeEventListener('popstate', callback)
  }
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash, () => '')
  return parseHash(hash)
}
