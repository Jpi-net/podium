import type { FlowStatus, VerifStatus } from '../types'
import type { Rgb } from './canvas'

export type ModelFamily = 'opus' | 'sonnet' | 'haiku' | 'other'

export class Theme {
  static readonly BACKDROP = '#070a14'
  static readonly BG_TOP: Rgb = [7, 10, 20]
  static readonly BG_BOTTOM: Rgb = [15, 20, 38]
  static readonly ORCH: Rgb = [110, 255, 232]
  static readonly ACCENT: Rgb = [0, 187, 167]
  static readonly OPUS: Rgb = [181, 140, 255]
  static readonly SONNET: Rgb = [72, 196, 255]
  static readonly HAIKU: Rgb = [255, 186, 92]
  static readonly OTHER: Rgb = [160, 170, 190]
  static readonly OK: Rgb = [105, 240, 174]
  static readonly KO: Rgb = [255, 85, 115]
  static readonly WARN: Rgb = [255, 206, 110]
  static readonly TEXT: Rgb = [226, 232, 244]
  static readonly MUTED: Rgb = [128, 138, 164]
  static readonly FAINT: Rgb = [64, 72, 98]
  static readonly WHITE: Rgb = [255, 255, 255]

  private static readonly SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  private static readonly SPINNER_RATE = 0.8
  private static readonly BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

  static family(model: string): ModelFamily {
    const m = model.toLowerCase()
    if (m.includes('opus')) return 'opus'
    if (m.includes('sonnet')) return 'sonnet'
    if (m.includes('haiku')) return 'haiku'
    return 'other'
  }

  static modelColor(model: string): Rgb {
    switch (Theme.family(model)) {
      case 'opus':
        return Theme.OPUS
      case 'sonnet':
        return Theme.SONNET
      case 'haiku':
        return Theme.HAIKU
      default:
        return Theme.OTHER
    }
  }

  static modelLabel(model: string): string {
    const family = Theme.family(model)
    if (family === 'other') return model === '' ? '?' : model
    return family.charAt(0).toUpperCase() + family.slice(1)
  }

  static statusGlyph(status: FlowStatus, frame: number): string {
    switch (status) {
      case 'running':
        return Theme.spinner(frame)
      case 'completed':
        return '✓'
      case 'failed':
        return '✗'
      default:
        return '■'
    }
  }

  static statusColor(status: FlowStatus, accent: Rgb): Rgb {
    switch (status) {
      case 'running':
        return accent
      case 'completed':
        return Theme.OK
      case 'failed':
        return Theme.KO
      default:
        return Theme.MUTED
    }
  }

  static verifGlyph(status: VerifStatus): string {
    switch (status) {
      case 'running':
        return '◌'
      case 'ok':
        return '✓'
      case 'ko':
        return '✗'
      case 'stale':
        return '?'
      default:
        return '·'
    }
  }

  static verifColor(status: VerifStatus): Rgb {
    switch (status) {
      case 'running':
        return Theme.WARN
      case 'ok':
        return Theme.OK
      case 'ko':
        return Theme.KO
      case 'stale':
        return Theme.MUTED
      default:
        return Theme.FAINT
    }
  }

  static spinner(frame: number): string {
    return Theme.SPINNER[Math.abs(Math.floor(frame * Theme.SPINNER_RATE)) % Theme.SPINNER.length] ?? '·'
  }

  static sparkline(values: number[]): string {
    const max = Math.max(1, ...values)
    return values
      .map(v => (v <= 0 ? ' ' : (Theme.BLOCKS[Math.min(7, Math.floor((v / max) * 7.999))] ?? '▁')))
      .join('')
  }

  static duration(ms: number): string {
    const total = Math.max(0, Math.round(ms / 1000))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
    if (m > 0) return `${m}m${String(s).padStart(2, '0')}s`
    return `${s}s`
  }

  static tokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
    return String(n)
  }

  static clock(at: number): string {
    const d = new Date(at)
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map(v => String(v).padStart(2, '0')).join(':')
  }

  static truncate(value: string, width: number): string {
    if (width <= 0) return ''
    const chars = Array.from(value)
    if (chars.length <= width) return value
    if (width === 1) return '…'
    return chars.slice(0, width - 1).join('') + '…'
  }

  static pad(value: string, width: number): string {
    const t = Theme.truncate(value, width)
    return t + ' '.repeat(Math.max(0, width - Array.from(t).length))
  }

  static basename(path: string): string {
    const parts = path.split(/[\\/]/)
    return parts[parts.length - 1] ?? path
  }
}
