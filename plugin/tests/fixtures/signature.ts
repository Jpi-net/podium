import type { Case, ExtractedCase } from '../../hooks/signature/cases'
import type { RankQuery } from '../../hooks/signature/ranker'
import { TagIndex, type TagIndexData } from '../../hooks/signature/tag-index'
import type { MergeContext } from '../../hooks/signature/merger'
import { Vocabulary, type VocabularyData } from '../../hooks/signature/vocabulary'

export class SignatureFixtures {
  static readonly TODAY = '2026-11-05'
  static readonly NOW = Date.UTC(2026, 10, 5)
  static readonly DAY = 86400000

  static vocabulary(): VocabularyData {
    return Vocabulary.base()
  }

  static isClose(actual: number, expected: number, tolerance = 0.001): boolean {
    return Math.abs(actual - expected) <= tolerance
  }

  static isCloseRelative(actual: number, expected: number, tolerance = 1e-9): boolean {
    return Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected))
  }

  static caseOf(partial: Partial<Case> = {}): Case {
    return {
      id: 1,
      situation: 'Reading a user-editable config value in a hook',
      options: [],
      choice: 'Validate it and fall back to a default',
      why: 'To never crash on a bad value',
      tags: ['fail-open'],
      scope: 'global',
      project: 'podium',
      projectId: 'p1',
      projects: ['podium'],
      stack: 'node',
      kind: 'choice',
      confidence: 0.554,
      evidenceCount: 1,
      evidence: ['commit:podium:abc1234'],
      counterCount: 0,
      status: 'observed',
      isConfirmedByUser: false,
      firstSeen: SignatureFixtures.TODAY,
      lastSeen: SignatureFixtures.TODAY,
      statusAt: SignatureFixtures.TODAY,
      uses: 0,
      hits: 0,
      defaultCovered: false,
      extractor: 'test',
      vocabulary: 1,
      ...partial
    }
  }

  static extracted(partial: Partial<ExtractedCase> = {}): ExtractedCase {
    return {
      situation: 'Reading a user-editable config value in a hook',
      options: [],
      choice: 'Validate it and fall back to a default',
      why: 'To never crash on a bad value',
      tags: ['fail-open'],
      kind: 'choice',
      evidence: ['commit:podium:bbbbbbb'],
      ...partial
    }
  }

  static raw(partial: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      situation: 'Reading a user-editable config value in a hook',
      options: ['Validate', 'Trust'],
      choice: 'Validate it and fall back to a default',
      why: 'To never crash on a bad value',
      kind: 'choice',
      tags: ['fail-open'],
      evidence: ['commit:podium:abc1234'],
      ...partial
    }
  }

  static output(cases: unknown[], candidateTags: unknown[] = []): string {
    return JSON.stringify({ cases, candidateTags })
  }

  static query(partial: Partial<RankQuery> = {}): RankQuery {
    return { tags: [], stack: [], projectId: 'p1', now: SignatureFixtures.NOW, halfLifeMonths: 12, ...partial }
  }

  static context(partial: Partial<MergeContext> = {}): MergeContext {
    return {
      nextId: 100,
      today: SignatureFixtures.TODAY,
      project: 'podium',
      projectId: 'p1',
      stack: 'node',
      extractor: 'test',
      vocabularyRevision: 1,
      isProjectBatch: false,
      allowedEvidence: [],
      ...partial
    }
  }

  static rawIndex(n: number, df: Record<string, number>): TagIndexData {
    return { version: 1, n, df, postings: {}, meta: {} }
  }

  static foldAdd(cases: readonly Case[]): TagIndexData {
    let index = TagIndex.empty()
    for (const value of cases) index = TagIndex.add(index, value)
    return index
  }

  static snapshot(value: unknown): string {
    return JSON.stringify(value)
  }
}
