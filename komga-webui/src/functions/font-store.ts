import urls from '@/functions/urls'

const DB_NAME = 'komga-fonts'
const DB_VERSION = 1
const STORE_FAMILIES = 'families'

// woff2 is preferred: it is the smallest format, and every browser supporting IndexedDB supports it
const FORMAT_PREFERENCE = ['woff2', 'woff', 'truetype', 'opentype']

export interface FontFaceDto {
  file: string
  format: string
  weight: string
  style: string
}

export interface InstalledFontFile {
  name: string
  format: string
  weight: string
  style: string
  blob: Blob
}

export interface InstalledFontFamily {
  family: string
  installedAt: number
  bytes: number
  files: InstalledFontFile[]
}

export interface InstalledFontSummary {
  bytes: number
  installedAt: number
}

let dbPromise: Promise<IDBDatabase> | undefined

function openDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_FAMILIES)) db.createObjectStore(STORE_FAMILIES, {keyPath: 'family'})
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Font database is blocked by another tab'))
    })
  }
  return dbPromise
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function fontFamilyCssUrl(family: string): string {
  return new URL(`${urls.origin}api/v1/fonts/resource/${encodeURIComponent(family)}/css`).toString()
}

export function fontFamilyFileUrl(family: string, file: string): string {
  return new URL(`${urls.origin}api/v1/fonts/resource/${encodeURIComponent(family)}/${encodeURIComponent(file)}`).toString()
}

export function fontFamilyFacesUrl(family: string): string {
  return new URL(`${urls.origin}api/v1/fonts/resource/${encodeURIComponent(family)}/faces`).toString()
}

export function fontFamilyPreviewUrl(family: string): string {
  return new URL(`${urls.origin}api/v1/fonts/resource/${encodeURIComponent(family)}/preview`).toString()
}

export async function isFontStorageAvailable(): Promise<boolean> {
  try {
    return typeof indexedDB !== 'undefined' && (await openDatabase()) !== undefined
  } catch (e) {
    return false
  }
}

export async function listInstalledFontSummaries(): Promise<Record<string, InstalledFontSummary>> {
  const db = await openDatabase()
  const store = db.transaction(STORE_FAMILIES, 'readonly').objectStore(STORE_FAMILIES)
  const installed = await runRequest(store.getAll() as IDBRequest<InstalledFontFamily[]>)

  const summaries: Record<string, InstalledFontSummary> = {}
  installed.forEach(font => {
    summaries[font.family] = {bytes: font.bytes, installedAt: font.installedAt}
  })
  return summaries
}

export async function getInstalledFontFamily(family: string): Promise<InstalledFontFamily | undefined> {
  const db = await openDatabase()
  const store = db.transaction(STORE_FAMILIES, 'readonly').objectStore(STORE_FAMILIES)
  return runRequest(store.get(family) as IDBRequest<InstalledFontFamily | undefined>)
}

export async function removeFontFamily(family: string): Promise<void> {
  const db = await openDatabase()
  const store = db.transaction(STORE_FAMILIES, 'readwrite').objectStore(STORE_FAMILIES)
  await runRequest(store.delete(family) as IDBRequest<undefined>)
}

async function fetchFontFaces(family: string): Promise<FontFaceDto[]> {
  const response = await fetch(fontFamilyFacesUrl(family))
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

function selectPreferredFaces(faces: FontFaceDto[]): FontFaceDto[] {
  const groups = new Map<string, FontFaceDto>()
  faces.forEach(face => {
    const key = `${face.weight}/${face.style}`
    const current = groups.get(key)
    const rank = (value: FontFaceDto) => {
      const index = FORMAT_PREFERENCE.indexOf(value.format)
      return index === -1 ? FORMAT_PREFERENCE.length : index
    }
    if (!current || rank(face) < rank(current)) groups.set(key, face)
  })
  return Array.from(groups.values())
}

async function downloadBlob(url: string, onProgress?: (loadedBytes: number) => void): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  if (!response.body || !onProgress) {
    const blob = await response.blob()
    onProgress?.(blob.size)
    return blob
  }

  const reader = response.body.getReader()
  const chunks: BlobPart[] = []
  let loaded = 0
  for (;;) {
    const {done, value} = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      loaded += value.byteLength
      onProgress(loaded)
    }
  }
  const blob = new Blob(chunks, {type: response.headers.get('content-type') || 'font/woff2'})
  onProgress(blob.size)
  return blob
}

export async function installFontFamily(
  family: string,
  onProgress?: (loadedBytes: number) => void,
): Promise<InstalledFontFamily> {
  const faces = selectPreferredFaces(await fetchFontFaces(family))
  if (faces.length === 0) throw new Error('No font file found')

  const files: InstalledFontFile[] = []
  let bytes = 0
  for (const face of faces) {
    const blob = await downloadBlob(fontFamilyFileUrl(family, face.file), loaded => onProgress?.(bytes + loaded))
    bytes += blob.size
    files.push({
      name: face.file,
      format: face.format,
      weight: face.weight,
      style: face.style,
      blob,
    })
  }

  const installed: InstalledFontFamily = {family, installedAt: Date.now(), bytes, files}

  const db = await openDatabase()
  const store = db.transaction(STORE_FAMILIES, 'readwrite').objectStore(STORE_FAMILIES)
  await runRequest(store.put(installed) as IDBRequest<string>)

  return installed
}

/**
 * Builds a `@font-face` stylesheet pointing at the locally stored blobs.
 * The created object URLs are pushed to `objectUrls` so that the caller can revoke them later.
 */
export function buildInstalledFontCss(family: string, files: InstalledFontFile[], objectUrls: string[]): string {
  return files
    .map(file => {
      const url = URL.createObjectURL(file.blob)
      objectUrls.push(url)
      return `@font-face {\n  font-family: '${family}';\n  src: url('${url}') format('${file.format}');\n  font-weight: ${file.weight};\n  font-style: ${file.style};\n}`
    })
    .join('\n')
}

export function formatFontBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, exponent)
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`
}
