import { expect, test } from 'claude-code/testing'
import { Redactor } from '../hooks/signature/redactor'

class RedactorFixture {
  static elapsed(run: () => unknown): number {
    const start = Date.now()
    run()
    return Date.now() - start
  }

  static tokens(): string[] {
    return [
      'sk-ant-api03-abcdefghij',
      'sk-' + 'a1B2c3D4e5'.repeat(3),
      'ghp_' + 'a1B2c3D4e5F6g7H8i9',
      'gho_' + 'a1B2c3D4e5F6g7H8i9',
      'ghs_' + 'a1B2c3D4e5F6g7H8i9',
      'ghu_' + 'a1B2c3D4e5F6g7H8i9',
      'github_pat_' + 'a1B2c3D4e5F6g7H8i9J0',
      'glpat-' + 'a1B2c3D4e5F6g7H8',
      'xoxb-1234567890-abcdef',
      'xoxp-1234567890-abcdef',
      'AKIAABCDEFGHIJKLMNOP',
      'AIza' + 'a1B2c3D4e5'.repeat(3) + 'a1B2c',
      'npm_' + 'a1B2c3D4e5F6g7H8i9J0'
    ]
  }
}

test('a private key block is replaced as a whole', () => {
  // Act
  const out = Redactor.redact('a -----BEGIN RSA PRIVATE KEY-----\nabc\ndef\n-----END RSA PRIVATE KEY----- b', '')

  // Assert
  expect(out).toBe('a <private-key> b')
})

test('an unterminated private key block is replaced up to the end', () => {
  // Act
  const out = Redactor.redact('x -----BEGIN PRIVATE KEY-----\nabc', '')

  // Assert
  expect(out).toBe('x <private-key>')
})

test('a public key block is left alone', () => {
  // Arrange
  const text = '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----'

  // Assert
  expect(Redactor.redact(text, '')).toBe(text)
})

test('every known token prefix family is replaced', () => {
  // Act
  const outs = RedactorFixture.tokens().map((token) => Redactor.redact(`use ${token} now`, ''))

  // Assert
  expect(outs).toEqual(RedactorFixture.tokens().map(() => 'use <token> now'))
})

test('a token at the start of the text is replaced', () => {
  // Assert
  expect(Redactor.redact('ghp_a1B2c3D4e5F6g7H8i9', '')).toBe('<token>')
})

test('a short sk- string is left alone', () => {
  // Assert
  expect(Redactor.redact('the sk-short value', '')).toBe('the sk-short value')
})

test('a kebab word that ends in sk- is not mistaken for a token', () => {
  // Arrange
  const text = 'risk-assessment-for-the-new-platform-rollout'

  // Assert
  expect(Redactor.redact(text, '')).toBe(text)
})

test('a JSON web token is replaced', () => {
  // Assert
  expect(Redactor.redact('jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig_1 end', '')).toBe('jwt <token> end')
})

test('two dotted segments starting with eyJ are left alone', () => {
  // Assert
  expect(Redactor.redact('see eyJabc.def here', '')).toBe('see eyJabc.def here')
})

test('a secret assignment keeps its name and hides its value', () => {
  // Assert
  expect(Redactor.redact('password=hunter2 ok', '')).toBe('password=<secret>')
})

test('a quoted secret value is hidden as a whole', () => {
  // Assert
  expect(Redactor.redact('password: "hunter two" ok', '')).toBe('password: <secret> ok')
})

test('a single quoted secret value is hidden as a whole', () => {
  // Assert
  expect(Redactor.redact("secret='a b c' ok", '')).toBe('secret=<secret> ok')
})

test('a JSON style secret is hidden', () => {
  // Assert
  expect(Redactor.redact('{"api_key": "abc123"}', '')).toBe('{"api_key": <secret>}')
})

test('a GITHUB_TOKEN assignment is hidden', () => {
  // Assert
  expect(Redactor.redact('GITHUB_TOKEN=abc123', '')).toBe('GITHUB_TOKEN=<secret>')
})

test('a secret name is matched whatever its case', () => {
  // Assert
  expect(Redactor.redact('PASSWORD=abc', '')).toBe('PASSWORD=<secret>')
})

test('the word password alone in prose is untouched', () => {
  // Assert
  expect(Redactor.redact('the password is rotated monthly', '')).toBe('the password is rotated monthly')
})

test('the word tokenizer is untouched', () => {
  // Assert
  expect(Redactor.redact('the tokenizer splits words', '')).toBe('the tokenizer splits words')
})

test('credentials in a URL are replaced', () => {
  // Assert
  expect(Redactor.redact('clone https://user:pass@example.com/x.git', '')).toBe('clone https://<credentials>@example.com/x.git')
})

test('a URL with a port is left alone', () => {
  // Assert
  expect(Redactor.redact('open https://example.com:8080/path', '')).toBe('open https://example.com:8080/path')
})

test('a secret query parameter is hidden', () => {
  // Assert
  expect(Redactor.redact('GET https://x.io/cb?sig=abc123&state=1', '')).toBe('GET https://x.io/cb?sig=<secret>&state=1')
})

test('an ordinary query parameter is kept', () => {
  // Assert
  expect(Redactor.redact('GET https://x.io/list?page=2&sort=asc', '')).toBe('GET https://x.io/list?page=2&sort=asc')
})

test('an email address is replaced', () => {
  // Assert
  expect(Redactor.redact('mail jo.doe+x@example.co.uk now', '')).toBe('mail <email> now')
})

test('an at sign without a domain is left alone', () => {
  // Assert
  expect(Redactor.redact('ping @mention and a@b', '')).toBe('ping @mention and a@b')
})

test('the home directory prefix becomes a tilde', () => {
  // Assert
  expect(Redactor.redact('edit /Users/j/app/a.ts', '/Users/j')).toBe('edit ~/app/a.ts')
})

test('a longer user name sharing the home prefix is left alone', () => {
  // Assert
  expect(Redactor.redact('edit /Users/john/app', '/Users/j')).toBe('edit /Users/john/app')
})

test('a Windows home directory with backslashes becomes a tilde', () => {
  // Assert
  expect(Redactor.redact('edit C:\\Users\\j\\app', 'C:\\Users\\j')).toBe('edit ~\\app')
})

test('a Windows home directory is matched with forward slashes too', () => {
  // Assert
  expect(Redactor.redact('edit C:/Users/j/app', 'C:\\Users\\j')).toBe('edit ~/app')
})

test('an empty home leaves paths alone', () => {
  // Assert
  expect(Redactor.redact('edit /Users/j/app', '')).toBe('edit /Users/j/app')
})

test('a long opaque run is replaced by a blob placeholder', () => {
  // Assert
  expect(Redactor.redact('data ' + 'Zm9vYmFy'.repeat(6) + ' end', '')).toBe('data <blob> end')
})

test('a long file path is not a blob', () => {
  // Arrange
  const text = 'src/components/authentication/handlers/session-store'

  // Assert
  expect(Redactor.redact(text, '')).toBe(text)
})

test('a long kebab case name is not a blob', () => {
  // Arrange
  const text = 'very-long-kebab-case-name-for-the-configuration-file'

  // Assert
  expect(Redactor.redact(text, '')).toBe(text)
})

test('a seven character commit hash is untouched', () => {
  // Assert
  expect(Redactor.redact('fixed in abc1234', '')).toBe('fixed in abc1234')
})

test('control characters are removed', () => {
  // Assert
  expect(Redactor.redact('a\u0000b\u0007c\u001Bd', '')).toBe('abcd')
})

test('newlines and tabs are kept', () => {
  // Assert
  expect(Redactor.redact('a\nb\tc', '')).toBe('a\nb\tc')
})

test('placeholders are not redacted again', () => {
  // Arrange
  const text = '<token> <email> <secret> <blob> <private-key> ~/x'

  // Assert
  expect(Redactor.redact(text, '')).toBe(text)
})

test('redacting twice gives the same result as redacting once', () => {
  // Arrange
  const once = Redactor.redact('password=abc mail a@b.co ghp_a1B2c3D4e5F6g7H8i9', '')

  // Assert
  expect(Redactor.redact(once, '')).toBe(once)
})

test('ordinary words are untouched', () => {
  // Assert
  expect(Redactor.redact('Please add a failing test for the parser.', '')).toBe('Please add a failing test for the parser.')
})

test('redact of a non-string is empty', () => {
  // Assert
  expect(Redactor.redact(undefined as never, '')).toBe('')
})

test('truncate leaves a short text uncut', () => {
  // Assert
  expect(Redactor.truncate('abc', 5)).toBe('abc')
})

test('truncate leaves a text of exactly the limit uncut', () => {
  // Assert
  expect(Redactor.truncate('abcde', 5)).toBe('abcde')
})

test('truncate cuts a long text and appends an ellipsis within the limit', () => {
  // Assert
  expect(Redactor.truncate('abcdef', 4)).toBe('abc…')
})

test('truncate never splits a surrogate pair', () => {
  // Assert
  expect(Redactor.truncate('ab😀cd', 4)).toBe('ab…')
})

test('truncate to less than one character gives an empty text', () => {
  // Assert
  expect(Redactor.truncate('abc', 0)).toBe('')
})

test('truncate with a NaN limit leaves the text uncut', () => {
  // Assert
  expect(Redactor.truncate('abc', Number.NaN)).toBe('abc')
})

test('clean redacts first and truncates the redacted text', () => {
  // Assert
  expect(Redactor.clean('mail jo@example.com now', 12, '')).toBe('mail <email…')
})

test('a hex-ish kebab name is replaced by a blob placeholder', () => {
  // Assert
  expect(Redactor.redact('key a1b2c3d4e5f6a7b-8c9d0e1f2a3b4c5-d6e7f8a9b0c1d2e end', '')).toBe('key <blob> end')
})

test('payment and webhook style tokens are replaced', () => {
  // Arrange
  const tokens = ['sk_live_a1B2c3D4e5F6g7H8', 'sk_test_a1B2c3D4e5F6g7H8', 'rk_live_a1B2c3D4e5F6g7H8', 'rk_test_a1B2c3D4e5F6g7H8', 'whsec_' + 'a1B2c3D4e5'.repeat(3), 'hf_' + 'a1B2c3D4e5'.repeat(3)]

  // Act
  const outs = tokens.map((token) => Redactor.redact(`use ${token} now`, ''))

  // Assert
  expect(outs).toEqual(tokens.map(() => 'use <token> now'))
})

test('short look-alikes of the payment and webhook prefixes are left alone', () => {
  // Arrange
  const text = 'sk_live_abc rk_test_abc whsec_abc hf_abc'

  // Assert
  expect(Redactor.redact(text, '')).toBe(text)
})

test('a bearer token is replaced', () => {
  // Assert
  expect(Redactor.redact('send Bearer x7f3a9c2e1b4d now', '')).toBe('send Bearer <token> now')
})

test('an authorization header never leaks its token', () => {
  // Assert
  expect(Redactor.redact('Authorization: Bearer x7f3a9c2e1b4d', '')).not.toContain('x7f3a9c2e1b4d')
})

test('a basic credential with digits or padding is replaced', () => {
  // Assert
  expect(Redactor.redact('Authorization Basic YWRtaW46aHVudGVyMg== ok', '')).toContain('Basic <token>')
})

test('the words basic understanding are left alone', () => {
  // Assert
  expect(Redactor.redact('a Basic understanding of it', '')).toBe('a Basic understanding of it')
})

test('credentials with an empty user are replaced', () => {
  // Assert
  expect(Redactor.redact('redis://:mypassw0rd@redis:6379', '')).toBe('redis://<credentials>@redis:6379')
})

test('a camel case secret key in JSON is hidden', () => {
  // Assert
  expect(Redactor.redact('{"secretKey": "abcd1234efgh"}', '')).toBe('{"secretKey": <secret>}')
})

test('a passphrase assignment is hidden', () => {
  // Assert
  expect(Redactor.redact('passphrase: correct horse', '')).toBe('passphrase: <secret>')
})

test('a standalone 32 digit hexadecimal key is replaced', () => {
  // Assert
  expect(Redactor.redact('hash 0123456789abcdef0123456789abcdef end', '')).toBe('hash <blob> end')
})

test('a 31 digit hexadecimal run is left alone', () => {
  // Arrange
  const text = 'hash 0123456789abcdef0123456789abcde end'

  // Assert
  expect(Redactor.redact(text, '')).toBe(text)
})

test('a PGP private key block is replaced', () => {
  // Assert
  expect(Redactor.redact('k -----BEGIN PGP PRIVATE KEY BLOCK-----\nabc\n-----END PGP PRIVATE KEY BLOCK----- z', '')).toBe('k <private-key> z')
})

test('the word author is not an auth assignment', () => {
  // Assert
  expect(Redactor.redact('author: John', '')).toBe('author: John')
})

test('a tokenizer with a colon is not a token assignment', () => {
  // Assert
  expect(Redactor.redact('tokenizer: x', '')).toBe('tokenizer: x')
})

test('a zero width character cannot split a token', () => {
  // Assert
  expect(Redactor.redact('use sk-ant-\u200Babcdefghijklmnop now', '')).toBe('use <token> now')
})

test('redact handles 1 MB of the same letter quickly', () => {
  // Act
  const ms = RedactorFixture.elapsed(() => Redactor.redact('a'.repeat(1000000), ''))

  // Assert
  expect(ms).toBeLessThan(500)
})

test('redact handles 1 MB of dotted letters quickly', () => {
  // Act
  const ms = RedactorFixture.elapsed(() => Redactor.redact('a.'.repeat(500000), ''))

  // Assert
  expect(ms).toBeLessThan(500)
})

test('redact handles 1 MB of repeated token openings quickly', () => {
  // Act
  const ms = RedactorFixture.elapsed(() => Redactor.redact('eyJ'.repeat(333333), ''))

  // Assert
  expect(ms).toBeLessThan(500)
})

test('clean bounds its work to the limit on a 1 MB text', () => {
  // Act
  const ms = RedactorFixture.elapsed(() => Redactor.clean('a '.repeat(500000), 400, ''))

  // Assert
  expect(ms).toBeLessThan(100)
})

test('clean still returns at most the limit on a 1 MB text', () => {
  // Assert
  expect(Redactor.clean('a '.repeat(500000), 400, '').length).toBe(400)
})

test('a basic authorization header is replaced', () => {
  // Assert
  expect(Redactor.redact('Authorization: Basic dXNlcjpsZXRtZWlu', '')).toBe('Authorization: Basic <token>')
})

test('basic understanding of it is left alone', () => {
  // Assert
  expect(Redactor.redact('Basic understanding of it', '')).toBe('Basic understanding of it')
})

test('an arrow operator assignment is hidden', () => {
  // Assert
  expect(Redactor.redact("password => 'Tr0ub4dor&3'", '')).toBe('password => <secret>')
})

test('a walrus operator assignment is hidden', () => {
  // Assert
  expect(Redactor.redact('PASSWORD := "x"', '')).toBe('PASSWORD := <secret>')
})

test('a DB_PASS assignment is hidden', () => {
  // Assert
  expect(Redactor.redact('DB_PASS=abc123', '')).toBe('DB_PASS=<secret>')
})

test('bypass is not a pass assignment', () => {
  // Assert
  expect(Redactor.redact('bypass=1', '')).toBe('bypass=1')
})

test('a password flag hides its value', () => {
  // Assert
  expect(Redactor.redact('run --password x now', '')).toBe('run --password <secret> now')
})

test('a token flag hides its value', () => {
  // Assert
  expect(Redactor.redact('run --token abc now', '')).toBe('run --token <secret> now')
})

test('an api key flag hides its value', () => {
  // Assert
  expect(Redactor.redact('run --api-key abc now', '')).toBe('run --api-key <secret> now')
})

test('a mysql glued password is hidden', () => {
  // Assert
  expect(Redactor.redact('mysql -pSecret db', '')).toBe('mysql -p<secret> db')
})

test('a mysql prompt flag is left alone', () => {
  // Assert
  expect(Redactor.redact('mysql -p db', '')).toBe('mysql -p db')
})

test('a curl user password is hidden', () => {
  // Assert
  expect(Redactor.redact('curl -u bob:pw https://x.io', '')).toBe('curl -u bob:<secret> https://x.io')
})

test('an openssl pass phrase argument is hidden', () => {
  // Assert
  expect(Redactor.redact('openssl rsa -passin pass:X', '')).toBe('openssl rsa -passin pass:<secret>')
})

test('max_tokens is not a token assignment', () => {
  // Assert
  expect(Redactor.redact('max_tokens: 4000', '')).toBe('max_tokens: 4000')
})

test('secrets inherit is not a secret assignment', () => {
  // Assert
  expect(Redactor.redact('secrets: inherit', '')).toBe('secrets: inherit')
})

test('default ignorable characters cannot split a token', () => {
  // Arrange
  const invisible = ['\uFE0F', '\u3164', '\u180B', '\u2800']

  // Act
  const outs = invisible.map((char) => Redactor.redact(`use sk-ant-${char}abcdefghijklmnop now`, ''))

  // Assert
  expect(outs).toEqual(invisible.map(() => 'use <token> now'))
})

test('ghr and ya29 tokens are replaced', () => {
  // Assert
  expect(Redactor.redact('a ghr_a1B2c3D4e5F6g7H8i9 b ya29.' + 'a1B2c3D4e5'.repeat(2) + ' c', '')).toBe('a <token> b <token> c')
})

test('a password containing an at sign is hidden whole', () => {
  // Assert
  expect(Redactor.redact('postgres://admin:p@ss@db/app', '')).toBe('postgres://<credentials>@db/app')
})

test('redact handles 1 MB of mysql repeated quickly', () => {
  // Act
  const ms = RedactorFixture.elapsed(() => Redactor.redact('mysql '.repeat(170000), ''))

  // Assert
  expect(ms).toBeLessThan(500)
})

test('redact handles 1 MB of password colons repeated quickly', () => {
  // Act
  const ms = RedactorFixture.elapsed(() => Redactor.redact('password: '.repeat(100000), ''))

  // Assert
  expect(ms).toBeLessThan(500)
})

test('a JSON secret with an escaped quote is hidden to its closing quote', () => {
  // Assert
  expect(Redactor.redact('{"password":"hunter\\"2 correct horse"}', '')).not.toContain('correct horse')
})

test('a single quoted secret with an escaped quote is hidden whole', () => {
  // Assert
  expect(Redactor.redact("password='a\\'b c'", '')).toBe('password=<secret>')
})

test('clean keeps the limit on a long Japanese text', () => {
  // Act
  const out = Redactor.clean('あ'.repeat(8000), 400, '')

  // Assert
  expect(out.length).toBe(400)
})
