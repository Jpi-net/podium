export class Sanitizer {
  private static readonly MAX_TEXT = 20000
  private static readonly SPACES = /\s+/g
  private static readonly INVISIBLE = /[\p{Default_Ignorable_Code_Point}⠀]/gu
  private static readonly SPELLED = /(?<![a-z0-9])[a-z](?:[ \t][a-z]){2,}(?![a-z0-9])/g
  private static readonly JOINERS = /[-_]/g
  private static readonly BLANKS = /[ \t]/g
  private static readonly RUN = /[A-Za-z0-9+=]{40,}/g
  private static readonly INJECTION: readonly RegExp[] = [
    /ignor\w*\s(?:(?:all|any)\s)?(?:the\s)?(?:previous|prior|above|earlier)\s(?:instructions?|guidance|rules)/,
    /system-reminder|system prompt:|"command"\s*:|henceforth/,
    /before (?:any|every) (?:reply|answer|response)|pre[ -]?approved|maintenance mode|jailbreak/,
    /[\u2039\u203a]|\u00absystem/,
    /(?:treat|obey)s?\s.{0,80}as\s(?:\w+\s){0,2}orders/
  ]
  private static readonly SPACELESS = /ignor\w*(?:all|any)?(?:the)?(?:previous|prior|above|earlier)(?:instructions?|guidance|rules)/
  private static readonly APPLICATION: readonly RegExp[] = [
    /\$\(|[a-z]+:\/\/|javascript:|\]\(/,
    /\|.{0,3}(?:sh|bash|zsh|python|node|pwsh|powershell)\b|pipe[ds]?\s(?:in)?to\s(?:sh|bash|zsh)\b/,
    /~\/\.ssh|id_rsa|\.aws\/credentials|netrc|hosts\.yml/,
    /from now on|without asking|without confirmation|dot\s.{0,10}slash|(?:^|\s)-c\s.{0,40}(?:wget|curl)/
  ]
  private static readonly BROAD: readonly RegExp[] = [
    /[<>{}`]/,
    /www\.|^[#>]/,
    /\byou are\b|\bas an ai\b|assistant|system prompt|tool call|function call|disregard|mcp__|bash\(/
  ]

  static flat(text: string): string {
    if (typeof text !== 'string') return ''
    try {
      return text.slice(0, Sanitizer.MAX_TEXT).normalize('NFKC').replace(Sanitizer.INVISIBLE, '').replace(Sanitizer.SPACES, ' ').trim()
    } catch {
      return ''
    }
  }

  static isInjection(text: string): boolean {
    try {
      for (const plain of [Sanitizer.matchable(text, false), Sanitizer.matchable(text, true)]) {
        if (Sanitizer.INJECTION.some((pattern) => pattern.test(plain))) return true
        if (Sanitizer.SPACELESS.test(plain.replace(Sanitizer.SPACES, ''))) return true
      }
      return false
    } catch {
      return true
    }
  }

  static isQuotable(text: string): boolean {
    try {
      if (Sanitizer.isInjection(text)) return false
      const plain = Sanitizer.matchable(text, false)
      if (Sanitizer.APPLICATION.some((pattern) => pattern.test(plain)) || Sanitizer.BROAD.some((pattern) => pattern.test(plain))) return false
      return !Sanitizer.hasToken(Sanitizer.flat(text))
    } catch {
      return false
    }
  }

  private static hasToken(text: string): boolean {
    for (const run of text.matchAll(Sanitizer.RUN)) {
      if (/[0-9]/.test(run[0]) && /[a-z]/.test(run[0]) && /[A-Z]/.test(run[0])) return true
    }
    return false
  }

  private static matchable(text: string, isLoose: boolean): string {
    if (typeof text !== 'string') return ''
    const base = text.slice(0, Sanitizer.MAX_TEXT).normalize('NFKC').replace(Sanitizer.INVISIBLE, '').toLowerCase()
    return (isLoose ? base.replace(Sanitizer.JOINERS, ' ') : base).replace(Sanitizer.SPELLED, (run) => run.replace(Sanitizer.BLANKS, '')).replace(Sanitizer.SPACES, ' ').trim()
  }
}
