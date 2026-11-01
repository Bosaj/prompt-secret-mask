import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { Vault } from './mask.js'
import { maskJson, SseUnmasker, startProxy } from './proxy.js'

const TOKEN = 'ghp' + '_' + 'a1B2'.repeat(9)
const servers: Server[] = []
afterEach(() => {
  for (const s of servers.splice(0)) s.close()
})

/** A stand-in for the provider: records what reached it and answers as told. */
async function fakeProvider(answer: (body: string) => { type: string; chunks: string[] }) {
  const seen: { url: string; body: string; auth: string | undefined }[] = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c: Buffer) => (body += c.toString()))
    req.on('end', async () => {
      seen.push({ url: req.url ?? '', body, auth: req.headers.authorization ?? (req.headers['x-api-key'] as string | undefined) })
      const { type, chunks } = answer(body)
      res.setHeader('content-type', type)
      for (const c of chunks) {
        res.write(c)
        await new Promise((r) => setTimeout(r, 1))
      }
      res.end()
    })
  })
  servers.push(server)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen }
}

async function proxyTo(upstream: string, vault = new Vault()) {
  const { server, port } = await startProxy({ port: 0, upstream, vault })
  servers.push(server)
  return `http://127.0.0.1:${port}`
}

const chat = (content: string) => JSON.stringify({ model: 'claude-x', max_tokens: 5, messages: [{ role: 'user', content }] })

describe('maskJson', () => {
  it('masks text fields and leaves structure', () => {
    const vault = new Vault()
    const { body, labels } = maskJson({ model: 'sk-looks-like-a-key-1234567890', messages: [{ role: 'user', content: [{ type: 'text', text: `key ${TOKEN}` }] }], metadata: { note: TOKEN } }, vault)
    const out = JSON.stringify(body)
    expect(out).not.toContain(TOKEN)
    expect(out).toContain('[[GITHUB_TOKEN_1]]')
    expect(out).toContain('sk-looks-like-a-key-1234567890') // the model field isn't prose
    expect(labels).toEqual(['GITHUB_TOKEN', 'GITHUB_TOKEN'])
  })
})

describe('proxy', () => {
  it('never lets the secret reach the provider, and restores it in the reply', async () => {
    const provider = await fakeProvider((body) => {
      const placeholder = /\[\[[A-Z_]+_\d+\]\]/.exec(body)?.[0] ?? ''
      return { type: 'application/json', chunks: [JSON.stringify({ content: [{ type: 'text', text: `I see ${placeholder}` }] })] }
    })
    const proxy = await proxyTo(provider.url)
    const res = await fetch(`${proxy}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'provider-key-stays' }, body: chat(`my token is ${TOKEN}`) })
    const reply = (await res.json()) as { content: { text: string }[] }
    expect(provider.seen[0]?.body).not.toContain(TOKEN)
    expect(provider.seen[0]?.body).toContain('[[GITHUB_TOKEN_1]]')
    expect(reply.content[0]?.text).toBe(`I see ${TOKEN}`)
  })

  it('passes the API key header through unchanged, and keeps the path', async () => {
    const provider = await fakeProvider(() => ({ type: 'application/json', chunks: ['{}'] }))
    const proxy = await proxyTo(provider.url)
    await fetch(`${proxy}/v1/messages?beta=true`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer abc123DEF456ghi789JKL012' }, body: chat('hello') })
    expect(provider.seen[0]?.auth).toBe('Bearer abc123DEF456ghi789JKL012')
    expect(provider.seen[0]?.url).toBe('/v1/messages?beta=true')
  })

  it('restores a placeholder split across streamed Anthropic events', async () => {
    const ev = (text: string, index = 0) => `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } })}\n\n`
    const provider = await fakeProvider(() => ({
      type: 'text/event-stream',
      chunks: [ev('use [[GITH'), ev('UB_TOKEN'), ev('_1]] now'), 'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n', 'data: {"type":"message_stop"}\n\n'],
    }))
    const proxy = await proxyTo(provider.url)
    const res = await fetch(`${proxy}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: chat(`t ${TOKEN}`) })
    const text = await res.text()
    const pieces = [...text.matchAll(/"text":"([^"]*)"/g)].map((m) => m[1]).join('')
    expect(pieces).toBe(`use ${TOKEN} now`)
    expect(text).toContain('content_block_stop')
    expect(text).toContain('message_stop')
    expect(text).not.toContain('[[GITH')
  })

  it('restores streamed OpenAI events, and an event cut in the middle', async () => {
    const ev = (content: string, finish: string | null = null) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: finish }] })}\n\n`
    const whole = ev('a [[GITHUB_TO') + ev('KEN_1]] b') + 'data: [DONE]\n\n'
    const provider = await fakeProvider(() => ({ type: 'text/event-stream', chunks: [whole.slice(0, 30), whole.slice(30, 75), whole.slice(75)] }))
    const proxy = await proxyTo(provider.url)
    const res = await fetch(`${proxy}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: chat(`t ${TOKEN}`) })
    const text = await res.text()
    expect([...text.matchAll(/"content":"([^"]*)"/g)].map((m) => m[1]).join('')).toBe(`a ${TOKEN} b`)
    expect(text.trim().endsWith('data: [DONE]')).toBe(true)
  })

  it('remembers placeholders across requests', async () => {
    const provider = await fakeProvider(() => ({ type: 'application/json', chunks: ['{}'] }))
    const proxy = await proxyTo(provider.url)
    for (let i = 0; i < 2; i++) await fetch(`${proxy}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: chat(`t ${TOKEN}`) })
    expect(provider.seen[1]?.body).toContain('[[GITHUB_TOKEN_1]]')
  })

  it('refuses a request it cannot inspect, rather than forwarding it', async () => {
    const provider = await fakeProvider(() => ({ type: 'application/json', chunks: ['{}'] }))
    const proxy = await proxyTo(provider.url)
    const res = await fetch(`${proxy}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: `{not json ${TOKEN}` })
    expect(res.status).toBe(400)
    expect(provider.seen).toHaveLength(0)
  })

  it('refuses a request for a non-local host name', async () => {
    const provider = await fakeProvider(() => ({ type: 'application/json', chunks: ['{}'] }))
    const { server, port } = await startProxy({ port: 0, upstream: provider.url })
    servers.push(server)
    const http = await import('node:http')
    const status = await new Promise<number>((resolve) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/v1/messages', method: 'POST', headers: { host: 'evil.example.com', 'content-type': 'application/json' } }, (r) => resolve(r.statusCode ?? 0))
      req.end(chat(`t ${TOKEN}`))
    })
    expect(status).toBe(403)
    expect(provider.seen).toHaveLength(0)
  })

  it('reports a provider it cannot reach without repeating the prompt', async () => {
    const proxy = await proxyTo('http://127.0.0.1:9')
    const res = await fetch(`${proxy}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: chat(`t ${TOKEN}`) })
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain(TOKEN)
  })
})

describe('SseUnmasker', () => {
  it('gives back text held at the very end of a stream', () => {
    const sse = new SseUnmasker(new Vault())
    const out = sse.push(`data: ${JSON.stringify({ delta: { text: 'value [' } })}\n\n`) + sse.flush()
    expect([...out.matchAll(/"text":"([^"]*)"/g)].map((m) => m[1]).join('')).toBe('value [')
  })

  it('keeps comments and non-JSON events', () => {
    const sse = new SseUnmasker(new Vault())
    expect(sse.push(': ping\n\n')).toBe(': ping\n\n')
    expect(sse.push('data: hello\n\n')).toBe('data: hello\n\n')
  })
})
