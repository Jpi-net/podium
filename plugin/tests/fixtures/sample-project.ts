import type { Manifest } from '../../hooks/project'

export class Fixtures {
  static readonly SAMPLE_PROJECT: Manifest = {
    "version": 1,
    "name": "Contoso.Policies",
    "stage": "full",
    "language": {
      "conversation": "en",
      "artifacts": "en"
    },
    "versioned": false,
    "roles": {
      "setup": "maestro",
      "feature": "feat",
      "fix": "fix",
      "investigate": "investigate",
      "faq": "faq",
      "review": "review-pr",
      "comments": "pr-comments",
      "deliver": "deliver",
      "merge": "merge-main",
      "upgrade": "renovate",
      "environment": "stack"
    },
    "phases": [
      {
        "id": "plan",
        "name": "Plan",
        "short": "Plan",
        "agents": [
          "architect",
          "debugger",
          "Plan"
        ]
      },
      {
        "id": "experts",
        "name": "Experts",
        "short": "Experts",
        "agents": [
          "dotnet-expert",
          "angular-expert",
          "mssql-expert",
          "test-expert",
          "e2e-expert",
          "ux-ui-expert",
          "docker-expert",
          "proxy-generator",
          "dependency-upgrader"
        ]
      },
      {
        "id": "verify",
        "name": "Verify",
        "short": "Verify",
        "agents": [
          "lint-runner"
        ]
      },
      {
        "id": "review",
        "name": "Reviews",
        "short": "Reviews",
        "agents": [
          "code-reviewer",
          "security-reviewer",
          "doc-writer"
        ]
      },
      {
        "id": "deliver",
        "name": "Delivery",
        "short": "Deliver",
        "agents": [
          "git-writer"
        ]
      }
    ],
    "reviewers": [
      {
        "agent": "code-reviewer",
        "label": "code review",
        "short": "code"
      },
      {
        "agent": "security-reviewer",
        "label": "security review",
        "short": "security"
      }
    ],
    "verification": [
      {
        "step": "build",
        "label": "Build",
        "patterns": [
          "\\bdotnet\\s+build\\b"
        ]
      },
      {
        "step": "format",
        "label": "Format",
        "patterns": [
          "\\bdotnet\\s+format\\b"
        ]
      },
      {
        "step": "integ",
        "label": "Integ.",
        "patterns": [
          "\\bdotnet\\s+test\\b.*Integration"
        ],
        "optional": true
      },
      {
        "step": "unit",
        "label": "Unit",
        "patterns": [
          "\\bdotnet\\s+test\\b"
        ]
      },
      {
        "step": "e2e",
        "label": "E2E",
        "patterns": [
          "\\b(npm\\s+run\\s+(e2e|test:e2e)|cucumber-js|playwright\\s+test)\\b"
        ],
        "optional": true
      },
      {
        "step": "lint",
        "label": "Lint",
        "patterns": [
          "\\b(npm\\s+run\\s+lint|npx\\s+eslint|eslint\\s)"
        ]
      },
      {
        "step": "front",
        "label": "Front",
        "patterns": [
          "\\b(npm\\s+(run\\s+)?test|npx\\s+vitest|ng\\s+test)\\b"
        ],
        "optional": true
      }
    ],
    "layers": [
      {
        "name": "Database",
        "pattern": "^database/",
        "rank": 4
      },
      {
        "name": "Documentation",
        "pattern": "^docs/",
        "rank": 7
      },
      {
        "name": "Tests",
        "pattern": "^tests/|^e2e/|\\.spec\\.ts$",
        "rank": 6
      },
      {
        "name": "Front",
        "pattern": "^(web|portal|admin)/",
        "rank": 5
      },
      {
        "name": "Domain",
        "pattern": "\\.Domain/",
        "rank": 1
      },
      {
        "name": "Infrastructure",
        "pattern": "\\.Infrastructure/|Persistence",
        "rank": 3
      },
      {
        "name": "Application + API",
        "pattern": "\\.Application/|\\.Api/|\\.Host/",
        "rank": 2
      }
    ],
    "code": {
      "roots": "src|web|portal|admin|tests|database|docs|e2e",
      "extensions": "\\.(cs|ts|tsx|js|html|scss|css|sql|csproj|json)$",
      "ignore": "(^|/)(\\.claude|node_modules|bin|obj|dist)/"
    },
    "generated": "(^|/)(api-client|api-permissions)\\.ts$|\\.g\\.cs$",
    "checks": {
      "comments": true,
      "noVar": true,
      "noFreeFunction": true,
      "aiMention": true,
      "partition": true,
      "hooks": true,
      "generated": {
        "detail": "regenerate, never edit (rules/clients.md)",
        "why": "file regenerated from the OpenAPI document, any manual change will be overwritten",
        "fix": "revert the change and regenerate with the client-generator (rules/clients.md)"
      },
      "legacy": {
        "pattern": "src/Contoso\\.Policies\\.Legacy\\.[^/]+/",
        "modern": "src/Contoso\\.Policies\\.(Domain|Application|Infrastructure|Api)/",
        "current": "the modern projects",
        "label": "Legacy touched during a feature",
        "short": "legacy",
        "remedy": "move to the modern projects",
        "why": "new features go in the modern projects only, the legacy projects only receive fixes",
        "fix": "move the new file to the matching modern project"
      },
      "isolation": {
        "label": "Tenant isolation to check",
        "short": "isolation",
        "remedy": "tenant filter",
        "why": "every handler must filter by tenant explicitly, never only through the global query filter",
        "fix": "go through TenantControllerBase, ITenantScopeResolver and InScope (rules/security.md)",
        "enabledBy": {
          "pattern": "ITenantScopeResolver",
          "path": "src"
        },
        "rules": [
          {
            "path": "\\.Api/.*Controller\\.cs$",
            "when": "class\\s+\\w+Controller",
            "require": "TenantControllerBase|BackOfficeControllerBase",
            "message": "neither TenantControllerBase nor BackOfficeControllerBase"
          },
          {
            "path": "\\.Application/.*(Service|Handler)\\.cs$",
            "skipName": "Cached",
            "when": "Repository",
            "require": "ITenantScopeResolver|BackOffice",
            "message": "reads a repository without ITenantScopeResolver"
          },
          {
            "path": "\\.Infrastructure/.*Repository\\.cs$",
            "require": "InScope",
            "message": "no InScope query"
          }
        ]
      },
      "integrationImage": {
        "command": "\\bdotnet\\s+test\\b.*Integration",
        "schema": "(^|/)database/",
        "build": "build-image\\.sh|contoso-policies-integration-test-mssql",
        "armFlag": "Integration__Database__UsePrebuiltImage=true",
        "stale": "rerun build-image.sh",
        "label": "Integration tests / Docker",
        "short": "Docker",
        "remedy": "image amd64",
        "why": "arm64 hosts: integration tests require an up-to-date prebuilt amd64 image",
        "fix": "rerun build-image.sh then dotnet test with Integration__Database__UsePrebuiltImage=true"
      }
    },
    "git": {
      "base": "main",
      "featurePrefixes": [
        "features/"
      ],
      "fixPrefixes": [
        "bugfixes/"
      ],
      "support": "^support/",
      "workItem": "(?:^|/)(\\d{4,6})(?:-|$)",
      "counterpart": "-main"
    },
    "theme": "",
    "generatedFiles": {},
    "hooks": {}
  }
}
