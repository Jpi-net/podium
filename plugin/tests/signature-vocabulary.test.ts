import { expect, test } from 'claude-code/testing'
import { Vocabulary, type Facet, type VocabularyData, type VocabularyOverlay } from '../hooks/signature/vocabulary'

class VocabularyFixture {
  static crowded(): VocabularyOverlay {
    const tags: Record<string, unknown> = {}
    for (let i = 0; i < 50; i += 1) {
      tags[`t${i}`] = { facet: 'artifact', aliases: [`alias ${i}`], paths: Array.from({ length: 8 }, (_, j) => `^dir${i}x${j}/`) }
    }
    return Vocabulary.parseOverlay(JSON.stringify({ revision: 1, tags }))
  }

  static data(tags: VocabularyData['tags'], revision = 1): VocabularyData {
    return { revision, tags }
  }

  static lens(parent = '', aliases: readonly string[] = []): VocabularyData['tags'][string] {
    return { facet: 'lens', parent, aliases, paths: [] }
  }

  static def(facet: Facet, parent = ''): VocabularyData['tags'][string] {
    return { facet, parent, aliases: [], paths: [] }
  }

  static kept(source: string): boolean {
    const overlay = Vocabulary.parseOverlay(JSON.stringify({ tags: { a: { facet: 'artifact', paths: [source] } } }))
    return (overlay.tags.a?.paths.length ?? 0) > 0
  }

  static attempt(run: () => void): void {
    try {
      run()
    } catch {
      return
    }
  }

  static overlay(): VocabularyOverlay {
    return {
      revision: 7,
      tags: { 'rate-limit': { facet: 'concept', parent: 'security', aliases: ['throttling'], paths: ['limit'] } },
      candidates: { 'new-idea': 3 }
    }
  }
}

test('base has at least one tag in every facet', () => {
  // Arrange
  const tags = Object.values(Vocabulary.base().tags)

  // Assert
  expect(Vocabulary.FACETS.filter((facet) => !tags.some((tag) => tag.facet === facet))).toEqual([])
})

test('base tag names are all valid names', () => {
  // Assert
  expect(Object.keys(Vocabulary.base().tags).filter((name) => !Vocabulary.isName(name))).toEqual([])
})

test('base parents are empty or known tags', () => {
  // Arrange
  const base = Vocabulary.base()

  // Act
  const unknown = Object.keys(base.tags).filter((name) => {
    const parent = base.tags[name]?.parent ?? ''
    return parent !== '' && !Vocabulary.has(base, parent)
  })

  // Assert
  expect(unknown).toEqual([])
})

test('base path patterns all compile', () => {
  // Arrange
  const base = Vocabulary.base()

  // Act
  const broken = Object.keys(base.tags).filter((name) => (base.tags[name]?.paths ?? []).some((source) => {
    try {
      new RegExp(source)
      return false
    } catch {
      return true
    }
  }))

  // Assert
  expect(broken).toEqual([])
})

test('base returns the same vocabulary on every call', () => {
  // Assert
  expect(Vocabulary.base()).toBe(Vocabulary.base())
})

test('base starts at revision 1', () => {
  // Assert
  expect(Vocabulary.base().revision).toBe(1)
})

test('has knows a tag and rejects an unknown one and an inherited property name', () => {
  // Arrange
  const base = Vocabulary.base()

  // Assert
  expect([Vocabulary.has(base, 'security'), Vocabulary.has(base, 'zzz'), Vocabulary.has(base, 'constructor')]).toEqual([true, false, false])
})

test('facetOf gives the facet of a tag and nothing for an unknown tag', () => {
  // Arrange
  const base = Vocabulary.base()

  // Assert
  expect([Vocabulary.facetOf(base, 'security'), Vocabulary.facetOf(base, 'typescript'), Vocabulary.facetOf(base, 'zzz')]).toEqual(['lens', 'stack', undefined])
})

test('isName accepts kebab case names and rejects the rest', () => {
  // Assert
  expect([Vocabulary.isName('fail-open'), Vocabulary.isName('Fail'), Vocabulary.isName('a b'), Vocabulary.isName(''), Vocabulary.isName('-a')]).toEqual([true, false, false, false, false])
})

test('fold removes accents and lowercases', () => {
  // Assert
  expect(Vocabulary.fold('Sécurité Ça ÉTÉ')).toBe('securite ca ete')
})

test('normalize maps names and aliases to tags, dedupes and keeps the order', () => {
  // Act
  const tags = Vocabulary.normalize(Vocabulary.base(), ['Sécurité', 'fail open', 'zzz'])

  // Assert
  expect(tags).toEqual(['security', 'fail-open'])
})

test('normalize dedupes a tag reached by its name and by an alias', () => {
  // Act
  const tags = Vocabulary.normalize(Vocabulary.base(), ['security', 'sécurité', 'Security'])

  // Assert
  expect(tags).toEqual(['security'])
})

test('normalize keeps the order of the input', () => {
  // Act
  const tags = Vocabulary.normalize(Vocabulary.base(), ['fail open', 'security'])

  // Assert
  expect(tags).toEqual(['fail-open', 'security'])
})

test('normalize resolves aliases of several facets', () => {
  // Act
  const tags = Vocabulary.normalize(Vocabulary.base(), ['golang', 'tdd', 'threat model'])

  // Assert
  expect(tags).toEqual(['go', 'test-first', 'security'])
})

test('normalize ignores entries that are not strings', () => {
  // Assert
  expect(Vocabulary.normalize(Vocabulary.base(), [5, null, 'security'] as never)).toEqual(['security'])
})

test('normalize of something that is not an array is empty', () => {
  // Assert
  expect(Vocabulary.normalize(Vocabulary.base(), 'security' as never)).toEqual([])
})

test('ancestors lists the parents from the nearest to the farthest', () => {
  // Arrange
  const vocabulary = Vocabulary.merge(Vocabulary.base(), VocabularyFixture.data({ 'deep-leaf': VocabularyFixture.def('concept', 'untrusted-input') }))

  // Assert
  expect(Vocabulary.ancestors(vocabulary, 'deep-leaf')).toEqual(['untrusted-input', 'security'])
})

test('ancestors excludes the tag itself', () => {
  // Assert
  expect(Vocabulary.ancestors(Vocabulary.base(), 'untrusted-input')).toEqual(['security'])
})

test('ancestors of a root tag is empty', () => {
  // Assert
  expect(Vocabulary.ancestors(Vocabulary.base(), 'security')).toEqual([])
})

test('ancestors of an unknown tag is empty', () => {
  // Assert
  expect(Vocabulary.ancestors(Vocabulary.base(), 'zzz')).toEqual([])
})

test('ancestors stops on a cycle created by an overlay', () => {
  // Arrange
  const overlay = VocabularyFixture.data({ security: VocabularyFixture.def('lens', 'untrusted-input') })
  const vocabulary = Vocabulary.merge(Vocabulary.base(), overlay)

  // Assert
  expect(Vocabulary.ancestors(vocabulary, 'untrusted-input')).toEqual(['security'])
})

test('ancestors stops at a parent that is not in the vocabulary', () => {
  // Arrange
  const vocabulary = VocabularyFixture.data({ a: VocabularyFixture.lens('missing') })

  // Assert
  expect(Vocabulary.ancestors(vocabulary, 'a')).toEqual([])
})

test('fromText finds a French alias', () => {
  // Assert
  expect(Vocabulary.fromText(Vocabulary.base(), 'valider les entrées')).toEqual(['untrusted-input'])
})

test('fromText finds a tag by its own name', () => {
  // Assert
  expect(Vocabulary.fromText(Vocabulary.base(), 'think about security')).toEqual(['security'])
})

test('fromText does not match a term inside a longer word', () => {
  // Assert
  expect(Vocabulary.fromText(Vocabulary.base(), 'attest the contest')).toEqual([])
})

test('fromText does not read pass inside password', () => {
  // Act
  const tags = Vocabulary.fromText(Vocabulary.base(), 'the password is stored')

  // Assert
  expect(tags).toEqual(['secret-handling'])
})

test('fromText prefers the longest term', () => {
  // Assert
  expect(Vocabulary.fromText(Vocabulary.base(), 'beware of sql injection')).toEqual(['injection'])
})

test('fromText orders tags by their position in the text', () => {
  // Assert
  expect(Vocabulary.fromText(Vocabulary.base(), 'use fail open before security')).toEqual(['fail-open', 'security'])
  expect(Vocabulary.fromText(Vocabulary.base(), 'security before fail open')).toEqual(['security', 'fail-open'])
})

test('fromText lists a repeated tag once', () => {
  // Assert
  expect(Vocabulary.fromText(Vocabulary.base(), 'security and more security')).toEqual(['security'])
})

test('fromText returns at most 12 tags', () => {
  // Arrange
  const names = ['security', 'architecture', 'testing', 'performance', 'robustness', 'dx', 'git', 'docs', 'product', 'ux', 'data', 'operations', 'accessibility', 'cost']

  // Act
  const tags = Vocabulary.fromText(Vocabulary.base(), names.join(' ; '))

  // Assert
  expect(tags).toEqual(names.slice(0, 12))
})

test('fromText ignores bare go in prose', () => {
  // Assert
  expect(Vocabulary.fromText(Vocabulary.base(), 'let us go to lunch')).toEqual([])
})

test('fromText ignores bare plan in prose', () => {
  // Assert
  expect(Vocabulary.fromText(Vocabulary.base(), 'here is the plan')).toEqual([])
})

test('fromText ignores bare review in prose', () => {
  // Assert
  expect(Vocabulary.fromText(Vocabulary.base(), 'please review it')).toEqual([])
})

test('fromText ignores bare build in prose', () => {
  // Assert
  expect(Vocabulary.fromText(Vocabulary.base(), 'we build it and then compile and bundle')).toEqual([])
})

test('fromText finds the build tag through a build script alias', () => {
  // Assert
  expect(Vocabulary.fromText(Vocabulary.base(), 'edit the build script')).toEqual(['build'])
})

test('fromText ignores bare names of the stack and phase facets together', () => {
  // Assert
  expect(Vocabulary.fromText(Vocabulary.base(), 'go plan review debug setup release')).toEqual([])
})

test('fromText still finds a stack tag through its alias', () => {
  // Assert
  expect(Vocabulary.fromText(Vocabulary.base(), 'rewrite it in golang')).toEqual(['go'])
})

test('fromText still finds a phase tag through its alias', () => {
  // Assert
  expect(Vocabulary.fromText(Vocabulary.base(), 'we were in plan mode')).toEqual(['plan'])
})

test('fromText of something that is not a string is empty', () => {
  // Assert
  expect(Vocabulary.fromText(Vocabulary.base(), undefined as never)).toEqual([])
})

test('fromPaths tags a hook file by its directory and extension', () => {
  // Act
  const tags = Vocabulary.fromPaths(Vocabulary.base(), ['plugin/hooks/register.tsx'])

  // Assert
  expect(tags).toContain('hook')
  expect(tags).toContain('typescript')
})

test('fromPaths tags a test file', () => {
  // Assert
  expect(Vocabulary.fromPaths(Vocabulary.base(), ['plugin/tests/office.test.ts'])).toContain('test-file')
})

test('fromPaths tags dependency manifests', () => {
  // Arrange
  const manifests = ['package.json', 'sub/Cargo.toml', 'go.mod', 'requirements.txt', 'pyproject.toml', 'src/App.csproj', 'Gemfile', 'composer.json']

  // Act
  const missing = manifests.filter((path) => !Vocabulary.fromPaths(Vocabulary.base(), [path]).includes('dependency'))

  // Assert
  expect(missing).toEqual([])
})

test('fromPaths accepts Windows separators', () => {
  // Assert
  expect(Vocabulary.fromPaths(Vocabulary.base(), ['src\\hooks\\a.ts'])).toContain('hook')
})

test('fromPaths tags a typescript extension', () => {
  // Assert
  expect(Vocabulary.fromPaths(Vocabulary.base(), ['src/a.ts'])).toContain('typescript')
})

test('fromPaths does not tag a plain ts file as react', () => {
  // Assert
  expect(Vocabulary.fromPaths(Vocabulary.base(), ['src/a.ts'])).not.toContain('react')
})

test('fromPaths lists each tag once across several paths', () => {
  // Act
  const tags = Vocabulary.fromPaths(Vocabulary.base(), ['a.ts', 'b.ts'])

  // Assert
  expect(tags.filter((tag) => tag === 'typescript')).toEqual(['typescript'])
})

test('fromPaths gives nothing for a path no pattern knows', () => {
  // Assert
  expect(Vocabulary.fromPaths(Vocabulary.base(), ['notes.txt'])).toEqual([])
})

test('parseOverlay drops a tag with an invalid name', () => {
  // Act
  const overlay = Vocabulary.parseOverlay(JSON.stringify({ revision: 1, tags: { 'Bad Name': { facet: 'concept' }, ok: { facet: 'concept' } } }))

  // Assert
  expect(Object.keys(overlay.tags)).toEqual(['ok'])
})

test('parseOverlay drops a tag with an invalid facet', () => {
  // Act
  const overlay = Vocabulary.parseOverlay(JSON.stringify({ tags: { a: { facet: 'nope' }, b: { facet: 5 }, c: 'x' } }))

  // Assert
  expect(overlay.tags).toEqual({})
})

test('parseOverlay drops an invalid regex and keeps the valid ones', () => {
  // Act
  const overlay = Vocabulary.parseOverlay(JSON.stringify({ tags: { a: { facet: 'artifact', paths: ['(', '\\.zig$'] } } }))

  // Assert
  expect(overlay.tags.a?.paths).toEqual(['\\.zig$'])
})

test('parseOverlay lowercases and dedupes aliases', () => {
  // Act
  const overlay = Vocabulary.parseOverlay(JSON.stringify({ tags: { a: { facet: 'concept', aliases: ['Foo', 'foo', ' ', 5] } } }))

  // Assert
  expect(overlay.tags.a?.aliases).toEqual(['foo'])
})

test('parseOverlay blanks an invalid parent', () => {
  // Act
  const overlay = Vocabulary.parseOverlay(JSON.stringify({ tags: { a: { facet: 'concept', parent: 'Not Valid' } } }))

  // Assert
  expect(overlay.tags.a?.parent).toBe('')
})

test('parseOverlay keeps the revision and the candidates', () => {
  // Act
  const overlay = Vocabulary.parseOverlay(JSON.stringify({ revision: 4, candidates: { 'new-idea': 3, 'Bad Name': 1, neg: -1, text: 'x' } }))

  // Assert
  expect(overlay.revision).toBe(4)
  expect(overlay.candidates).toEqual({ 'new-idea': 3 })
})

test('parseOverlay of garbage is an empty overlay', () => {
  // Assert
  expect(Vocabulary.parseOverlay('not json')).toEqual({ revision: 0, tags: {}, candidates: {} })
})

test('parseOverlay of an array is an empty overlay', () => {
  // Assert
  expect(Vocabulary.parseOverlay('[]')).toEqual({ revision: 0, tags: {}, candidates: {} })
})

test('serializeOverlay then parseOverlay gives back the same overlay', () => {
  // Arrange
  const overlay = VocabularyFixture.overlay()

  // Act
  const again = Vocabulary.parseOverlay(Vocabulary.serializeOverlay(overlay))

  // Assert
  expect(again).toEqual(overlay)
})

test('serializeOverlay ends with a newline', () => {
  // Assert
  expect(Vocabulary.serializeOverlay(VocabularyFixture.overlay()).endsWith('\n')).toBe(true)
})

test('merge adds the tags of the overlay', () => {
  // Act
  const merged = Vocabulary.merge(Vocabulary.base(), VocabularyFixture.overlay())

  // Assert
  expect(Vocabulary.has(merged, 'rate-limit')).toBe(true)
  expect(Vocabulary.has(merged, 'security')).toBe(true)
})

test('merge lets the overlay override a base tag', () => {
  // Arrange
  const overlay = VocabularyFixture.data({ security: VocabularyFixture.lens('', ['safety']) })

  // Act
  const merged = Vocabulary.merge(Vocabulary.base(), overlay)

  // Assert
  expect(merged.tags.security?.aliases).toEqual(['safety'])
})

test('merge takes the revision of the overlay', () => {
  // Assert
  expect(Vocabulary.merge(Vocabulary.base(), VocabularyFixture.overlay()).revision).toBe(7)
})

test('merge leaves the base untouched', () => {
  // Act
  Vocabulary.merge(Vocabulary.base(), VocabularyFixture.overlay())

  // Assert
  expect(Vocabulary.has(Vocabulary.base(), 'rate-limit')).toBe(false)
})

test('describe gives one sorted line per non-empty facet with the parent in brackets', () => {
  // Arrange
  const vocabulary = VocabularyFixture.data({
    b: VocabularyFixture.def('lens'),
    a: VocabularyFixture.def('lens'),
    c: VocabularyFixture.def('concept', 'a'),
    d: VocabularyFixture.def('decision')
  })

  // Act
  const text = Vocabulary.describe(vocabulary)

  // Assert
  expect(text).toBe('lens: a, b\nconcept: c (a)\ndecision: d')
})

test('describe of the base vocabulary has a line for each of the six facets', () => {
  // Act
  const lines = Vocabulary.describe(Vocabulary.base()).split('\n')

  // Assert
  expect(lines.map((line) => line.split(':')[0])).toEqual([...Vocabulary.FACETS])
})

test('parseOverlay drops a path pattern that can backtrack catastrophically', () => {
  // Act
  const overlay = Vocabulary.parseOverlay(JSON.stringify({ tags: { a: { facet: 'artifact', paths: ['^(a+)+$', '\\.zig$'] } } }))

  // Assert
  expect(overlay.tags.a?.paths).toEqual(['\\.zig$'])
})

test('parseOverlay drops a path pattern with a backreference', () => {
  // Act
  const overlay = Vocabulary.parseOverlay(JSON.stringify({ tags: { a: { facet: 'artifact', paths: ['(a)\\1', 'ok'] } } }))

  // Assert
  expect(overlay.tags.a?.paths).toEqual(['ok'])
})

test('fromPaths stays fast on a path of 10000 characters', () => {
  // Arrange
  const path = 'dir/'.repeat(2500)
  const start = Date.now()

  // Act
  const tags = Vocabulary.fromPaths(Vocabulary.base(), [path])

  // Assert
  expect(Date.now() - start).toBeLessThan(200)
  expect(Array.isArray(tags)).toBe(true)
})

test('base tags cannot be changed by a caller', () => {
  // Arrange
  const tag = Vocabulary.base().tags.security as { parent: string }

  // Act
  VocabularyFixture.attempt(() => {
    tag.parent = 'hacked'
  })

  // Assert
  expect(Vocabulary.base().tags.security?.parent).toBe('')
})

test('base cannot gain a tag from a caller', () => {
  // Arrange
  const tags = Vocabulary.base().tags as Record<string, never>

  // Act
  VocabularyFixture.attempt(() => {
    tags.injected = VocabularyFixture.lens() as never
  })

  // Assert
  expect(Vocabulary.has(Vocabulary.base(), 'injected')).toBe(false)
})

test('fromText ignores single words of a decision tag and keeps its phrase', () => {
  // Assert
  expect(Vocabulary.fromText(Vocabulary.base(), 'complete the local work later, keep it simple')).toEqual(['simple-vs-complete'])
})

test('parseOverlay drops every path pattern outside the safe subset', () => {
  // Arrange
  const unsafe = ['((a+))+$', '(a+|b)+$', '(a|a)*$', 'a*a*a*a*a*a*a*a*b', '.*a.*b', 'a?a?a?a?b']

  // Act
  const kept = unsafe.filter((source) => Vocabulary.parseOverlay(JSON.stringify({ tags: { a: { facet: 'artifact', paths: [source] } } })).tags.a?.paths.length !== 0)

  // Assert
  expect(kept).toEqual([])
})

test('parseOverlay keeps a safe path pattern and it matches', () => {
  // Arrange
  const overlay = Vocabulary.parseOverlay(JSON.stringify({ tags: { infra: { facet: 'artifact', paths: ['(^|/)infra/', '\\.(tf|tfvars)$'] } } }))
  const vocabulary = Vocabulary.merge(Vocabulary.base(), overlay)

  // Assert
  expect(overlay.tags.infra?.paths).toEqual(['(^|/)infra/', '\\.(tf|tfvars)$'])
  expect(Vocabulary.fromPaths(vocabulary, ['deploy/infra/x.txt'])).toContain('infra')
  expect(Vocabulary.fromPaths(vocabulary, ['main.tfvars'])).toContain('infra')
})

test('every base path pattern survives a serialize and parse round trip', () => {
  // Arrange
  const base = Vocabulary.base()
  const overlay: VocabularyOverlay = { revision: 1, tags: base.tags, candidates: {} }

  // Act
  const again = Vocabulary.parseOverlay(Vocabulary.serializeOverlay(overlay))

  // Assert
  expect(Object.keys(base.tags).filter((name) => JSON.stringify(again.tags[name]?.paths) !== JSON.stringify(base.tags[name]?.paths))).toEqual([])
})

test('fromPaths still tags a workflow file as ci', () => {
  // Assert
  expect(Vocabulary.fromPaths(Vocabulary.base(), ['.github/workflows/ci.yml'])).toContain('ci')
})

test('fromPaths still tags package.json as a dependency', () => {
  // Assert
  expect(Vocabulary.fromPaths(Vocabulary.base(), ['package.json'])).toContain('dependency')
})

test('fromPaths still tags an mjs file as javascript', () => {
  // Assert
  expect(Vocabulary.fromPaths(Vocabulary.base(), ['src/a.mjs'])).toContain('javascript')
})

test('fromPaths still tags a migration as a db schema', () => {
  // Assert
  expect(Vocabulary.fromPaths(Vocabulary.base(), ['migrations/001.sql'])).toContain('db-schema')
})

test('parseOverlay drops a pattern with two alternation groups', () => {
  // Assert
  expect(VocabularyFixture.kept('(a|b)(c|d)')).toBe(false)
})

test('parseOverlay drops a pattern with three optional characters', () => {
  // Assert
  expect(VocabularyFixture.kept('a?a?a?b')).toBe(false)
})

test('parseOverlay drops an alternation with a duplicate alternative', () => {
  // Assert
  expect(VocabularyFixture.kept('(a|b|a)')).toBe(false)
})

test('parseOverlay drops a pattern with two wildcards', () => {
  // Assert
  expect(VocabularyFixture.kept('.*a.*b')).toBe(false)
})

test('parseOverlay keeps two optionals, a wildcard and one alternation together', () => {
  // Assert
  expect(VocabularyFixture.kept('a?a?.*(x|y)b')).toBe(true)
})

test('parseOverlay keeps at most 200 tags', () => {
  // Arrange
  const tags: Record<string, unknown> = {}
  for (let index = 0; index < 250; index += 1) tags[`tag-${index}`] = { facet: 'concept' }

  // Act
  const overlay = Vocabulary.parseOverlay(JSON.stringify({ tags }))

  // Assert
  expect(Object.keys(overlay.tags).length).toBe(200)
})

test('parseOverlay keeps at most 8 path patterns per tag', () => {
  // Arrange
  const paths = Array.from({ length: 12 }, (_, index) => `p${index}x`)

  // Act
  const overlay = Vocabulary.parseOverlay(JSON.stringify({ tags: { a: { facet: 'artifact', paths } } }))

  // Assert
  expect(overlay.tags.a?.paths).toEqual(paths.slice(0, 8))
})

test('the heaviest allowed pattern runs fast on a 512 character path', () => {
  // Arrange
  const overlay = Vocabulary.parseOverlay(JSON.stringify({ tags: { a: { facet: 'artifact', paths: ['a?a?.*(x|y)b'] } } }))
  const vocabulary = Vocabulary.merge(Vocabulary.base(), overlay)
  const start = Date.now()

  // Act
  Vocabulary.fromPaths(vocabulary, ['a'.repeat(512)])

  // Assert
  expect(Date.now() - start).toBeLessThan(50)
})

test('fromPaths still tags a Dockerfile as docker', () => {
  // Assert
  expect(Vocabulary.fromPaths(Vocabulary.base(), ['Dockerfile'])).toContain('docker')
})

test('fromPaths still tags docker-compose.yml as docker', () => {
  // Assert
  expect(Vocabulary.fromPaths(Vocabulary.base(), ['deploy/docker-compose.yml'])).toContain('docker')
})

test('fromPaths still tags requirements.txt as a dependency', () => {
  // Assert
  expect(Vocabulary.fromPaths(Vocabulary.base(), ['requirements.txt'])).toContain('dependency')
})

test('fromPaths still tags pyproject.toml as a dependency', () => {
  // Assert
  expect(Vocabulary.fromPaths(Vocabulary.base(), ['pyproject.toml'])).toContain('dependency')
})

test('fromPaths still tags plugin.json as a manifest', () => {
  // Assert
  expect(Vocabulary.fromPaths(Vocabulary.base(), ['plugin/.claude-plugin/plugin.json'])).toContain('manifest')
})

test('parseOverlay keeps two hundred path patterns in total', () => {
  // Act
  const overlay = VocabularyFixture.crowded()

  // Assert
  const total = Object.values(overlay.tags).reduce((sum, def) => sum + def.paths.length, 0)
  expect(total).toBe(200)
})

test('parseOverlay keeps the facet and aliases of tags beyond the path cap', () => {
  // Act
  const overlay = VocabularyFixture.crowded()

  // Assert
  expect(Object.keys(overlay.tags)).toHaveLength(50)
  expect(overlay.tags.t49?.facet).toBe('artifact')
  expect(overlay.tags.t49?.aliases).toEqual(['alias 49'])
  expect(overlay.tags.t49?.paths).toEqual([])
})

test('parseOverlay gives the earlier tags their full eight paths', () => {
  // Act
  const overlay = VocabularyFixture.crowded()

  // Assert
  expect(overlay.tags.t0?.paths).toHaveLength(8)
})
