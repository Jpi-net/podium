export class Redactor {
  private static readonly CONTROL = /[\u0000-\u0008\u000B-\u001F\u2800\p{Cf}\p{Default_Ignorable_Code_Point}]/gu
  private static readonly KEY_BEGIN = /-----BEGIN [A-Z ]{0,40}PRIVATE KEY(?: BLOCK)?-----/g
  private static readonly KEY_END = /-----END [A-Z ]{0,40}PRIVATE KEY(?: BLOCK)?-----/g
  private static readonly TOKEN = new RegExp(
    '(?<![A-Za-z0-9])(?:'
    + 'sk-ant-[A-Za-z0-9_-]{10,}'
    + '|sk-[A-Za-z0-9_-]{20,}'
    + '|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}'
    + '|whsec_[A-Za-z0-9]{24,}'
    + '|hf_[A-Za-z0-9]{30,}'
    + '|gh[pousr]_[A-Za-z0-9]{16,}'
    + '|ya29\\.[A-Za-z0-9_-]{20,}'
    + '|github_pat_[A-Za-z0-9_]{20,}'
    + '|glpat-[A-Za-z0-9_-]{16,}'
    + '|xox[abpr]-[A-Za-z0-9-]{10,}'
    + '|AKIA[0-9A-Z]{16}'
    + '|AIza[0-9A-Za-z_-]{35}'
    + '|npm_[A-Za-z0-9]{20,}'
    + ')',
    'g'
  )
  private static readonly BEARER = /\b([Bb]earer|[Bb]asic)[ \t]{1,16}([A-Za-z0-9._~+/=-]{8,})/g
  private static readonly JWT = /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{1,4096}\.[A-Za-z0-9_-]{1,4096}\.[A-Za-z0-9_-]{0,4096}/g
  private static readonly ASSIGNMENT = new RegExp(
    '((?:password|(?<![a-z])pass|passwd|pwd|secret|token|passphrase|api[_-]?key|private[_-]?key|access[_-]?key|client[_-]?secret|authorization|auth|credential)'
    + '(?:[_-]?(?:key|value|id|token|secret|hash|string|data))?["\']?[ \\t]{0,16}(?:=>|:=|:|=)[ \\t]{0,16})'
    + '([Bb]asic[ \\t]{1,16}\\S{1,512}|[Bb]earer[ \\t]{1,16}\\S{1,512}|"(?:[^"\\\\\\n]|\\\\.){0,1024}"|\'(?:[^\'\\\\\\n]|\\\\.){0,1024}\'|[^\\n]{1,256})',
    'gi'
  )
  private static readonly SCHEME = /^(basic|bearer)[ \t]/i
  private static readonly FLAG = /(--(?:password|passwd|token|secret|api-key|apikey)[ =])[ \t]{0,8}\S{1,512}/gi
  private static readonly MYSQL = /(\bmysql(?:dump|admin)?\b[^\n]{0,120}?[ \t]-p)(?=\S)\S{1,256}/g
  private static readonly CURL = /(\bcurl\b[^\n]{0,120}?[ \t](?:-u|--user)[ \t]{1,8}[^\s:]{1,128}:)\S{1,256}/g
  private static readonly PASSIN = /(-pass(?:in|out)[ \t]{1,8}pass:)\S{1,256}/g
  private static readonly URL_CREDENTIALS = /:\/\/[^\s/:@]{0,128}:[^\s/]{1,256}@/g
  private static readonly QUERY = /([?&](?:token|key|sig|signature|secret|password|code)=)[^&\s]{1,512}/gi
  private static readonly EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.){1,8}[A-Za-z]{2,24}(?![A-Za-z0-9-])/g
  private static readonly HEX = /(?<![A-Za-z0-9])[0-9a-f]{32,}(?![A-Za-z0-9])/g
  private static readonly BLOB = /(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/=_-]{40,}/g
  private static readonly PROSE = /^[A-Z]?[a-z]+$/
  private static readonly SPACE = /\s/
  private static readonly WORD = /^[A-Z]?[a-z]{2,20}\d{0,2}$/
  private static readonly SPECIAL = /[.*+?^${}()|[\]\\]/g
  private static readonly MAX_HOME = 512
  private static readonly SLACK = 4096
  private static readonly MAX_DROP = 512

  static redact(text: string, home: string): string {
    if (typeof text !== 'string') return ''
    let out = text.normalize('NFKC').replace(Redactor.CONTROL, '')
    out = Redactor.keys(out)
    out = out.replace(Redactor.TOKEN, '<token>')
    out = out.replace(Redactor.JWT, '<token>')
    out = out.replace(Redactor.FLAG, '$1<secret>')
    out = out.replace(Redactor.MYSQL, '$1<secret>')
    out = out.replace(Redactor.CURL, '$1<secret>')
    out = out.replace(Redactor.PASSIN, '$1<secret>')
    out = out.replace(Redactor.ASSIGNMENT, (match, head: string, value: string) => {
      const scheme = Redactor.SCHEME.exec(value)
      return head + (scheme === null ? '<secret>' : (scheme[1] ?? '') + ' <token>')
    })
    out = out.replace(Redactor.BEARER, (match, kind: string, token: string) => {
      const isProse = kind.toLowerCase() === 'basic' && Redactor.PROSE.test(token)
      return isProse ? match : kind + ' <token>'
    })
    out = out.replace(Redactor.URL_CREDENTIALS, '://<credentials>@')
    out = out.replace(Redactor.QUERY, '$1<secret>')
    out = out.replace(Redactor.EMAIL, '<email>')
    out = Redactor.hide(out, home)
    out = out.replace(Redactor.HEX, '<blob>')
    return out.replace(Redactor.BLOB, (run) => Redactor.isWordy(run) ? run : '<blob>')
  }

  static truncate(text: string, max: number): string {
    if (typeof text !== 'string') return ''
    if (typeof max !== 'number' || Number.isNaN(max)) return text
    if (text.length <= max) return text
    if (max < 1) return ''
    let cut = Math.floor(max) - 1
    if (cut > 0) {
      const code = text.charCodeAt(cut - 1)
      if (code >= 0xD800 && code <= 0xDBFF) cut -= 1
    }
    return text.slice(0, Math.max(0, cut)) + '…'
  }

  static clean(text: string, max: number, home: string): string {
    if (typeof text !== 'string') return ''
    const isBounded = typeof max === 'number' && Number.isFinite(max) && max > 0
    const limit = isBounded ? Math.floor(max) * 4 + Redactor.SLACK : text.length
    const head = text.length > limit ? Redactor.dropRun(text.slice(0, limit)) : text
    return Redactor.truncate(Redactor.redact(head, home), max)
  }

  private static dropRun(text: string): string {
    let cut = text.length
    const floor = Math.max(0, text.length - Redactor.MAX_DROP)
    while (cut > floor && !Redactor.SPACE.test(text.charAt(cut - 1))) cut -= 1
    return text.slice(0, cut)
  }

  private static keys(text: string): string {
    let out = ''
    let from = 0
    for (;;) {
      Redactor.KEY_BEGIN.lastIndex = from
      const start = Redactor.KEY_BEGIN.exec(text)
      if (start === null) break
      out += text.slice(from, start.index) + '<private-key>'
      Redactor.KEY_END.lastIndex = start.index + start[0].length
      const end = Redactor.KEY_END.exec(text)
      if (end === null) return out
      from = end.index + end[0].length
    }
    return out + text.slice(from)
  }

  private static hide(text: string, home: string): string {
    if (typeof home !== 'string') return text
    const base = home.normalize('NFKC').replace(/[\\/]+$/, '')
    if (base.length < 2 || base.length > Redactor.MAX_HOME) return text
    const variants = new Set([base, base.replace(/\\/g, '/'), base.replace(/\//g, '\\')])
    let out = text
    for (const variant of variants) {
      const escaped = variant.replace(Redactor.SPECIAL, '\\$&')
      out = out.replace(new RegExp(escaped + '(?![A-Za-z0-9_-])', 'g'), '~')
    }
    return out
  }

  private static isWordy(run: string): boolean {
    if (!run.includes('/') && !run.includes('-')) return false
    return run.split(/[/_-]/).every((part) => part === '' || Redactor.WORD.test(part))
  }
}
