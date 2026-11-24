import { useEffect, useState } from 'react'
import { HISTORY_CHANGED_EVENT, listScans, type ScanRecord } from './db'

/** All saved scans (newest first); null while loading. Live-updates on changes. */
export function useScans(): ScanRecord[] | null {
  const [scans, setScans] = useState<ScanRecord[] | null>(null)

  useEffect(() => {
    let active = true
    const load = () =>
      listScans()
        .then((list) => active && setScans(list))
        .catch(() => active && setScans([]))
    void load()
    window.addEventListener(HISTORY_CHANGED_EVENT, load)
    return () => {
      active = false
      window.removeEventListener(HISTORY_CHANGED_EVENT, load)
    }
  }, [])

  return scans
}
