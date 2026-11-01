// Time per rule on large and hostile inputs. Prompts are pasted by anyone, so no rule may go quadratic.
//   npm run build && node tools/rule-timing.mjs [file]
import { readFileSync } from 'node:fs'
import { RULES } from '../dist/index.js'

const file = process.argv[2]
const inputs = {
  ...(file ? { file: readFileSync(file, 'utf8') } : {}),
  letters: 'a'.repeat(200_000),
  'words with dots': 'abc.'.repeat(50_000),
  digits: '1'.repeat(200_000),
  'spaced digits': '12 '.repeat(70_000),
  hex: 'ab:'.repeat(70_000),
  'token keys': 'token '.repeat(35_000),
  'long key': `${'x'.repeat(100_000)}token${'x'.repeat(100_000)}`,
  brackets: '[['.repeat(100_000),
  'almost an email': `${'a.'.repeat(50_000)}@`,
  'almost a pem': `-----BEGIN PRIVATE KEY-----${'a'.repeat(200_000)}`,
}
let worst = 0
for (const [name, text] of Object.entries(inputs)) {
  const rows = []
  for (const rule of RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags)
    const t0 = performance.now()
    let m
    let n = 0
    while ((m = pattern.exec(text)) && n < 1_000_000) {
      if (m[0].length === 0) pattern.lastIndex++
      n++
    }
    const ms = performance.now() - t0
    rows.push([rule.id, Math.round(ms)])
    worst = Math.max(worst, ms)
  }
  rows.sort((a, b) => b[1] - a[1])
  console.log(`${name} (${(text.length / 1000).toFixed(0)} KB): ${rows.slice(0, 4).map(([r, ms]) => `${r} ${ms}ms`).join(', ')}`)
}
console.log(`worst: ${Math.round(worst)} ms`)
