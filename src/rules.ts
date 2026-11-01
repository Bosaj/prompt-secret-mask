/** What can be found in a prompt. Order matters: when two rules overlap, the earlier one wins. */

export type Category = 'secret' | 'personal' | 'network'

export interface Rule {
  id: string
  /** Name used in the placeholder: [[GITHUB_TOKEN_1]] */
  label: string
  category: Category
  pattern: RegExp
  /** The capture group holding the value, when the pattern also matches what surrounds it. */
  group?: number
  validate?: (value: string, match: RegExpExecArray) => boolean
  /** Only counts when this appears shortly before the value: for formats that look like anything else. */
  context?: RegExp
}

// ---- Validators: a checksum turns "looks like a number" into "is one"

export function luhn(digits: string): boolean {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

/** Remainder of a long number (as a string of digits) divided by 97. */
export function mod97(digits: string): number {
  let rest = 0
  for (const ch of digits) rest = (rest * 10 + (ch.charCodeAt(0) - 48)) % 97
  return rest
}

export function validIban(raw: string): boolean {
  const iban = raw.replace(/[\s-]/g, '').toUpperCase()
  if (iban.length < 15 || iban.length > 34) return false
  const moved = iban.slice(4) + iban.slice(0, 4)
  const digits = moved.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  return mod97(digits) === 1
}

/** A Moroccan RIB is 24 digits whose last two are a key: the whole number divides by 97. */
export const validRib = (raw: string) => {
  const digits = raw.replace(/[\s-]/g, '')
  return digits.length === 24 && mod97(digits) === 0
}

export function entropy(s: string): number {
  const counts = new Map<string, number>()
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  let h = 0
  for (const n of counts.values()) {
    const p = n / s.length
    h -= p * Math.log2(p)
  }
  return h
}

/** Values people write in examples and code rather than real secrets. */
const NOT_A_VALUE = /^(?:true|false|null|none|undefined|string|number|boolean|required|optional|password|secret|token|changeme|example|your[-_ ]?\w*|my[-_ ]?\w*|x{3,}|\*{3,}|\.{3,}|<.*>|\{.*\}|\$\{?.*\}?|%\w+%|process\.env\S*|os\.environ\S*|env\.\S*|import\.meta\S*|config\.\S*|settings\.\S*|\w+\(.*|\w+\.\w+.*|\[.*)$/i

/** A value that is really code: tokens[1], ==9&&this.x, a=>b */
const CODE_LIKE = /^[=!<>(&|?{[]|^\w+\[|={2,}|!=|&&|\|\||=>|[{}]|\(\)/

function realAssignment(value: string, match: RegExpExecArray): boolean {
  if (NOT_A_VALUE.test(value) || CODE_LIKE.test(value) || /fake|dummy|mock|sample|placeholder|example|foobar/i.test(value)) return false
  if (value.length < 8) return false
  const text = match[0]
  // The whole name, including what comes before the keyword, which the pattern doesn't read
  const before = /[\w.-]{0,64}$/.exec(match.input.slice(Math.max(0, match.index - 64), match.index))?.[0] ?? ''
  const name = before + text
  // These count or split tokens: they don't hold one
  if (/tokeni[sz]|max[_-]?tokens?|tokens?[_-]?(?:count|limit|usage|length|size|budget)/i.test(name)) return false
  const quoted = /["'`]\s*$/.test(text) || new RegExp(`["'\`]${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text)
  const envStyle = /^[A-Z0-9_.-]+\s*=/.test(name)
  const mixed = /\d/.test(value) && /[a-zA-Z]/.test(value)
  const symbols = /[^A-Za-z0-9_-]/.test(value)
  if (!quoted && !envStyle && !mixed && !symbols) return false
  return entropy(value) >= 2.5
}

function validIpv4(ip: string, match: RegExpExecArray): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.some((p) => p > 255)) return false
  if (ip.startsWith('127.') || ip === '0.0.0.0' || ip.startsWith('255.255.') || ip.startsWith('169.254.')) return false
  // 1.2.3.4 in "version 1.2.3.4" or "v1.2.3.4" is a version, not an address
  const before = match.input.slice(Math.max(0, match.index - 128), match.index).toLowerCase()
  // user:pass@10.0.0.1 is an address, and pkg@1.2.3.4 is a version: the colon tells them apart
  if (/^[^\s:/]*@$/.test(/\S*$/.exec(before)?.[0] ?? '')) return false
  return !/(?:version|ver\.?|release|v|sections?[ -]?\[?|§)\s*[:=]?\s*$/.test(before)
}

function validIpv6(ip: string): boolean {
  if (ip === '::' || ip === '::1' || /^\d{1,2}:\d{2}(:\d{2})?$/.test(ip)) return false
  const compressed = ip.includes('::')
  const groups = ip.split(':').filter(Boolean)
  if (!compressed && groups.length !== 8) return false
  if (compressed && groups.length < 3 && !groups.some((g) => g.length === 4)) return false
  return groups.every((g) => g.length <= 4)
}

function validCard(raw: string): boolean {
  const digits = raw.replace(/[\s-]/g, '')
  return digits.length >= 13 && digits.length <= 19 && /^[3-6]/.test(digits) && !/^(\d)\1+$/.test(digits) && luhn(digits)
}

const digitCount = (s: string) => s.replace(/\D/g, '').length

export const RULES: Rule[] = [
  // ---- Secrets with a recognisable shape
  { id: 'private-key', label: 'PRIVATE_KEY', category: 'secret', pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g },
  { id: 'anthropic-key', label: 'ANTHROPIC_KEY', category: 'secret', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { id: 'openai-key', label: 'OPENAI_KEY', category: 'secret', pattern: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g, validate: (v) => /\d/.test(v) && /[a-zA-Z]/.test(v.slice(3)) },
  { id: 'github-token', label: 'GITHUB_TOKEN', category: 'secret', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/g },
  { id: 'gitlab-token', label: 'GITLAB_TOKEN', category: 'secret', pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'aws-access-key', label: 'AWS_ACCESS_KEY', category: 'secret', pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g },
  { id: 'aws-secret', label: 'AWS_SECRET', category: 'secret', pattern: /\b(?:aws_secret_access_key|aws_secret|secret_access_key)["']?\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/gi, group: 1 },
  { id: 'stripe-key', label: 'STRIPE_KEY', category: 'secret', pattern: /\b(?:(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,})\b/g },
  { id: 'google-api-key', label: 'GOOGLE_API_KEY', category: 'secret', pattern: /\bAIza[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])/g },
  { id: 'slack-token', label: 'SLACK_TOKEN', category: 'secret', pattern: /\bxox[abeprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: 'slack-webhook', label: 'SLACK_WEBHOOK', category: 'secret', pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]{20,}/g },
  { id: 'huggingface-token', label: 'HUGGINGFACE_TOKEN', category: 'secret', pattern: /\bhf_[A-Za-z0-9]{30,}\b/g },
  { id: 'npm-token', label: 'NPM_TOKEN', category: 'secret', pattern: /\bnpm_[A-Za-z0-9]{36,}\b/g },
  { id: 'sendgrid-key', label: 'SENDGRID_KEY', category: 'secret', pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g },
  { id: 'twilio-key', label: 'TWILIO_KEY', category: 'secret', pattern: /\bSK[0-9a-f]{32}\b/g },
  { id: 'jwt', label: 'JWT', category: 'secret', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  // ---- Secrets recognised by where they sit
  { id: 'url-password', label: 'URL_PASSWORD', category: 'secret', pattern: /\b[a-z][a-z0-9+.-]{0,30}:\/\/[^\s:@/]{1,256}:([^\s@/]{1,512})@/gi, group: 1, validate: (v) => !/^(password|\$\{?\w+\}?|<\w+>|pass|xxx+|\*+)$/i.test(v) },
  { id: 'bearer-token', label: 'BEARER_TOKEN', category: 'secret', pattern: /\bbearer\s+([A-Za-z0-9._~+/=-]{20,})/gi, group: 1, validate: (v) => /\d/.test(v) && entropy(v) >= 3 },
  {
    id: 'assigned-secret',
    label: 'SECRET',
    category: 'secret',
    pattern: /(?:password|passwd|pwd|secret|api[_-]?key|apikey|auth[_-]?token|access[_-]?token|refresh[_-]?token|private[_-]?key|client[_-]?secret|token)[\w.-]{0,40}["'`]?\s{0,8}(?::=|=>|=|:)\s{0,8}["'`]?([^\s"'`,;]{8,1024})["'`]?/gi,
    group: 1,
    validate: realAssignment,
  },
  // ---- Personal data
  { id: 'iban', label: 'IBAN', category: 'personal', pattern: /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{2,4}){3,8}\b/g, validate: validIban },
  { id: 'ma-rib', label: 'RIB', category: 'personal', pattern: /(?<![\w./-])\d{3}[ -]?\d{3}[ -]?\d{16}[ -]?\d{2}(?![\w-])/g, validate: validRib },
  { id: 'card', label: 'CARD', category: 'personal', pattern: /(?<![\w./-])(?:\d[ -]?){12,18}\d(?![\w-])/g, validate: validCard },
  { id: 'email', label: 'EMAIL', category: 'personal', pattern: /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}\b/g },
  { id: 'ma-phone', label: 'PHONE', category: 'personal', pattern: /(?<![\w+./-])(?:\+212|00212|0)[ .-]?\(?0?\)?[ .-]?[5-7](?:[ .-]?\d){8}(?![\w])/g },
  { id: 'intl-phone', label: 'PHONE', category: 'personal', pattern: /(?<![\w+])\+\d{1,3}[ .-]?(?:\(?\d{1,4}\)?[ .-]?){2,5}\d{2,4}(?!\d)/g, validate: (v) => digitCount(v) >= 9 && digitCount(v) <= 15 },
  {
    id: 'ma-cin',
    label: 'CIN',
    category: 'personal',
    pattern: /\b[A-Z]{1,2}[ -]?\d{4,7}\b/g,
    context: /(?:\bcin\b|c\.i\.n|carte nationale|carte d'identit|national id|id card|البطاقة|بطاقة|ب\.و|رقم التعريف)/i,
  },
  { id: 'ma-ice', label: 'ICE', category: 'personal', pattern: /(?<!\d)\d{15}(?!\d)/g, context: /(?:\bice\b|identifiant commun|التعريف الموحد)/i },
  // ---- Network
  { id: 'ipv4', label: 'IP', category: 'network', pattern: /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.]*\d)/g, validate: validIpv4 },
  { id: 'ipv6', label: 'IP', category: 'network', pattern: /(?<![\w:])(?:[0-9a-fA-F]{1,4}:){1,7}(?::?[0-9a-fA-F]{1,4}){1,7}(?![\w:])|(?<![\w:])(?:[0-9a-fA-F]{1,4}:){1,7}:(?![\w:])/g, validate: validIpv6 },
]
