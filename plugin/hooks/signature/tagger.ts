import { Vocabulary, type VocabularyData } from './vocabulary'

export type Situation = { text: string, paths: readonly string[], stack: readonly string[] }

export class SituationTagger {
  private static readonly MAX_PATHS = 20
  private static readonly SEPARATORS = /[\s,;]+/
  private static readonly MAX_TEXT = 20000
  private static readonly MAX_TOKEN = 512
  private static readonly OPENERS = '"\'`([{<'
  private static readonly CLOSERS = '"\'`)]}>,;:!?.'
  private static readonly EXTENSION = /\.([a-z0-9]{1,6})$/
  private static readonly LETTER = /[a-z]/
  private static readonly ALNUM = /[A-Za-z0-9]/

  static paths(text: string): string[] {
    if (typeof text !== 'string') return []
    const out: string[] = []
    for (const raw of text.slice(0, SituationTagger.MAX_TEXT).split(SituationTagger.SEPARATORS)) {
      if (raw.length > SituationTagger.MAX_TOKEN) continue
      const token = SituationTagger.trim(raw)
      if (!SituationTagger.isPath(token) || out.includes(token)) continue
      out.push(token)
      if (out.length >= SituationTagger.MAX_PATHS) break
    }
    return out
  }

  static tag(vocabulary: VocabularyData, situation: Situation): string[] {
    try {
      const text = typeof situation.text === 'string' ? situation.text : ''
      const given = Array.isArray(situation.paths) ? situation.paths.slice(0, SituationTagger.MAX_PATHS) : []
      const paths = [...new Set([...SituationTagger.paths(text), ...given])]
      const stack = Array.isArray(situation.stack) ? situation.stack : []
      return [...new Set([...Vocabulary.fromText(vocabulary, text), ...Vocabulary.fromPaths(vocabulary, paths), ...Vocabulary.normalize(vocabulary, stack)])]
    } catch {
      return []
    }
  }

  private static trim(token: string): string {
    let start = 0
    let end = token.length
    while (start < end && SituationTagger.OPENERS.includes(token.charAt(start))) start += 1
    while (end > start && SituationTagger.CLOSERS.includes(token.charAt(end - 1))) end -= 1
    return token.slice(start, end)
  }

  private static isPath(token: string): boolean {
    if (token === '' || token.includes('://') || !SituationTagger.ALNUM.test(token)) return false
    if (token.includes('/')) return true
    const match = SituationTagger.EXTENSION.exec(token)
    return match !== null && SituationTagger.LETTER.test(match[1] ?? '')
  }
}
