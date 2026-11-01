import { describe, expect, it } from 'vitest'
import { mask, StreamUnmasker, Vault } from './mask.js'
import { entropy, luhn, mod97, validIban, validRib } from './rules.js'

/**
 * Every secret-shaped value is assembled here at runtime, from parts, and is fake. Writing one out
 * whole would trip secret scanners, which is exactly what they are for.
 */
const a = 'a1B2'
const FAKE = {
  github: 'ghp' + '_' + a.repeat(9),
  githubFine: 'github' + '_pat_' + a.repeat(11) + '_x',
  gitlab: 'glpat' + '-' + a.repeat(6),
  anthropic: 'sk' + '-ant-api03-' + a.repeat(12),
  openai: 'sk' + '-proj-' + a.repeat(12),
  openaiOld: 'sk' + '-' + a.repeat(12),
  aws: 'AK' + 'IA' + 'IOSFODNN7ABCDEFG',
  awsSecret: 'wJalrXUtnFEMI' + '/K7MDENG/bPxRfiCYEXAMPLEKEY',
  stripe: 'sk' + '_live_' + a.repeat(6),
  google: 'AI' + 'za' + 'SyD' + a.repeat(8).slice(0, 32),
  slack: 'xox' + 'b-1234567890-' + a.repeat(5),
  hf: 'hf' + '_' + a.repeat(9),
  npm: 'npm' + '_' + a.repeat(9),
  sendgrid: 'SG' + '.' + a.repeat(5) + '.' + a.repeat(6),
  twilio: 'SK' + '0123456789abcdef'.repeat(2),
  jwt: 'eyJ' + 'hbGciOiJIUzI1NiJ9' + '.eyJ' + 'zdWIiOiIxMjM0NTY3ODkwIn0' + '.' + 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  pem: '-----BEGIN ' + 'RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA7\nabc+def/ghi=\n-----END ' + 'RSA PRIVATE KEY-----',
}

const found = (text: string, options = {}) => mask(text, new Vault(), options).findings.map((f) => f.rule)
const hidden = (text: string, value: string) => {
  const r = mask(text, new Vault())
  expect(r.masked, text).not.toContain(value)
  return r
}

describe('secrets with a known shape', () => {
  const cases: [string, string, string][] = [
    ['github-token', FAKE.github, 'GITHUB_TOKEN'],
    ['github-token', FAKE.githubFine, 'GITHUB_TOKEN'],
    ['gitlab-token', FAKE.gitlab, 'GITLAB_TOKEN'],
    ['anthropic-key', FAKE.anthropic, 'ANTHROPIC_KEY'],
    ['openai-key', FAKE.openai, 'OPENAI_KEY'],
    ['openai-key', FAKE.openaiOld, 'OPENAI_KEY'],
    ['aws-access-key', FAKE.aws, 'AWS_ACCESS_KEY'],
    ['stripe-key', FAKE.stripe, 'STRIPE_KEY'],
    ['google-api-key', FAKE.google, 'GOOGLE_API_KEY'],
    ['slack-token', FAKE.slack, 'SLACK_TOKEN'],
    ['huggingface-token', FAKE.hf, 'HUGGINGFACE_TOKEN'],
    ['npm-token', FAKE.npm, 'NPM_TOKEN'],
    ['sendgrid-key', FAKE.sendgrid, 'SENDGRID_KEY'],
    ['twilio-key', FAKE.twilio, 'TWILIO_KEY'],
    ['jwt', FAKE.jwt, 'JWT'],
    ['private-key', FAKE.pem, 'PRIVATE_KEY'],
  ]
  for (const [rule, value, label] of cases) {
    it(`finds ${rule} (${label}) in a sentence`, () => {
      const r = hidden(`please check why this fails: ${value} thanks`, value)
      expect(r.findings[0]?.rule).toBe(rule)
      expect(r.masked).toBe(`please check why this fails: [[${label}_1]] thanks`)
    })
  }

  it('keeps an Anthropic key from being read as an OpenAI one', () => {
    expect(found(FAKE.anthropic)).toEqual(['anthropic-key'])
  })
})

describe('secrets found by where they sit', () => {
  it('masks only the password in a URL', () => {
    const pass = 'S3cr3t-pass'
    const r = hidden(`postgres://admin:${pass}@db.example.com:5432/app`, pass)
    expect(r.masked).toBe('postgres://admin:[[URL_PASSWORD_1]]@db.example.com:5432/app')
  })

  it('finds a token in a git remote', () => {
    const r = hidden(`https://x-access-token:${FAKE.github}@github.com/o/r.git`, FAKE.github)
    expect(r.masked).toBe('https://x-access-token:[[GITHUB_TOKEN_1]]@github.com/o/r.git')
  })

  it('finds bearer tokens', () => {
    const token = 'abc123DEF456ghi789JKL012'
    expect(hidden(`Authorization: Bearer ${token}`, token).masked).toBe('Authorization: Bearer [[BEARER_TOKEN_1]]')
  })

  it('finds assigned secrets, in env files, code, JSON and YAML', () => {
    const v = 'h7Gf2kLq9Zx1'
    for (const line of [`API_KEY=${v}`, `password = "${v}"`, `const apiKey = '${v}'`, `"client_secret": "${v}"`, `db_password: ${v}`, `TOKEN=${v}`, `AWS_SECRET_ACCESS_KEY=${FAKE.awsSecret}`]) {
      const value = line.includes('AWS') ? FAKE.awsSecret : v
      expect(hidden(line, value).findings.length, line).toBe(1)
    }
  })

  it('keeps the name, hides the value', () => {
    expect(mask('API_KEY=h7Gf2kLq9Zx1 next', new Vault()).masked).toBe('API_KEY=[[SECRET_1]] next')
  })

  it('leaves code and examples that hold no secret', () => {
    for (const line of [
      'const password = process.env.DB_PASSWORD',
      'password: string',
      'token: z.string().min(8)',
      'apiKey: config.apiKey',
      'API_KEY=<your-key-here>',
      'password = "changeme"',
      'API_KEY=${API_KEY}',
      'secret: your_secret_here',
      'API_KEY=xxxxxxxxxxxx',
      'const token = getToken()',
      'tokenizer: gpt2-tokenizer',
      'function refreshToken(token: string) {}',
      'max_tokens: 4096000',
      'tokens_used = 12345678',
      'postgres://user:password@localhost/db',
      'the password field is required',
    ]) {
      expect(found(line, { categories: ['secret'] }), line).toEqual([])
    }
  })
})

describe('Moroccan and personal data', () => {
  it('finds Moroccan phone numbers in every usual form', () => {
    for (const phone of ['+212 661 234 567', '+212661234567', '00212 6 61 23 45 67', '0661234567', '06 61 23 45 67', '0661-23-45-67', '05 37 12 34 56', '+212 (0) 661 234 567', '07.12.34.56.78']) {
      expect(hidden(`اتصل بي على ${phone} من فضلك`, phone).findings[0]?.label, phone).toBe('PHONE')
    }
  })

  it('finds other international numbers, not plain numbers', () => {
    expect(found('+33 6 12 34 56 78')).toEqual(['intl-phone'])
    expect(found('+1 415 555 2671')).toEqual(['intl-phone'])
    expect(found('the total is 1234567890 items')).toEqual([])
  })

  it('finds a CIN only next to words that say so', () => {
    expect(found('CIN: AB123456')).toEqual(['ma-cin'])
    expect(found("N° de carte nationale AB123456")).toEqual(['ma-cin'])
    expect(found('رقم البطاقة الوطنية: J123456')).toEqual(['ma-cin'])
    expect(found('The model AB123456 is on sale')).toEqual([])
    expect(found('see ticket PR12345')).toEqual([])
  })

  it('validates an IBAN checksum', () => {
    expect(validIban('MA64 0115 1900 0001 2050 0053 4921')).toBe(true) // the registry's example for Morocco
    expect(validIban('FR76 3000 6000 0112 3456 7890 189')).toBe(true)
    expect(validIban('MA64 0115 1900 0001 2050 0053 4922')).toBe(false)
    expect(found('IBAN MA64 0115 1900 0001 2050 0053 4921')).toEqual(['iban'])
    expect(found('code AB12 CDEF GHIJ KLMN OPQR')).toEqual([])
  })

  it('validates a Moroccan RIB key', () => {
    expect(validRib('011 519 0000012050005349 21')).toBe(true)
    expect(validRib('011 519 0000012050005349 22')).toBe(false)
    expect(found('mon RIB 011 519 0000012050005349 21 merci')).toEqual(['ma-rib'])
    expect(found('reference 011519000001205000534922')).toEqual([])
  })

  it('validates a card number', () => {
    expect(found('Visa 4111 1111 1111 1111')).toEqual(['card'])
    expect(found('Mastercard 5555-5555-5555-4444')).toEqual(['card'])
    expect(found('order 4111 1111 1111 1112')).toEqual([])
    expect(found('0000 0000 0000 0000')).toEqual([])
  })

  it('finds an ICE only next to its name', () => {
    expect(found('ICE: 001234567000089')).toEqual(['ma-ice'])
    expect(found('count 001234567000089')).toEqual([])
  })

  it('finds emails', () => {
    expect(found('écris à ali.benali+test@example.co.ma stp')).toEqual(['email'])
    expect(found('import x from "@scope/pkg"')).toEqual([])
    expect(found('user@localhost')).toEqual([])
  })
})

describe('network addresses', () => {
  it('finds IPv4 and IPv6 addresses', () => {
    expect(found('server at 192.168.1.20 is down')).toEqual(['ipv4'])
    expect(found('8.8.8.8')).toEqual(['ipv4'])
    expect(found('host 2001:db8:85a3:8d3:1319:8a2e:370:7348 down')).toEqual(['ipv6'])
    expect(found('host 2001:db8::8a2e:370:7334 down')).toEqual(['ipv6'])
  })

  it('finds the address behind credentials in a URL', () => {
    const r = mask('postgres://admin:S3cr3t-pass@10.20.0.7:5432/shop', new Vault())
    expect(r.masked).toBe('postgres://admin:[[URL_PASSWORD_1]]@[[IP_1]]:5432/shop')
    const long = mask('postgres://admin:a-much-longer-Passw0rd-than-usual@10.20.0.7/shop', new Vault())
    expect(long.masked).toBe('postgres://admin:[[URL_PASSWORD_1]]@[[IP_1]]/shop')
  })

  it('leaves versions, loopback, times and masks', () => {
    for (const t of ['127.0.0.1', '0.0.0.0', 'version 1.2.3.4', 'v1.2.3.4', 'lodash@4.17.21.1', '255.255.255.0', '999.1.1.1', '1.2.3', '::1', 'at 12:30:45', 'a::b', 'std::vector', 'Foo::Bar::baz']) {
      expect(found(t), t).toEqual([])
    }
  })
})

describe('numbers that are something else', () => {
  it('does not read a git hash as a card or a phone', () => {
    for (const t of ['commit/ddb4484adc3b45c4396632611556055f3b2f5990', 'commit/24968a2aa55109520e2ec0532343224e11a6e311', 'is-string/commit/0777977757a85a1db758']) {
      expect(found(t, { categories: ['personal'] }), t).toEqual([])
    }
  })

  it('does not read a DOI, a path or a long id as a phone', () => {
    for (const t of ['https://doi.org/10.1101/2022.07.20.500902', 'files/0612345678.png', 'id_0612345678x', 'v.0612345678']) {
      expect(found(t, { categories: ['personal'] }), t).toEqual([])
    }
  })

  it('does not read a section number as an address', () => {
    for (const t of ['rfc2616#section-8.1.2.2', 'see sections [7.6.1.1](http://x)', 'section 11.6.2.1', '§ 4.3.2.1']) {
      expect(found(t, { categories: ['network'] }), t).toEqual([])
    }
  })

  it('does not read code as a secret', () => {
    for (const t of ['case"Token":return{type:e.type,value:e.v}', "{ token: 'mock-token' }", 'token = tokens[1];', 'this.tokenType===9&&this.source.charCodeAt(this.tokenStart)===t}', "const r = {token: 'fake_user_token'}", 'token=>tokenizer.next()', 'secret: ${SECRET_VALUE}']) {
      expect(found(t, { categories: ['secret'] }), t).toEqual([])
    }
  })
})

describe('placeholders', () => {
  it('gives one value one placeholder, across messages', () => {
    const vault = new Vault()
    const first = mask(`key ${FAKE.github} and ${FAKE.github}`, vault)
    expect(first.masked).toBe('key [[GITHUB_TOKEN_1]] and [[GITHUB_TOKEN_1]]')
    expect(mask(`again ${FAKE.github}`, vault).masked).toBe('again [[GITHUB_TOKEN_1]]')
    expect(vault.size).toBe(1)
  })

  it('numbers different values apart', () => {
    const other = 'ghp' + '_' + 'z9Y8'.repeat(9)
    expect(mask(`${FAKE.github} ${other}`, new Vault()).masked).toBe('[[GITHUB_TOKEN_1]] [[GITHUB_TOKEN_2]]')
  })

  it('restores the exact original text', () => {
    const text = `مرحبا, my key is ${FAKE.github}, CIN: AB123456, call +212 661 234 567 or a@b.co\nDB postgres://u:P4ssw0rd9x@h/d`
    const vault = new Vault()
    const { masked } = mask(text, vault)
    for (const v of [FAKE.github, 'AB123456', '+212 661 234 567', 'a@b.co', 'P4ssw0rd9x']) expect(masked).not.toContain(v)
    expect(vault.unmask(masked)).toBe(text)
  })

  it('leaves unknown placeholders alone and does not mask its own output', () => {
    const vault = new Vault()
    expect(vault.unmask('see [[GITHUB_TOKEN_9]]')).toBe('see [[GITHUB_TOKEN_9]]')
    const once = mask(`x ${FAKE.github}`, vault).masked
    expect(mask(once, vault).masked).toBe(once)
  })

  it('filters by category and rule', () => {
    const text = `${FAKE.github} a@b.co 8.8.8.8`
    expect(found(text, { categories: ['secret'] })).toEqual(['github-token'])
    expect(found(text, { categories: ['personal'] })).toEqual(['email'])
    expect(found(text, { disabled: ['email'] })).toEqual(['github-token', 'ipv4'])
  })

  it('can clear what it remembers', () => {
    const vault = new Vault()
    const { masked } = mask(FAKE.github, vault)
    vault.clear()
    expect(vault.unmask(masked)).toBe(masked)
    expect(vault.size).toBe(0)
  })
})

describe('restoring a stream', () => {
  const setup = () => {
    const vault = new Vault()
    const { masked } = mask(`use ${FAKE.github} now`, vault)
    return { vault, masked }
  }

  it('restores a placeholder split at every possible point', () => {
    const { vault, masked } = setup()
    const expected = `use ${FAKE.github} now`
    for (let i = 0; i <= masked.length; i++) {
      const s = new StreamUnmasker(vault)
      expect(s.push(masked.slice(0, i)) + s.push(masked.slice(i)) + s.flush(), `cut at ${i}`).toBe(expected)
    }
  })

  it('restores when each character arrives alone', () => {
    const { vault, masked } = setup()
    const s = new StreamUnmasker(vault)
    let out = ''
    for (const ch of masked) out += s.push(ch)
    expect(out + s.flush()).toBe(`use ${FAKE.github} now`)
  })

  it('does not hold ordinary text back', () => {
    const s = new StreamUnmasker(new Vault())
    expect(s.push('array[0] and [note]')).toBe('array[0] and [note]')
    expect(s.push(' [[lowercase')).toBe(' [[lowercase')
  })

  it('gives back what it held when the stream ends', () => {
    const s = new StreamUnmasker(new Vault())
    expect(s.push('text [[ABC')).toBe('text ')
    expect(s.flush()).toBe('[[ABC')
  })
})

describe('hostile input', () => {
  const inputs: Record<string, string> = {
    letters: 'a'.repeat(200_000),
    'words with dots': 'abc.'.repeat(50_000),
    digits: '1'.repeat(200_000),
    'spaced digits': '12 '.repeat(70_000),
    colons: 'ab:'.repeat(70_000),
    'secret names': 'token '.repeat(35_000),
    'long name': `${'x'.repeat(100_000)}token${'x'.repeat(100_000)}`,
    brackets: '[['.repeat(100_000),
    'almost an email': `${'a.'.repeat(50_000)}@`,
    'almost a key block': `-----BEGIN PRIVATE KEY-----${'a'.repeat(200_000)}`,
    'many emails': 'a@b.co '.repeat(30_000),
  }
  for (const [name, text] of Object.entries(inputs)) {
    it(`handles 200 KB of ${name} quickly`, () => {
      const t0 = performance.now()
      mask(text, new Vault())
      expect(performance.now() - t0).toBeLessThan(2500)
    })
  }
})

describe('helpers', () => {
  it('checks numbers', () => {
    expect(luhn('4111111111111111')).toBe(true)
    expect(luhn('4111111111111112')).toBe(false)
    expect(mod97('97')).toBe(0)
    expect(mod97('98')).toBe(1)
    expect(entropy('aaaa')).toBe(0)
    expect(entropy('abcd')).toBe(2)
  })
})
