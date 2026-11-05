import type { Signal, SignalKind } from './signals'

export class Journal {
  static readonly MAX_BUFFER = 500
  static readonly FLUSH_AT = 20
  static readonly ROTATE_BYTES = 512 * 1024

  private static readonly KINDS: readonly string[] = ['prompt', 'question', 'plan', 'abort', 'agent', 'use']

  static push(buffer: readonly Signal[], signal: Signal): { buffer: Signal[], dropped: number } {
    const next = Array.isArray(buffer) ? [...buffer, signal] : [signal]
    const dropped = Math.max(0, next.length - Journal.MAX_BUFFER)
    return { buffer: dropped > 0 ? next.slice(dropped) : next, dropped }
  }

  static lines(signals: readonly Signal[]): string {
    if (!Array.isArray(signals)) return ''
    let out = ''
    for (const signal of signals) {
      try {
        const line = JSON.stringify(signal)
        if (typeof line === 'string') out += line + '\n'
      } catch {
        continue
      }
    }
    return out
  }

  static append(existing: string, signals: readonly Signal[]): string {
    const base = typeof existing === 'string' ? existing : ''
    const added = Journal.lines(signals)
    if (added === '') return base
    return (base !== '' && !base.endsWith('\n') ? base + '\n' : base) + added
  }

  static shouldRotate(existingBytes: number, addition: string): boolean {
    const known = typeof existingBytes === 'number' && Number.isFinite(existingBytes) && existingBytes > 0 ? existingBytes : 0
    return known + Journal.byteLength(typeof addition === 'string' ? addition : '') > Journal.ROTATE_BYTES
  }

  static byteLength(text: string): number {
    let total = 0
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index)
      if (code < 0x80) {
        total += 1
      } else if (code < 0x800) {
        total += 2
      } else if (code >= 0xD800 && code <= 0xDBFF && index + 1 < text.length && text.charCodeAt(index + 1) >= 0xDC00 && text.charCodeAt(index + 1) <= 0xDFFF) {
        total += 4
        index += 1
      } else {
        total += 3
      }
    }
    return total
  }

  static parse(text: string): Signal[] {
    if (typeof text !== 'string') return []
    const result: Signal[] = []
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (trimmed === '') continue
      let raw: unknown
      try {
        raw = JSON.parse(trimmed)
      } catch {
        continue
      }
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue
      const item = raw as Record<string, unknown>
      if (item.v !== 1 || typeof item.at !== 'number' || !Number.isFinite(item.at)) continue
      if (typeof item.kind !== 'string' || !Journal.KINDS.includes(item.kind)) continue
      const data = item.data
      result.push({
        v: 1,
        at: item.at,
        session: typeof item.session === 'string' ? item.session : '',
        project: typeof item.project === 'string' ? item.project : '',
        projectId: typeof item.projectId === 'string' ? item.projectId : '',
        stack: Array.isArray(item.stack) ? item.stack.filter((tag): tag is string => typeof tag === 'string') : [],
        kind: item.kind as SignalKind,
        data: typeof data === 'object' && data !== null && !Array.isArray(data) ? data as Record<string, unknown> : {}
      })
    }
    return result
  }
}
