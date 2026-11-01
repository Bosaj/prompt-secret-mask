// How noisy is it? Scans text that should hold no secrets, the documentation and source of the npm
// packages in node_modules, and counts what it finds per rule. A rule that fires often here is too loose.
//   npm run build && npm run fp
import { globSync, readFileSync, statSync } from 'node:fs'
import { mask, Vault } from '../dist/index.js'

const root = process.env.ROOT ?? 'node_modules'
const files = [...globSync(`${root}/**/*.md`), ...globSync(`${root}/*/dist/*.js`).slice(0, 300)].filter((f) => {
  try {
    return statSync(f).size < 2_000_000
  } catch {
    return false
  }
})
const counts = new Map()
const samples = new Map()
let bytes = 0
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  bytes += text.length
  for (const hit of mask(text, new Vault()).findings) {
    counts.set(hit.rule, (counts.get(hit.rule) ?? 0) + 1)
    if (process.env.SHOW && hit.rule === process.env.SHOW && (samples.get(hit.rule)?.length ?? 0) < 25) {
      samples.set(hit.rule, [...(samples.get(hit.rule) ?? []), `${f.slice(13, 60)}: ${text.slice(Math.max(0, hit.start - 30), hit.end + 10).replace(/\s+/g, ' ')}`])
    }
  }
}
console.log(`${files.length} files, ${(bytes / 1e6).toFixed(1)} MB`)
for (const [rule, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(6), rule)
for (const list of samples.values()) console.log(list.join('\n'))
