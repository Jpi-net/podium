export type Facet = 'lens' | 'concept' | 'artifact' | 'stack' | 'phase' | 'decision'

export type TagDef = { facet: Facet, parent: string, aliases: readonly string[], paths: readonly string[] }

export type VocabularyData = { revision: number, tags: Readonly<Record<string, TagDef>> }

export type VocabularyOverlay = VocabularyData & { candidates: Readonly<Record<string, number>> }

type Group = { facet: Facet, parent: string, tags: Readonly<Record<string, readonly string[]>> }

type Term = { tag: string, term: string }

export class Vocabulary {
  static readonly FACETS: readonly Facet[] = ['lens', 'concept', 'artifact', 'stack', 'phase', 'decision']

  private static readonly ALIAS_ONLY: ReadonlySet<string> = new Set(['build'])

  private static readonly NAME = /^[a-z0-9][a-z0-9-]{0,31}$/
  private static readonly MAX_TEXT = 20000
  private static readonly MAX_TAGS = 12
  private static readonly MAX_ALIASES = 16
  private static readonly MAX_ALIAS_LENGTH = 64
  private static readonly MAX_PATH_LENGTH = 200
  private static readonly MAX_CANDIDATES = 500
  private static readonly MAX_PATH_INPUT = 200
  private static readonly MAX_OVERLAY_TAGS = 200
  private static readonly MAX_PATHS_PER_TAG = 8
  private static readonly META = '\\^$.*+?()[]{}|'
  private static readonly MAX_OPTIONALS = 2
  private static readonly MAX_GROUPS = 1
  private static readonly MAX_ALTERNATIVES = 12

  private static readonly GROUPS: readonly Group[] = [
    {
      facet: 'lens', parent: '', tags: {
        'security': ['security', 'sécurité', 'secure', 'vulnerability', 'vulnérabilité', 'threat model'],
        'architecture': ['architecture', 'architectural', 'system design', 'structure du code'],
        'testing': ['test', 'tests', 'testing', 'tester', 'unit test', 'unit tests', 'test suite', 'tests unitaires'],
        'performance': ['performance', 'perf', 'optimization', 'optimisation', 'speed up', 'slow', 'lent'],
        'robustness': ['robustness', 'robust', 'resilient', 'resilience', 'robustesse', 'reliability', 'fiabilité'],
        'dx': ['developer experience', 'dx', 'ergonomics', 'ergonomie', 'workflow'],
        'git': ['git', 'version control', 'gestion de version'],
        'docs': ['documentation', 'docs', 'readme', 'changelog', 'doc'],
        'product': ['product', 'produit', 'feature scope', 'user story', 'roadmap'],
        'ux': ['ux', 'user experience', 'expérience utilisateur', 'usability', 'utilisabilité'],
        'data': ['data', 'données', 'dataset', 'data model', 'modèle de données'],
        'operations': ['operations', 'ops', 'deployment', 'déploiement', 'deploy', 'monitoring', 'observability', 'production'],
        'accessibility': ['accessibility', 'a11y', 'accessibilité', 'screen reader', 'wcag', 'aria'],
        'cost': ['cost', 'coût', 'budget', 'pricing', 'spend', 'cheaper', 'price']
      }
    },
    {
      facet: 'concept', parent: 'security', tags: {
        'untrusted-input': ['untrusted input', 'user input', 'input validation', 'validate', 'validation', 'valider', 'sanitize', 'entrée utilisateur'],
        'secret-handling': ['secret', 'secrets', 'credentials', 'api key', 'password', 'mot de passe', 'identifiants'],
        'authn': ['authentication', 'authenticate', 'login', 'sign in', 'authentification', 'oauth', 'sso'],
        'authz': ['authorization', 'permissions', 'permission', 'access control', 'rbac', 'autorisation', 'roles'],
        'injection': ['injection', 'sql injection', 'xss', 'command injection', 'shell injection', 'escaping', 'échappement'],
        'least-privilege': ['least privilege', 'minimal permissions', 'privilège minimal', 'principle of least privilege', 'sandbox'],
        'supply-chain': ['supply chain', 'dependency audit', 'typosquatting', 'lockfile'],
        'data-leak': ['data leak', 'leak', 'leaks', 'fuite', 'fuite de données', 'exfiltration', 'exposure'],
        'size-limit': ['size limit', 'max size', 'limit the size', 'bounded', 'size cap', 'limite de taille', 'truncate'],
        'crypto': ['crypto', 'cryptography', 'encryption', 'encrypt', 'hash', 'chiffrement', 'cryptographie'],
        'audit-trail': ['audit trail', 'audit log', 'audit', 'traçabilité']
      }
    },
    {
      facet: 'concept', parent: 'architecture', tags: {
        'layering': ['layering', 'layers', 'layer', 'couches', 'architecture en couches'],
        'boundaries': ['boundaries', 'boundary', 'facade', 'ports and adapters', 'frontière', 'interface boundary'],
        'static-classes': ['static class', 'static classes', 'classe statique', 'classes statiques', 'no free functions', 'free function', 'free functions'],
        'dependency-direction': ['dependency direction', 'import direction', 'circular dependency', 'dépendance circulaire', 'cyclic import', 'dependency inversion'],
        'single-responsibility': ['single responsibility', 'srp', 'one responsibility', 'responsabilité unique', 'separation of concerns', 'séparation des responsabilités'],
        'no-build-step': ['no build step', 'no build', 'sans build', 'without a build', 'no bundler', 'no transpile'],
        'extensibility': ['extensibility', 'extensible', 'plugin system', 'open closed', 'extension point', 'extensibilité'],
        'coupling': ['coupling', 'coupled', 'decouple', 'decoupling', 'couplage', 'découpler', 'cohesion'],
        'naming': ['naming', 'rename', 'nommage', 'renommer', 'identifier names', 'variable names'],
        'code-style': ['code style', 'style guide', 'formatting', 'lint', 'linter', 'indentation', 'semicolons', 'style de code'],
        'no-comments': ['no comments', 'without comments', 'comments', 'commentaire', 'commentaires', 'sans commentaire', 'zero comments']
      }
    },
    {
      facet: 'concept', parent: 'robustness', tags: {
        'fail-open': ['fail open', 'fails open', 'never crash', 'ne jamais planter', 'graceful degradation', 'fallback', 'fall back'],
        'fail-closed': ['fail closed', 'fails closed', 'deny by default', 'default deny', 'block on error', 'fail secure'],
        'error-handling': ['error handling', 'exception', 'exceptions', 'try catch', 'gestion des erreurs', 'erreur', 'erreurs', 'error'],
        'idempotency': ['idempotent', 'idempotency', 'idempotence', 'safe to retry', 'retry', 'réessayer'],
        'concurrency': ['concurrency', 'race condition', 'parallel', 'parallèle', 'mutex', 'deadlock', 'async'],
        'backward-compat': ['backward compatible', 'backwards compatibility', 'backward compat', 'rétrocompatibilité', 'breaking change', 'compatibilité ascendante', 'deprecation'],
        'migration': ['migration', 'migrate', 'migrer', 'schema change', 'upgrade path'],
        'cross-platform': ['cross platform', 'windows', 'multiplateforme', 'any os', 'posix', 'macos']
      }
    },
    {
      facet: 'concept', parent: 'testing', tags: {
        'test-first': ['test first', 'tdd', 'failing test', 'red green', 'write the test first', 'test en premier'],
        'regression-test': ['regression test', 'regression', 'régression', 'non regression', 'reproduce the bug'],
        'test-structure': ['arrange act assert', 'aaa', 'test structure', 'describe it', 'structure des tests', 'one assertion', 'given when then'],
        'fixtures': ['fixture', 'fixtures', 'mock', 'mocks', 'stub', 'test data', 'jeu de données'],
        'coverage': ['coverage', 'couverture', 'code coverage', 'couverture de tests', 'coverage threshold'],
        'e2e': ['e2e', 'end to end', 'integration test', 'integration tests', 'bout en bout', 'smoke test']
      }
    },
    {
      facet: 'concept', parent: 'performance', tags: {
        'caching': ['cache', 'caching', 'memoize', 'memoization', 'mise en cache', 'invalidate cache', 'ttl'],
        'hot-path': ['hot path', 'hot loop', 'render path', 'per frame', 'chemin critique', 'inner loop'],
        'memory': ['memory', 'mémoire', 'memory leak', 'fuite mémoire', 'allocation', 'allocations', 'ram', 'heap'],
        'latency': ['latency', 'latence', 'response time', 'temps de réponse', 'round trip', 'lag']
      }
    },
    {
      facet: 'concept', parent: 'git', tags: {
        'commit-format': ['commit message', 'commit format', 'commit messages', 'message de commit', 'conventional commits', 'commit subject', 'commit'],
        'commit-granularity': ['commit granularity', 'atomic commit', 'atomic commits', 'small commits', 'split commits', 'squash', 'one commit per'],
        'branching': ['branch', 'branches', 'branching', 'branche', 'feature branch', 'git flow', 'trunk', 'rebase'],
        'pull-request': ['pull request', 'pull requests', 'pr', 'merge request', 'pr description'],
        'ai-attribution': ['ai attribution', 'co-authored-by', 'co authored by', 'generated with', 'attribution', 'coauthor'],
        'history-safety': ['force push', 'rewrite history', 'reset hard', 'amend', 'historique', 'destructive git', 'no verify']
      }
    },
    {
      facet: 'concept', parent: 'dx', tags: {
        'automation': ['automation', 'automate', 'automatic', 'automatiser', 'automatisation', 'hands free', 'no manual'],
        'minimal-surface': ['minimal surface', 'minimal', 'less is more', 'keep it small', 'minimaliste', 'few options', 'surface area', 'yagni'],
        'discoverability': ['discoverability', 'discoverable', 'help text', 'autocomplete', 'découvrabilité', 'hint', 'onboarding'],
        'defaults': ['defaults', 'default value', 'sensible defaults', 'valeur par défaut', 'par défaut', 'zero config', 'convention over configuration']
      }
    },
    {
      facet: 'concept', parent: 'product', tags: {
        'consent': ['consent', 'opt in', 'opt out', 'consentement', 'permission to'],
        'scope-control': ['scope creep', 'scope', 'out of scope', 'hors périmètre', 'périmètre', 'stay focused', 'minimal diff', 'unrelated changes']
      }
    },
    {
      facet: 'concept', parent: 'ux', tags: {
        'user-language': ['user language', 'user-facing', 'english', 'français', 'localization', 'i18n', 'translation', 'traduction']
      }
    },
    {
      facet: 'concept', parent: 'data', tags: {
        'privacy': ['privacy', 'confidentialité', 'private', 'vie privée', 'gdpr', 'rgpd', 'personal data', 'données personnelles']
      }
    },
    {
      facet: 'artifact', parent: '', tags: {
        'hook': ['hook', 'hooks', 'git hook', 'pre commit'],
        'cli': ['cli', 'command line', 'terminal', 'flag', 'flags', 'argv', 'ligne de commande'],
        'api': ['api', 'endpoint', 'endpoints', 'rest', 'http', 'route', 'routes', 'graphql'],
        'ui': ['ui', 'interface', 'screen', 'écran', 'component', 'components', 'layout', 'panel'],
        'db-schema': ['db schema', 'database schema', 'schema', 'table', 'tables', 'migration file', 'base de données', 'database'],
        'config': ['config', 'configuration', 'settings', 'paramètres', 'env var', 'environment variable', 'dotenv'],
        'ci': ['ci', 'pipeline', 'github actions', 'workflow file', 'continuous integration', 'intégration continue', 'gitlab ci'],
        'dependency': ['dependency', 'dependencies', 'package', 'packages', 'library', 'librairie', 'dépendance', 'dépendances'],
        'docs-file': ['readme', 'markdown', 'documentation file', 'changelog', 'contributing', 'fichier de documentation'],
        'test-file': ['test file', 'spec file', 'test files', 'fichier de test', 'spec', 'specs'],
        'prompt': ['prompt', 'system prompt', 'prompts', 'instruction', 'instructions', 'prompt template', 'few-shot'],
        'agent': ['agent', 'agents', 'subagent', 'sub-agent', 'sous-agent', 'subagents'],
        'skill': ['skill', 'skills', 'slash command', 'compétence', 'command file'],
        'manifest': ['manifest', 'manifeste', 'plugin.json', 'marketplace', 'plugin manifest', 'package manifest'],
        'build': ['build system', 'build script', 'build step', 'compilation', 'bundler', 'webpack', 'vite']
      }
    },
    {
      facet: 'stack', parent: '', tags: {
        'node': ['node', 'nodejs', 'node.js', 'npm', 'pnpm', 'yarn', 'deno', 'bun'],
        'typescript': ['typescript', 'ts file', 'tsc', 'tsconfig', 'type annotations'],
        'javascript': ['javascript', 'js', 'ecmascript', 'esm', 'mjs', 'es modules'],
        'python': ['python', 'py', 'pip', 'pytest', 'django', 'flask', 'pydantic', 'venv'],
        'dotnet': ['dotnet', '.net', 'c#', 'csharp', 'asp.net', 'nuget', 'f#', 'msbuild'],
        'java': ['java', 'jvm', 'maven', 'gradle', 'spring', 'jdk', 'junit'],
        'go': ['golang', 'go.mod', 'go mod', 'goroutine', 'gofmt', 'go file'],
        'rust': ['rust', 'cargo', 'rustc', 'crate', 'borrow checker', 'clippy'],
        'php': ['php', 'composer', 'laravel', 'symfony', 'phpunit'],
        'ruby': ['ruby', 'rails', 'gem', 'rspec', 'rake'],
        'swift': ['swift', 'swiftui', 'xcode', 'ios', 'cocoapods'],
        'kotlin': ['kotlin', 'android', 'ktor', 'coroutines', 'kts'],
        'react': ['reactjs', 'react component', 'react hooks', 'next.js', 'nextjs', 'redux', 'useeffect'],
        'vue': ['vue', 'vuejs', 'vue.js', 'nuxt', 'pinia', 'vuex'],
        'angular': ['angular', 'rxjs', 'ngrx', 'angular cli'],
        'sql': ['sql', 'query', 'postgres', 'postgresql', 'mysql', 'sqlite', 'requête sql'],
        'docker': ['docker', 'dockerfile', 'container', 'containers', 'compose', 'docker compose', 'conteneur', 'kubernetes'],
        'shell': ['shell script', 'bash', 'zsh', 'powershell', 'sh file', 'bash script']
      }
    },
    {
      facet: 'phase', parent: '', tags: {
        'plan': ['planning', 'planification', 'plan mode', 'in plan mode', 'design doc', 'planifier', 'proposal'],
        'implement': ['implement', 'implementation', 'implémenter', 'implémentation', 'write the code', 'develop'],
        'review': ['code review', 'pull request review', 'pr review', 'revue de code', 'reviewer', 'relecture'],
        'debug': ['debugging', 'bug', 'bugs', 'déboguer', 'débogage', 'root cause', 'stack trace'],
        'setup': ['project setup', 'set up', 'installation', 'initialisation', 'bootstrap']
      }
    },
    {
      facet: 'phase', parent: 'git', tags: {
        'release': ['release notes', 'tag a release', 'publish a release', 'version bump', 'changelog entry', 'semver']
      }
    },
    {
      facet: 'decision', parent: '', tags: {
        'add-vs-avoid-dependency': ['add a dependency', 'new dependency', 'avoid dependency', 'no dependency', 'zero dependency', 'ajouter une dépendance', 'sans dépendance'],
        'strict-vs-lenient': ['strict mode', 'strict validation', 'be lenient', 'lenient parsing', 'too strict', 'validation stricte', 'trop strict'],
        'build-vs-reuse': ['build vs reuse', 'build or buy', 'reinvent the wheel', 'existing library', 'reuse existing code', 'write it ourselves'],
        'now-vs-later': ['now or later', 'do it later', 'plus tard', 'defer this', 'postpone this', 'follow-up task'],
        'generic-vs-specific': ['generic or specific', 'too generic', 'too specific', 'premature abstraction', 'generalize this', 'plus générique'],
        'automatic-vs-manual': ['automatic or manual', 'manual step', 'manual steps', 'by hand', 'étape manuelle'],
        'ask-vs-decide': ['ask or decide', 'ask the user', 'ask first', 'decide for me', 'just do it'],
        'local-vs-remote': ['local or remote', 'run locally', 'on device', 'server side', 'sur la machine', 'offline first'],
        'simple-vs-complete': ['simple or complete', 'keep it simple', 'good enough', 'full featured', 'quick and simple', 'simple ou complet']
      }
    }
  ]

  private static readonly PATHS: Readonly<Record<string, readonly string[]>> = {
    'hook': ['(^|/)hooks?/'],
    'ci': ['(^|/)\\.github/workflows/', '(^|/)\\.gitlab-ci'],
    'config': ['\\.(json|ya?ml|toml|ini)$', '(^|/)\\.env'],
    'docs-file': ['\\.md$'],
    'test-file': ['(^|/)tests?/', '\\.(test|spec)\\.'],
    'dependency': [
      '(^|/)package\\.json$', '(^|/)package-lock\\.json$', '(requirements\\.txt|pyproject\\.toml)$', '(^|/)go\\.mod$',
      '(^|/)Cargo\\.toml$', '\\.csproj$', '(^|/)Gemfile$', '(^|/)composer\\.json$'
    ],
    'db-schema': ['(^|/)migrations?/', '\\.sql$'],
    'agent': ['(^|/)\\.claude/agents/'],
    'skill': ['(^|/)skills?/.*SKILL\\.md$'],
    'manifest': ['(^|/)plugin\\.json$', '(^|/)marketplace\\.json$', '(^|/)podium\\.json$'],
    'typescript': ['\\.tsx?$'],
    'javascript': ['\\.(js|jsx|mjs|mjsx|cjs|cjsx)$'],
    'python': ['\\.py$'],
    'dotnet': ['\\.(cs|fs|csproj|sln)$'],
    'java': ['\\.java$'],
    'go': ['\\.go$'],
    'rust': ['\\.rs$'],
    'php': ['\\.php$'],
    'ruby': ['\\.rb$'],
    'swift': ['\\.swift$'],
    'kotlin': ['\\.kts?$'],
    'sql': ['\\.sql$'],
    'docker': ['(^|/)Dockerfile$', '(^|/)docker-compose\\.ya?ml$'],
    'shell': ['\\.(sh|bash|zsh|ps1)$'],
    'react': ['\\.(jsx|tsx)$'],
    'vue': ['\\.vue$']
  }

  private static cached: VocabularyData | undefined
  private static readonly TERMS = new WeakMap<object, Term[]>()
  private static readonly ALIASES = new WeakMap<object, Map<string, string>>()
  private static readonly MATCHERS = new WeakMap<object, [string, RegExp][]>()

  static base(): VocabularyData {
    if (Vocabulary.cached !== undefined) return Vocabulary.cached
    const tags: Record<string, TagDef> = {}
    for (const group of Vocabulary.GROUPS) {
      for (const name of Object.keys(group.tags)) {
        const aliases = group.tags[name] ?? []
        tags[name] = Object.freeze({
          facet: group.facet,
          parent: group.parent,
          aliases: Object.freeze(aliases.map((alias) => alias.toLowerCase())),
          paths: Object.freeze([...(Vocabulary.PATHS[name] ?? [])])
        })
      }
    }
    Vocabulary.cached = Object.freeze({ revision: 1, tags: Object.freeze(tags) })
    return Vocabulary.cached
  }

  static parseOverlay(text: string): VocabularyOverlay {
    const empty: VocabularyOverlay = { revision: 0, tags: {}, candidates: {} }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return empty
    }
    const root = Vocabulary.record(raw)
    if (root === undefined) return empty
    const revision = typeof root.revision === 'number' && Number.isFinite(root.revision) && root.revision >= 0 ? Math.floor(root.revision) : 0
    const tags: Record<string, TagDef> = {}
    const source = Vocabulary.record(root.tags)
    if (source !== undefined) {
      for (const name of Object.keys(source)) {
        const def = Vocabulary.def(name, source[name])
        if (def === undefined) continue
        tags[name] = def
        if (Object.keys(tags).length >= Vocabulary.MAX_OVERLAY_TAGS) break
      }
    }
    const candidates: Record<string, number> = {}
    const found = Vocabulary.record(root.candidates)
    if (found !== undefined) {
      for (const name of Object.keys(found)) {
        const count = found[name]
        if (!Vocabulary.isName(name) || typeof count !== 'number' || !Number.isFinite(count) || count < 0) continue
        if (Object.keys(candidates).length >= Vocabulary.MAX_CANDIDATES) break
        candidates[name] = Math.floor(count)
      }
    }
    return { revision, tags, candidates }
  }

  static serializeOverlay(overlay: VocabularyOverlay): string {
    return JSON.stringify({
      version: 1,
      revision: overlay.revision,
      tags: overlay.tags,
      candidates: overlay.candidates
    }, null, 2) + '\n'
  }

  static merge(base: VocabularyData, overlay: VocabularyData): VocabularyData {
    return { revision: overlay.revision, tags: { ...base.tags, ...overlay.tags } }
  }

  static isName(name: string): boolean {
    return typeof name === 'string' && Vocabulary.NAME.test(name)
  }

  static has(vocabulary: VocabularyData, tag: string): boolean {
    return typeof tag === 'string' && !!vocabulary && Object.prototype.hasOwnProperty.call(vocabulary.tags, tag)
  }

  static facetOf(vocabulary: VocabularyData, tag: string): Facet | undefined {
    return Vocabulary.has(vocabulary, tag) ? vocabulary.tags[tag]?.facet : undefined
  }

  static fold(text: string): string {
    if (typeof text !== 'string') return ''
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  }

  static normalize(vocabulary: VocabularyData, tags: readonly string[]): string[] {
    if (!Array.isArray(tags)) return []
    const aliases = Vocabulary.aliasMap(vocabulary)
    const result: string[] = []
    for (const item of tags) {
      if (typeof item !== 'string') continue
      const folded = Vocabulary.fold(item).trim()
      const tag = Vocabulary.has(vocabulary, folded) ? folded : aliases.get(folded)
      if (tag !== undefined && !result.includes(tag)) result.push(tag)
    }
    return result
  }

  static ancestors(vocabulary: VocabularyData, tag: string): string[] {
    const result: string[] = []
    if (!Vocabulary.has(vocabulary, tag)) return result
    const seen = new Set<string>([tag])
    let current = vocabulary.tags[tag]?.parent ?? ''
    while (current !== '' && Vocabulary.has(vocabulary, current) && !seen.has(current)) {
      result.push(current)
      seen.add(current)
      current = vocabulary.tags[current]?.parent ?? ''
    }
    return result
  }

  static fromText(vocabulary: VocabularyData, text: string): string[] {
    if (typeof text !== 'string' || !vocabulary) return []
    const folded = Vocabulary.fold(text).slice(0, Vocabulary.MAX_TEXT)
    const taken = new Uint8Array(folded.length)
    const first = new Map<string, number>()
    for (const { tag, term } of Vocabulary.terms(vocabulary)) {
      let from = 0
      while (from <= folded.length) {
        const at = folded.indexOf(term, from)
        if (at < 0) break
        const end = at + term.length
        from = at + 1
        if (!Vocabulary.isBoundary(folded, at - 1) || !Vocabulary.isBoundary(folded, end)) continue
        if (taken.subarray(at, end).some((value) => value === 1)) continue
        taken.fill(1, at, end)
        const known = first.get(tag)
        if (known === undefined || at < known) first.set(tag, at)
        from = end
      }
    }
    return [...first.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, Vocabulary.MAX_TAGS)
      .map((entry) => entry[0])
  }

  static fromPaths(vocabulary: VocabularyData, paths: readonly string[]): string[] {
    if (!Array.isArray(paths) || !vocabulary) return []
    const matchers = Vocabulary.matchers(vocabulary)
    const result: string[] = []
    for (const path of paths) {
      if (typeof path !== 'string') continue
      const unified = path.slice(0, Vocabulary.MAX_PATH_INPUT).replace(/\\/g, '/')
      for (const [tag, pattern] of matchers) {
        if (!result.includes(tag) && pattern.test(unified)) result.push(tag)
      }
    }
    return result
  }

  static describe(vocabulary: VocabularyData): string {
    const lines: string[] = []
    for (const facet of Vocabulary.FACETS) {
      const names = Object.keys(vocabulary.tags).filter((name) => vocabulary.tags[name]?.facet === facet).sort()
      if (names.length === 0) continue
      const items = names.map((name) => {
        const parent = vocabulary.tags[name]?.parent ?? ''
        return parent === '' ? name : `${name} (${parent})`
      })
      lines.push(`${facet}: ${items.join(', ')}`)
    }
    return lines.join('\n')
  }

  private static record(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    return value as Record<string, unknown>
  }

  private static def(name: string, value: unknown): TagDef | undefined {
    if (!Vocabulary.isName(name)) return undefined
    const raw = Vocabulary.record(value)
    if (raw === undefined) return undefined
    const facet = raw.facet
    if (typeof facet !== 'string' || !(Vocabulary.FACETS as readonly string[]).includes(facet)) return undefined
    const parent = typeof raw.parent === 'string' && Vocabulary.isName(raw.parent) ? raw.parent : ''
    const aliases: string[] = []
    if (Array.isArray(raw.aliases)) {
      for (const alias of raw.aliases) {
        if (typeof alias !== 'string') continue
        const clean = alias.trim().toLowerCase()
        if (clean === '' || clean.length > Vocabulary.MAX_ALIAS_LENGTH || aliases.includes(clean)) continue
        aliases.push(clean)
        if (aliases.length >= Vocabulary.MAX_ALIASES) break
      }
    }
    const paths: string[] = []
    if (Array.isArray(raw.paths)) {
      for (const path of raw.paths) {
        if (typeof path !== 'string' || path === '' || path.length > Vocabulary.MAX_PATH_LENGTH) continue
        if (!Vocabulary.isSafePath(path)) continue
        try {
          new RegExp(path)
        } catch {
          continue
        }
        paths.push(path)
        if (paths.length >= Vocabulary.MAX_PATHS_PER_TAG) break
      }
    }
    return { facet: facet as Facet, parent, aliases, paths }
  }

  private static atom(source: string, index: number): number {
    const char = source.charAt(index)
    if (char === '') return 0
    if (char === '\\') return '.-/'.includes(source.charAt(index + 1)) && index + 1 < source.length ? 2 : 0
    return Vocabulary.META.includes(char) ? 0 : 1
  }

  private static isSafePath(source: string): boolean {
    if (source === '' || source.length > Vocabulary.MAX_PATH_LENGTH) return false
    let index = 0
    let optionals = 0
    let groups = 0
    let isWild = false
    while (index < source.length) {
      const char = source.charAt(index)
      if (char === '^' || char === '$') {
        index += 1
      } else if (char === '(') {
        groups += 1
        if (groups > Vocabulary.MAX_GROUPS) return false
        index += 1
        let alternatives = 1
        let isSequenceEmpty = true
        let altStart = index
        const seen = new Set<string>()
        for (;;) {
          const inner = source.charAt(index)
          if (inner === '^' && isSequenceEmpty && '|)'.includes(source.charAt(index + 1)) && index + 1 < source.length) {
            index += 1
            isSequenceEmpty = false
          } else if (inner === '|' || inner === ')') {
            if (isSequenceEmpty) return false
            const alt = source.slice(altStart, index)
            if (seen.has(alt)) return false
            seen.add(alt)
            index += 1
            altStart = index
            if (inner === ')') break
            alternatives += 1
            if (alternatives > Vocabulary.MAX_ALTERNATIVES) return false
            isSequenceEmpty = true
          } else {
            const size = Vocabulary.atom(source, index)
            if (size === 0) return false
            index += size
            isSequenceEmpty = false
            if (source.charAt(index) === '?') {
              optionals += 1
              index += 1
            }
          }
          if (index >= source.length) return false
        }
        if ('?*+{'.includes(source.charAt(index)) && index < source.length) return false
      } else if (char === '.') {
        if (isWild || source.charAt(index + 1) !== '*') return false
        isWild = true
        index += 2
        if ('?*+{'.includes(source.charAt(index)) && index < source.length) return false
      } else {
        const size = Vocabulary.atom(source, index)
        if (size === 0) return false
        index += size
        if (source.charAt(index) === '?') {
          optionals += 1
          index += 1
        }
        if ('*+{'.includes(source.charAt(index)) && index < source.length) return false
      }
      if (optionals > Vocabulary.MAX_OPTIONALS) return false
    }
    return true
  }

  private static isBoundary(text: string, index: number): boolean {
    if (index < 0 || index >= text.length) return true
    return !/[a-z0-9]/.test(text.charAt(index))
  }

  private static variants(raw: string): string[] {
    const folded = Vocabulary.fold(raw).trim()
    if (folded === '') return []
    const spaced = folded.replace(/-/g, ' ')
    return spaced === folded ? [folded] : [folded, spaced]
  }

  private static terms(vocabulary: VocabularyData): Term[] {
    const known = Vocabulary.TERMS.get(vocabulary)
    if (known !== undefined) return known
    const seen = new Set<string>()
    const list: Term[] = []
    for (const tag of Object.keys(vocabulary.tags)) {
      const aliases = vocabulary.tags[tag]?.aliases ?? []
      const facet = vocabulary.tags[tag]?.facet
      const isBare = facet !== 'stack' && facet !== 'phase' && facet !== 'decision' && !Vocabulary.ALIAS_ONLY.has(tag)
      for (const raw of isBare ? [tag, ...aliases] : aliases) {
        for (const term of Vocabulary.variants(raw)) {
          const key = tag + '\u0000' + term
          if (seen.has(key)) continue
          seen.add(key)
          list.push({ tag, term })
        }
      }
    }
    list.sort((a, b) => b.term.length - a.term.length)
    Vocabulary.TERMS.set(vocabulary, list)
    return list
  }

  private static aliasMap(vocabulary: VocabularyData): Map<string, string> {
    const known = Vocabulary.ALIASES.get(vocabulary)
    if (known !== undefined) return known
    const map = new Map<string, string>()
    const names = Object.keys(vocabulary.tags)
    for (const tag of names) {
      for (const term of Vocabulary.variants(tag)) if (!map.has(term)) map.set(term, tag)
    }
    for (const tag of names) {
      for (const alias of vocabulary.tags[tag]?.aliases ?? []) {
        for (const term of Vocabulary.variants(alias)) if (!map.has(term)) map.set(term, tag)
      }
    }
    Vocabulary.ALIASES.set(vocabulary, map)
    return map
  }

  private static matchers(vocabulary: VocabularyData): [string, RegExp][] {
    const known = Vocabulary.MATCHERS.get(vocabulary)
    if (known !== undefined) return known
    const list: [string, RegExp][] = []
    for (const tag of Object.keys(vocabulary.tags)) {
      for (const source of vocabulary.tags[tag]?.paths ?? []) {
        try {
          list.push([tag, new RegExp(source)])
        } catch {
          continue
        }
      }
    }
    Vocabulary.MATCHERS.set(vocabulary, list)
    return list
  }
}
