export type ReflowAnnotationType = 'line' | 'wavy' | 'text'

export interface ReflowAnnotationRect {
  x: number,
  y: number,
  w: number,
  h: number,
}

export interface ReflowAnnotation {
  id: string,
  type: ReflowAnnotationType,
  sourcePageNumber: number,
  sourceRect: ReflowAnnotationRect,
  text?: string,
  color?: string,
  createdAt: string,
  updatedAt: string,
}

export function normalizeReflowAnnotationRect(rect: Partial<ReflowAnnotationRect>): ReflowAnnotationRect {
  const x = Number(rect.x) || 0
  const y = Number(rect.y) || 0
  const w = Number(rect.w) || 0
  const h = Number(rect.h) || 0
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    w: Math.max(0.001, Math.min(1, w)),
    h: Math.max(0.001, Math.min(1, h)),
  }
}

export function normalizeReflowAnnotations(value: unknown): ReflowAnnotation[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(raw => {
    if (!raw || typeof raw !== 'object') return []
    const sourcePageNumber = Math.round(Number((raw as any).sourcePageNumber))
    if (!Number.isFinite(sourcePageNumber) || sourcePageNumber < 1) return []
    const type = (raw as any).type
    if (type !== 'line' && type !== 'wavy' && type !== 'text') return []
    return [{
      id: String((raw as any).id || `${sourcePageNumber}-${Date.now()}-${Math.random()}`),
      type,
      sourcePageNumber,
      sourceRect: normalizeReflowAnnotationRect((raw as any).sourceRect || {}),
      text: type === 'text' ? String((raw as any).text || '') : undefined,
      color: String((raw as any).color || '#f59e0b'),
      createdAt: String((raw as any).createdAt || new Date().toISOString()),
      updatedAt: String((raw as any).updatedAt || new Date().toISOString()),
    } as ReflowAnnotation]
  })
}

export function reflowAnnotationStoreEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizeReflowAnnotations(a)) === JSON.stringify(normalizeReflowAnnotations(b))
}
