import { Check, Copy, Eraser, KeyRound, Lock, Network, Sparkles, User } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { mask, Vault, type MaskResult } from '../src/mask.js'
import type { Category } from '../src/rules.js'
import { LANGS, STRINGS, initialLang, type Lang } from './strings.js'

/** Assembled from parts at runtime, and fake: written whole, it would trip secret scanners. */
const example = () =>
  [
    'Why does this fail in production?',
    '',
    `DATABASE_URL=postgres://admin:${'Pr0d' + '-Passw0rd'}@10.20.0.7:5432/shop`,
    `GITHUB_TOKEN=${'ghp' + '_' + 'a1B2'.repeat(9)}`,
    `OPENAI_API_KEY=${'sk' + '-proj-' + 'x9Y8'.repeat(12)}`,
    '',
    'الزبون: Ali Benali, ali.benali@example.ma, +212 661 234 567',
    'CIN: AB123456, RIB 011 519 0000012050005349 21',
  ].join('\n')

const ALL: Category[] = ['secret', 'personal', 'network']

function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={!text}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
      {copied ? done : label}
    </button>
  )
}

function Pane({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="pane">
      <header className="pane-head">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

export function App() {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const [input, setInput] = useState('')
  const [reply, setReply] = useState('')
  const [categories, setCategories] = useState<Category[]>(ALL)
  const [vault, setVault] = useState(() => new Vault())
  const t = STRINGS[lang]

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.title = t.title
    try {
      localStorage.setItem('mask:lang', lang)
    } catch {
      /* private window */
    }
  }, [lang, t.title])

  const result: MaskResult = useMemo(() => mask(input, vault, { categories }), [input, vault, categories])
  const restored = useMemo(() => vault.unmask(reply), [reply, vault, result])
  const counts = useMemo(() => {
    const m = new Map<string, { n: number; category: Category }>()
    for (const f of result.findings) m.set(f.label, { n: (m.get(f.label)?.n ?? 0) + 1, category: f.category })
    return [...m]
  }, [result])

  const toggle = (c: Category) => setCategories((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]))
  const ICONS: Record<Category, ReactNode> = { secret: <KeyRound aria-hidden size={16} />, personal: <User aria-hidden size={16} />, network: <Network aria-hidden size={16} /> }
  const NAMES: Record<Category, string> = { secret: t.secrets, personal: t.personal, network: t.network }

  return (
    <div className="page">
      <header className="top">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="40" height="40" />
          <div>
            <h1>{t.title}</h1>
            <p>{t.tagline}</p>
          </div>
        </div>
        <div role="radiogroup" aria-label="Language" className="langs">
          {LANGS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} onClick={() => setLangState(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      </header>

      <p className="trust">
        <Lock aria-hidden size={16} className="shrink-0" />
        {t.trust}
      </p>

      <div className="bar">
        <div className="toggles" role="group" aria-label={t.whatToMask}>
          {ALL.map((c) => (
            <button key={c} type="button" className="toggle" aria-pressed={categories.includes(c)} onClick={() => toggle(c)}>
              {ICONS[c]}
              {NAMES[c]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={() => setInput(example())}>
            <Sparkles aria-hidden size={16} />
            {t.example}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setInput('')
              setReply('')
              setVault(new Vault())
            }}
          >
            <Eraser aria-hidden size={16} />
            {t.forget}
          </button>
        </div>
      </div>

      <main className="grid-panes">
        <Pane title={t.yourPrompt}>
          <textarea dir="auto" aria-label={t.yourPrompt} value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.promptPlaceholder} spellCheck={false} />
        </Pane>
        <Pane title={t.safeToSend} action={<CopyButton text={input ? result.masked : ''} label={t.copy} done={t.copied} />}>
          <output dir="auto" className="out" data-testid="masked">
            {input ? result.masked : <span className="muted">{t.maskedEmpty}</span>}
          </output>
          <div className="chips" aria-live="polite" data-testid="counts">
            {counts.map(([label, { n, category }]) => (
              <span key={label} className="chip" data-category={category}>
                {label} × {n}
              </span>
            ))}
            {input && !counts.length && <span className="muted">{t.nothing}</span>}
          </div>
        </Pane>
        <Pane title={t.modelReply}>
          <textarea dir="auto" aria-label={t.modelReply} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t.replyPlaceholder} spellCheck={false} />
        </Pane>
        <Pane title={t.restored} action={<CopyButton text={reply ? restored : ''} label={t.copy} done={t.copied} />}>
          <output dir="auto" className="out" data-testid="restored">
            {reply ? restored : <span className="muted">{t.restoredEmpty}</span>}
          </output>
        </Pane>
      </main>
      <footer className="foot">{t.limits}</footer>
    </div>
  )
}
