export class FormatVersion {
  static of(text: string): number {
    if (typeof text !== 'string') return 0
    try {
      const raw: unknown = JSON.parse(text)
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 0
      const version = (raw as Record<string, unknown>).version
      return typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : 0
    } catch {
      return 0
    }
  }

  static isNewer(text: string, known: number): boolean {
    return FormatVersion.of(text) > known
  }
}
