import { expect, test } from 'claude-code/testing'
import { SituationTagger } from '../hooks/signature/tagger'
import { SignatureFixtures } from './fixtures/signature'

class TaggerFixture {
  static tag(text: string, paths: string[] = [], stack: string[] = []): string[] {
    return SituationTagger.tag(SignatureFixtures.vocabulary(), { text, paths, stack })
  }
}

test('paths finds relative paths in a prompt', () => {
  // Act
  const found = SituationTagger.paths('edit src/app.ts and ./lib/x.py please')

  // Assert
  expect(found).toEqual(['src/app.ts', './lib/x.py'])
})

test('paths finds dotted file names without a slash', () => {
  // Act
  const found = SituationTagger.paths('look at package.json and README.md')

  // Assert
  expect(found).toEqual(['package.json', 'README.md'])
})

test('paths trims quotes, backticks and punctuation around a token', () => {
  // Act
  const found = SituationTagger.paths('see `src/a/b.ts`, "lib/x.py". Also (docs/y.md)!')

  // Assert
  expect(found).toEqual(['src/a/b.ts', 'lib/x.py', 'docs/y.md'])
})

test('paths excludes URLs', () => {
  // Act
  const found = SituationTagger.paths('open https://example.com/a/b.js now')

  // Assert
  expect(found).toEqual([])
})

test('paths does not take a version number for a path', () => {
  // Act
  const found = SituationTagger.paths('upgrade to 1.2 or 3.4.5 today')

  // Assert
  expect(found).toEqual([])
})

test('paths keeps at most twenty distinct paths', () => {
  // Arrange
  const text = Array.from({ length: 30 }, (_, i) => `dir/file${i}.ts`).join(' ')

  // Act
  const found = SituationTagger.paths(text)

  // Assert
  expect(found).toHaveLength(20)
})

test('paths lists a repeated path once', () => {
  // Act
  const found = SituationTagger.paths('src/a.ts then src/a.ts again')

  // Assert
  expect(found).toEqual(['src/a.ts'])
})

test('tag combines text, path and stack tags in that order', () => {
  // Act
  const tags = TaggerFixture.tag('validate', ['plugin/tests/x.test.ts'], ['python'])

  // Assert
  expect(tags).toEqual(['untrusted-input', 'test-file', 'typescript', 'python'])
})

test('tag lists a tag found by several sources once', () => {
  // Act
  const tags = TaggerFixture.tag('typescript', ['src/a.ts'], ['typescript'])

  // Assert
  expect(tags).toEqual(['typescript'])
})

test('tag reads paths written inside the text', () => {
  // Act
  const tags = TaggerFixture.tag('please fix src/main.rs')

  // Assert
  expect(tags).toContain('rust')
})

test('tag does not match a bare stack name written as a plain word', () => {
  // Act
  const tags = TaggerFixture.tag('go ahead and do it')

  // Assert
  expect(tags).not.toContain('go')
})

test('tag does not match a bare phase name written as a plain word', () => {
  // Act
  const tags = TaggerFixture.tag('review this')

  // Assert
  expect(tags).not.toContain('review')
})

test('tag gives security tags for a French prompt', () => {
  // Act
  const tags = TaggerFixture.tag('Je veux valider les entrées et protéger le mot de passe')

  // Assert
  expect(tags).toContain('untrusted-input')
  expect(tags).toContain('secret-handling')
})

test('tag returns nothing for an empty situation', () => {
  // Act
  const tags = TaggerFixture.tag('')

  // Assert
  expect(tags).toEqual([])
})

test('paths handles a hundred thousand dots quickly', () => {
  // Arrange
  const started = Date.now()

  // Act
  const found = SituationTagger.paths('.'.repeat(100000) + 'a')

  // Assert
  expect(found).toEqual([])
  expect(Date.now() - started).toBeLessThan(100)
})

test('paths skips a token longer than five hundred and twelve characters', () => {
  // Act
  const found = SituationTagger.paths(`${'x'.repeat(600)}/a.ts src/b.ts`)

  // Assert
  expect(found).toEqual(['src/b.ts'])
})

test('tag reads at most twenty given paths', () => {
  // Arrange
  const paths = [...Array.from({ length: 20 }, (_, i) => `dir/file${i}.txt`), 'src/late.rs']

  // Act
  const tags = SituationTagger.tag(SignatureFixtures.vocabulary(), { text: '', paths, stack: [] })

  // Assert
  expect(tags).not.toContain('rust')
})

test('tag reads the twentieth given path', () => {
  // Arrange
  const paths = [...Array.from({ length: 19 }, (_, i) => `dir/file${i}.txt`), 'src/last.rs']

  // Act
  const tags = SituationTagger.tag(SignatureFixtures.vocabulary(), { text: '', paths, stack: [] })

  // Assert
  expect(tags).toContain('rust')
})
