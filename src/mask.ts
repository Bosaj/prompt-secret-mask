import { RULES, type Category, type Rule } from './rules.js'

export interface Finding {
  rule: string
  label: string
  category: Category
  start: number
  end: number
  placeholder: string
}

export interface MaskResult {
  masked: string
  /** Where each value was in the original text. The values themselves are only in the vault. */
  findings: Finding[]
}

export interface MaskOptions {
  categories?: Category[]
  /** Rule ids to turn off. */
  disabled?: string[]
}

const CONTEXT_WINDOW = 48
const PLACEHOLDER = /\[\[[A-Z0-9_]+_\d+\]\]/g

/**
 * Holds the link between real values and their placeholders, in memory only. The same value always
 * gets the same placeholder, so a model can still reason about "the same key" across a conversation.
 */
export class Vault {
  private readonly toPlaceholder = new Map<string, string>()
  private readonly toValue = new Map<string, string>()
  private readonly counters = new Map<string, number>()

  add(label: string, value: string): string {
    const known = this.toPlaceholder.get(value)
    if (known) return known
    const n = (this.counters.get(label) ?? 0) + 1
    this.counters.set(label, n)
    const placeholder = `[[${label}_${n}]]`
    this.toPlaceholder.set(value, placeholder)
    this.toValue.set(placeholder, value)
    return placeholder
  }

  get size() {
    return this.toValue.size
  }

  /** Put the real values back. Unknown placeholders are left as they are. */
  unmask(text: string): string {
    return text.replace(PLACEHOLDER, (p) => this.toValue.get(p) ?? p)
  }

  clear() {
    this.toPlaceholder.clear()
    this.toValue.clear()
    this.counters.clear()
  }
}

interface Span {
  rule: Rule
  order: number
  start: number
  end: number
}

function findSpans(text: string, rules: Rule[]): Span[] {
  const spans: Span[] = []
  rules.forEach((rule, order) => {
    // The d flag gives the exact position of the captured value
    const pattern = new RegExp(rule.pattern.source, `${rule.pattern.flags}d`)
    let m: RegExpExecArray | null
    while ((m = pattern.exec(text))) {
      if (m[0].length === 0) {
        pattern.lastIndex++
        continue
      }
      const value = rule.group ? (m[rule.group] ?? '') : m[0]
      if (!value) continue
      const start = rule.group ? (m.indices?.[rule.group]?.[0] ?? m.index) : m.index
      if (rule.validate && !rule.validate(value, m)) continue
      if (rule.context && !rule.context.test(text.slice(Math.max(0, start - CONTEXT_WINDOW), start))) continue
      spans.push({ rule, order, start, end: start + value.length })
    }
  })
  return spans
}

/** Replace everything found with placeholders. Text that is already a placeholder stays one. */
export function mask(text: string, vault: Vault, options: MaskOptions = {}): MaskResult {
  const categories = options.categories ?? (['secret', 'personal', 'network'] as Category[])
  const rules = RULES.filter((r) => categories.includes(r.category) && !options.disabled?.includes(r.id))
  // Earlier rules win; then the longer match. Anything overlapping a winner is dropped.
  const spans = findSpans(text, rules).sort((a, b) => a.order - b.order || b.end - b.start - (a.end - a.start))
  const taken = new Uint8Array(text.length)
  const chosen: Span[] = []
  for (const s of spans) {
    if (taken.subarray(s.start, s.end).includes(1)) continue
    taken.fill(1, s.start, s.end)
    chosen.push(s)
  }
  chosen.sort((a, b) => a.start - b.start)

  let masked = ''
  let at = 0
  const findings: Finding[] = []
  for (const s of chosen) {
    const placeholder = vault.add(s.rule.label, text.slice(s.start, s.end))
    masked += text.slice(at, s.start) + placeholder
    at = s.end
    findings.push({ rule: s.rule.id, label: s.rule.label, category: s.rule.category, start: s.start, end: s.end, placeholder })
  }
  return { masked: masked + text.slice(at), findings }
}

/**
 * Restores values in a stream, where a placeholder can arrive split across chunks ("[[GITH" + "UB_1]]").
 * Holds back only what could still become a placeholder.
 */
export class StreamUnmasker {
  private held = ''
  private readonly vault: Vault

  constructor(vault: Vault) {
    this.vault = vault
  }

  push(chunk: string): string {
    const text = this.held + chunk
    const open = text.lastIndexOf('[')
    let cut = text.length
    if (open >= 0) {
      // A partial "[[LABEL_1]" or "[" at the very end may still complete
      const start = text[open - 1] === '[' ? open - 1 : open
      if (/^\[(?:\[(?:[A-Z0-9_]*(?:\])?)?)?$/.test(text.slice(start))) cut = start
    }
    this.held = text.slice(cut)
    return this.vault.unmask(text.slice(0, cut))
  }

  /** The stream ended: whatever was held back is ordinary text. */
  flush(): string {
    const rest = this.vault.unmask(this.held)
    this.held = ''
    return rest
  }
}
