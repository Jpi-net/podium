export type SignatureEnv = { claudeConfigDir: string, home: string, userProfile: string }

export type SignatureFiles = {
  root: string, settings: string, state: string, lock: string, vocabulary: string, index: string, profile: string
  cases: string, archive: string, journal: string, history: string, exports: string
}

export class SignaturePaths {
  private static readonly SHARD_SIZE = 256
  private static readonly DRIVE = /^[A-Za-z]:$/

  static root(env: SignatureEnv): string {
    const config = SignaturePaths.text(env && env.claudeConfigDir)
    const home = SignaturePaths.text(env && env.home)
    const profile = SignaturePaths.text(env && env.userProfile)
    let base = ''
    if (config !== '') base = SignaturePaths.expand(config, home)
    else if (home !== '') base = home + '/.claude'
    else if (profile !== '') base = profile + '/.claude'
    if (!SignaturePaths.isAbsolute(base)) return ''
    return SignaturePaths.normalize(base + '/podium')
  }

  static isAbsolute(path: string): boolean {
    if (typeof path !== 'string') return false
    const unified = path.replace(/\\/g, '/')
    return unified.startsWith('/') || /^[A-Za-z]:\//.test(unified)
  }

  static files(root: string): SignatureFiles {
    const base = SignaturePaths.normalize(root)
    return {
      root: base,
      settings: base + '/settings.json',
      state: base + '/state.json',
      lock: base + '/lock.json',
      vocabulary: base + '/vocabulary.json',
      index: base + '/index.json',
      profile: base + '/profile.json',
      cases: base + '/cases',
      archive: base + '/archive',
      journal: base + '/journal',
      history: base + '/history',
      exports: base + '/exports'
    }
  }

  static shardOf(id: number): number {
    if (typeof id !== 'number' || !Number.isFinite(id) || id < 0) return 0
    return Math.floor(id / SignaturePaths.SHARD_SIZE)
  }

  static shardFile(dir: string, shard: number): string {
    const number = typeof shard === 'number' && Number.isFinite(shard) && shard >= 0 ? Math.floor(shard) : 0
    return `${dir}/${String(number).padStart(3, '0')}.jsonl`
  }

  static journalFile(root: string, at: number, session: string, part: number): string {
    const month = SignaturePaths.month(at)
    const index = typeof part === 'number' && Number.isFinite(part) && part > 0 ? Math.floor(part) : 0
    const suffix = index > 0 ? '.' + index : ''
    return `${root}/journal/${month}/${SignaturePaths.safe(session)}${suffix}.jsonl`
  }

  static historyFile(root: string, repoId: string): string {
    return `${root}/history/${SignaturePaths.safe(repoId)}.json`
  }

  static normalize(path: string): string {
    if (typeof path !== 'string') return ''
    const unified = path.replace(/\\/g, '/')
    const isAbsolute = unified.startsWith('/')
    const prefix = unified.startsWith('//') && !unified.startsWith('///') ? '//' : '/'
    const parts: string[] = []
    for (const part of unified.split('/')) {
      if (part === '' || part === '.') continue
      if (part === '..') {
        const last = parts[parts.length - 1]
        const isDriveOnly = parts.length === 1 && last !== undefined && SignaturePaths.DRIVE.test(last)
        if (isDriveOnly) continue
        if (last !== undefined && last !== '..') parts.pop()
        else if (!isAbsolute) parts.push('..')
        continue
      }
      parts.push(part)
    }
    const joined = parts.join('/')
    return isAbsolute ? prefix + joined : joined
  }

  static isInside(root: string, path: string): boolean {
    const base = SignaturePaths.normalize(root)
    const target = SignaturePaths.normalize(path)
    if (!SignaturePaths.isAbsolute(base) || target === '') return false
    if (base.split('/').includes('..') || target.split('/').includes('..')) return false
    if (target === base) return true
    const prefix = base.endsWith('/') ? base : base + '/'
    return target.startsWith(prefix)
  }

  private static expand(path: string, home: string): string {
    if (path === '~') return home
    if (path.startsWith('~/') || path.startsWith('~\\')) return home === '' ? path : home + '/' + path.slice(2)
    return path
  }

  private static text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
  }

  private static safe(value: string): string {
    const text = typeof value === 'string' ? value.replace(/[^A-Za-z0-9_-]/g, '_') : ''
    return text === '' ? 'session' : text
  }

  private static month(at: number): string {
    const time = typeof at === 'number' && Number.isFinite(at) ? at : 0
    const date = new Date(time)
    if (Number.isNaN(date.getTime())) return '1970-01'
    return date.toISOString().slice(0, 7)
  }
}
