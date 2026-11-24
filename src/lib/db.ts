/**
 * Scan history in IndexedDB (works offline; nothing leaves the device).
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { EstimateMeta, EstimateResult, Locale } from '../../shared/schema'

export interface ScanRecord {
  id: string
  createdAt: number
  updatedAt: number
  /** Small JPEG data URL of the photo. */
  thumbnail: string
  result: EstimateResult
  locale: Locale
  /** True once the user corrected the vehicle and re-estimated. */
  corrected?: boolean
  meta?: EstimateMeta
}

interface PlateWorthDB extends DBSchema {
  scans: {
    key: string
    value: ScanRecord
    indexes: { createdAt: number }
  }
}

const DB_NAME = 'plateworth'
const DB_VERSION = 1
export const HISTORY_CHANGED_EVENT = 'plateworth:history-changed'

let dbPromise: Promise<IDBPDatabase<PlateWorthDB>> | undefined

function db(): Promise<IDBPDatabase<PlateWorthDB>> {
  dbPromise ??= openDB<PlateWorthDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      const store = database.createObjectStore('scans', { keyPath: 'id' })
      store.createIndex('createdAt', 'createdAt')
    },
  })
  return dbPromise
}

function notify(): void {
  window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT))
}

let persistRequested = false
/** Ask the browser not to evict our storage under pressure (best effort). */
function requestPersistence(): void {
  if (persistRequested) return
  persistRequested = true
  void navigator.storage?.persist?.().catch(() => {})
}

export function newScanId(): string {
  return crypto.randomUUID()
}

export async function saveScan(record: ScanRecord): Promise<void> {
  await (await db()).put('scans', record)
  requestPersistence()
  notify()
}

export async function getScan(id: string): Promise<ScanRecord | undefined> {
  return (await db()).get('scans', id)
}

/** All scans, newest first. */
export async function listScans(): Promise<ScanRecord[]> {
  const all = await (await db()).getAllFromIndex('scans', 'createdAt')
  return all.reverse()
}

export async function deleteScan(id: string): Promise<void> {
  await (await db()).delete('scans', id)
  notify()
}

export async function clearScans(): Promise<void> {
  await (await db()).clear('scans')
  notify()
}
