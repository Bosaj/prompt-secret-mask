import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mask, StreamUnmasker, Vault, type MaskOptions } from './mask.js'

/**
 * A local reverse proxy for LLM SDKs. Point the SDK's base URL here: secrets in the request are masked
 * before they leave the machine, and restored in the reply, including streamed replies. API keys in
 * the request headers pass through untouched, since the provider needs them. It listens on loopback
 * only, and never logs a value.
 */

const MAX_BODY = 64 * 1024 * 1024
/** Fields that carry structure or binary data, not text a person wrote. */
const SKIP_KEYS = new Set(['model', 'role', 'type', 'id', 'tool_use_id', 'tool_call_id', 'media_type', 'data', 'stop_reason', 'name', 'object', 'cache_control', 'encoding_format'])
/** Fields that carry streamed text in Anthropic and OpenAI events. */
const STREAM_TEXT_KEYS = new Set(['text', 'content', 'partial_json', 'arguments', 'thinking', 'delta', 'output_text', 'refusal'])

export interface ProxyOptions extends MaskOptions {
  port?: number
  /** Where to forward. Default: chosen from the path (Anthropic for /v1/messages, otherwise OpenAI). */
  upstream?: string
  vault?: Vault
  onMask?: (count: number, labels: string[]) => void
}

const defaultUpstream = (path: string) => (path.startsWith('/v1/messages') ? 'https://api.anthropic.com' : 'https://api.openai.com')

function walkStrings(value: unknown, change: (s: string, key: string | null) => string, key: string | null = null): unknown {
  if (typeof value === 'string') return change(value, key)
  if (Array.isArray(value)) return value.map((v) => walkStrings(v, change, key))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = SKIP_KEYS.has(k) && typeof v === 'string' ? v : walkStrings(v, change, k)
    return out
  }
  return value
}

export function maskJson(body: unknown, vault: Vault, options: MaskOptions = {}): { body: unknown; labels: string[] } {
  const labels: string[] = []
  const masked = walkStrings(body, (s) => {
    const r = mask(s, vault, options)
    labels.push(...r.findings.map((f) => f.label))
    return r.masked
  })
  return { body: masked, labels }
}

/** Restores values in server-sent events, keeping each text field's split placeholders apart. */
export class SseUnmasker {
  private buffer = ''
  private readonly streams = new Map<string, { unmasker: StreamUnmasker; template: unknown; path: (string | number)[] }>()
  private readonly vault: Vault

  constructor(vault: Vault) {
    this.vault = vault
  }

  private rewrite(event: unknown): unknown {
    const blockIndex = (event as { index?: unknown })?.index
    const visit = (node: unknown, path: (string | number)[]): unknown => {
      if (Array.isArray(node)) return node.map((v, i) => visit(v, [...path, i]))
      if (node && typeof node === 'object') {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(node)) {
          if (typeof v === 'string' && STREAM_TEXT_KEYS.has(k)) {
            const key = `${String(blockIndex ?? '')}:${[...path, k].join('.')}`
            let stream = this.streams.get(key)
            if (!stream) {
              stream = { unmasker: new StreamUnmasker(this.vault), template: event, path: [...path, k] }
              this.streams.set(key, stream)
            }
            stream.template = event
            out[k] = stream.unmasker.push(v)
          } else out[k] = visit(v, [...path, k])
        }
        return out
      }
      return node
    }
    return visit(event, [])
  }

  /** Emit what was held back, as a last event of the same shape, before a stream or block closes. */
  private drain(): string {
    let out = ''
    for (const stream of this.streams.values()) {
      const rest = stream.unmasker.flush()
      if (!rest) continue
      const copy = JSON.parse(JSON.stringify(stream.template)) as Record<string | number, unknown>
      let node: Record<string | number, unknown> = copy
      stream.path.slice(0, -1).forEach((p) => {
        node = node[p] as Record<string | number, unknown>
      })
      node[stream.path.at(-1)!] = rest
      out += `data: ${JSON.stringify(copy)}\n\n`
    }
    return out
  }

  /** Feed raw bytes as text; get back the text to forward. */
  push(chunk: string): string {
    this.buffer += chunk
    let out = ''
    let end: number
    while ((end = this.buffer.indexOf('\n\n')) >= 0) {
      const block = this.buffer.slice(0, end)
      this.buffer = this.buffer.slice(end + 2)
      out += this.processBlock(block)
    }
    return out
  }

  flush(): string {
    const rest = this.buffer ? this.processBlock(this.buffer) : ''
    this.buffer = ''
    return rest + this.drain()
  }

  private processBlock(block: string): string {
    const lines = block.split('\n')
    const dataLine = lines.findIndex((l) => l.startsWith('data:'))
    if (dataLine < 0) return `${block}\n\n`
    const data = lines[dataLine]!.slice(5).trim()
    if (data === '[DONE]') return `${this.drain()}${block}\n\n`
    let event: { type?: string; choices?: { finish_reason?: unknown }[] }
    try {
      event = JSON.parse(data) as typeof event
    } catch {
      return `${this.vault.unmask(block)}\n\n`
    }
    const closing = event.type === 'content_block_stop' || event.type === 'message_stop' || event.choices?.some((c) => c.finish_reason)
    const rewritten = this.rewrite(event)
    lines[dataLine] = `data: ${JSON.stringify(rewritten)}`
    const body = `${lines.join('\n')}\n\n`
    return closing ? `${this.drain()}${body}` : body
  }
}

const readBody = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) reject(new Error('body too large'))
      else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/
const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'transfer-encoding', 'keep-alive'])

async function handle(req: IncomingMessage, res: ServerResponse, options: ProxyOptions, vault: Vault) {
  // A web page can't reach this through DNS rebinding: only local Host names are served
  if (!LOCAL_HOST.test(req.headers.host ?? '')) {
    res.statusCode = 403
    res.end('forbidden')
    return
  }
  const raw = await readBody(req)
  let body: BodyInit | undefined = raw.length ? new Uint8Array(raw) : undefined
  const isJson = /json/.test(req.headers['content-type'] ?? '')
  if (isJson && raw.length) {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw.toString('utf8'))
    } catch {
      // Never forward what couldn't be inspected
      res.statusCode = 400
      res.end('request body is not valid JSON')
      return
    }
    const result = maskJson(parsed, vault, options)
    body = JSON.stringify(result.body)
    if (result.labels.length) options.onMask?.(result.labels.length, [...new Set(result.labels)])
  } else if (raw.length && !isJson && (req.headers['content-type'] ?? '').startsWith('text/')) {
    body = mask(raw.toString('utf8'), vault, options).masked
  }

  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k) && typeof v === 'string') headers.set(k, v)
  }
  const url = new URL(req.url ?? '/', options.upstream ?? defaultUpstream(req.url ?? '/'))
  const upstream = await fetch(url, { method: req.method ?? 'POST', headers, ...(body !== undefined ? { body } : {}) })

  res.statusCode = upstream.status
  upstream.headers.forEach((v, k) => {
    if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(k)) res.setHeader(k, v)
  })
  const type = upstream.headers.get('content-type') ?? ''
  if (!upstream.body) {
    res.end()
    return
  }
  if (type.includes('text/event-stream')) {
    const sse = new SseUnmasker(vault)
    const decoder = new TextDecoder()
    for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
      const out = sse.push(decoder.decode(chunk, { stream: true }))
      if (out) res.write(out)
    }
    const rest = sse.flush()
    if (rest) res.write(rest)
    res.end()
    return
  }
  const text = await upstream.text()
  res.end(type.includes('json') || type.startsWith('text/') ? vault.unmask(text) : text)
}

/** Start the proxy. Returns the server and the port it took. */
export function startProxy(options: ProxyOptions = {}): Promise<{ server: Server; port: number; vault: Vault }> {
  const vault = options.vault ?? new Vault()
  const server = createServer((req, res) => {
    handle(req, res, options, vault).catch((err: Error) => {
      // The message can't hold a value from the prompt: only network and size errors reach here
      if (!res.headersSent) res.statusCode = 502
      res.end(`proxy error: ${err.message.slice(0, 200)}`)
    })
  })
  return new Promise((resolve) => {
    server.listen(options.port ?? 8899, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as AddressInfo).port, vault })
    })
  })
}
