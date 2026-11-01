#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { mask, Vault } from './mask.js'
import { startProxy } from './proxy.js'
import type { Category } from './rules.js'

const HELP = `secret-mask: keep keys, tokens and personal data out of AI prompts

  secret-mask [file]            print the text with placeholders (reads stdin without a file)
  secret-mask scan <files...>   report what was found; exit 1 if anything was
  secret-mask proxy             local proxy for LLM SDKs: masks requests, restores replies

Options
  --categories <list>   secret,personal,network (default: all)
  --vault-out <file>    mask: also save the placeholder map, to restore later with --restore
  --restore <file>      put values back using a saved map
  --port <n>            proxy: port (default 8899)
  --upstream <url>      proxy: forward here (default: Anthropic or OpenAI, from the path)
  -h, --help            this help

Proxy use:
  secret-mask proxy
  ANTHROPIC_BASE_URL=http://127.0.0.1:8899 OPENAI_BASE_URL=http://127.0.0.1:8899/v1 your-app

The saved map holds the real values in plain text: treat it like the secrets themselves.`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    categories: { type: 'string' },
    'vault-out': { type: 'string' },
    restore: { type: 'string' },
    port: { type: 'string' },
    upstream: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

if (values.help) {
  console.log(HELP)
  process.exit(0)
}

const categories = values.categories?.split(',') as Category[] | undefined
const options = categories ? { categories } : {}
const command = positionals[0]

if (command === 'proxy') {
  const { port } = await startProxy({
    ...options,
    port: Number(values.port ?? 8899),
    ...(values.upstream ? { upstream: values.upstream } : {}),
    onMask: (count, labels) => console.error(`masked ${count}: ${labels.join(', ')}`),
  })
  console.error(`secret-mask proxy on http://127.0.0.1:${port}`)
} else if (command === 'scan') {
  const files = positionals.slice(1)
  if (!files.length) {
    console.error('secret-mask scan needs at least one file.')
    process.exit(2)
  }
  let total = 0
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const { findings } = mask(text, new Vault(), options)
    total += findings.length
    for (const f of findings) {
      const line = text.slice(0, f.start).split('\n').length
      // The value itself is never printed
      console.log(`${file}:${line}  ${f.category}  ${f.rule}`)
    }
  }
  console.error(`${total} found in ${files.length} file${files.length === 1 ? '' : 's'}.`)
  process.exit(total ? 1 : 0)
} else {
  const input = command ? readFileSync(command, 'utf8') : readFileSync(0, 'utf8')
  if (values.restore) {
    const saved = JSON.parse(readFileSync(values.restore, 'utf8')) as [string, string][]
    const map = new Map(saved)
    process.stdout.write(input.replace(/\[\[[A-Z0-9_]+_\d+\]\]/g, (p) => map.get(p) ?? p))
  } else {
    const vault = new Vault()
    const pairs: [string, string][] = []
    const { masked, findings } = mask(input, vault, options)
    for (const f of findings) pairs.push([f.placeholder, input.slice(f.start, f.end)])
    process.stdout.write(masked)
    if (values['vault-out']) writeFileSync(values['vault-out'], JSON.stringify(pairs, null, 2), { mode: 0o600 })
    console.error(`${findings.length} masked.`)
  }
}
