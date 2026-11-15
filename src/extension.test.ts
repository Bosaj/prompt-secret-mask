import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHAT_HOSTS,
  ChatSessionVault,
  createExtensionMessageHandler,
  detectChatHost,
} from './extension.js'

describe('Browser Extension for Chat UIs (#4)', () => {
  it('detects supported AI chat hosts accurately', () => {
    expect(detectChatHost('chatgpt.com')?.id).toBe('chatgpt')
    expect(detectChatHost('chat.openai.com')?.id).toBe('chatgpt')
    expect(detectChatHost('claude.ai')?.id).toBe('claude')
    expect(detectChatHost('gemini.google.com')?.id).toBe('gemini')
    expect(detectChatHost('www.perplexity.ai')?.id).toBe('perplexity')
    expect(detectChatHost('chat.mistral.ai')?.id).toBe('mistral')
    expect(detectChatHost('copilot.microsoft.com')?.id).toBe('copilot')
    expect(detectChatHost('example.com')).toBeNull()
    expect(CHAT_HOSTS.length).toBeGreaterThanOrEqual(6)
  })

  it('masks secrets in prompt drafts and restores them in assistant responses', () => {
    const session = new ChatSessionVault()
    const ghToken = `ghp_${'aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5'}`
    const draft = `Please debug my GitHub client using token ${ghToken} and email dev@company.ma`

    const maskedRes = session.maskPromptDraft(draft, 'chatgpt.com')
    expect(maskedRes.changed).toBe(true)
    expect(maskedRes.masked).not.toContain(ghToken)
    expect(maskedRes.masked).not.toContain('dev@company.ma')
    expect(maskedRes.vaultSize).toBe(2)

    const placeholder = maskedRes.findings[0]?.placeholder
    expect(placeholder).toBeTruthy()

    const aiReply = `Here is the curl command using ${placeholder} for your script.`
    const unmasked = session.unmaskResponseText(aiReply)
    expect(unmasked.changed).toBe(true)
    expect(unmasked.restored).toContain(ghToken)
  })

  it('respects per-host disable lists and extension message handler commands', () => {
    const session = new ChatSessionVault({ disabledHosts: ['claude.ai'] })
    const handler = createExtensionMessageHandler(session)
    const awsKey = 'AKIAIOSFODNN7EXAMPLE'

    // Disabled host should not mask
    const skipped = handler({
      type: 'MASK_PROMPT',
      text: `Key ${awsKey} for aws`,
      hostname: 'claude.ai',
    })
    expect(skipped.type === 'MASK_PROMPT' && skipped.changed).toBe(false)

    // Enabled host masks properly
    const applied = handler({
      type: 'MASK_PROMPT',
      text: `aws_access_key_id = ${awsKey}`,
      hostname: 'gemini.google.com',
    })
    expect(applied.type === 'MASK_PROMPT' && applied.changed).toBe(true)

    const stats = handler({ type: 'GET_VAULT_STATS' })
    expect(stats.type === 'GET_VAULT_STATS' && stats.vaultSize).toBe(1)

    const cleared = handler({ type: 'CLEAR_VAULT' })
    expect(cleared.type === 'CLEAR_VAULT' && cleared.vaultSize).toBe(0)
  })

  it('ships a valid Manifest V3 browser extension configuration', () => {
    const manifestPath = join(process.cwd(), 'extension', 'manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      manifest_version: number
      name: string
      version: string
      content_scripts: { matches: string[]; js: string[] }[]
    }
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.version).toBe('0.4.0')
    expect(manifest.content_scripts[0]?.matches).toContain('https://chatgpt.com/*')
    expect(manifest.content_scripts[0]?.matches).toContain('https://claude.ai/*')
    expect(manifest.content_scripts[0]?.matches).toContain('https://gemini.google.com/*')
  })
})
