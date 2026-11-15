import { mask, Vault, type Finding, type MaskOptions } from './mask.js'
import type { Category } from './rules.js'

export interface ChatHostProfile {
  id: string
  name: string
  hostnames: string[]
  composerSelectors: string[]
  sendButtonSelectors: string[]
  responseSelectors: string[]
}

export const CHAT_HOSTS: readonly ChatHostProfile[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    hostnames: ['chatgpt.com', 'chat.openai.com'],
    composerSelectors: ['#prompt-textarea', 'textarea[data-id]', 'div[contenteditable="true"]#prompt-textarea'],
    sendButtonSelectors: ['button[data-testid="send-button"]', 'button[aria-label*="Send"]'],
    responseSelectors: ['[data-message-author-role="assistant"]', '.markdown.prose'],
  },
  {
    id: 'claude',
    name: 'Claude',
    hostnames: ['claude.ai'],
    composerSelectors: ['div.ProseMirror[contenteditable="true"]', 'fieldset div[contenteditable="true"]'],
    sendButtonSelectors: ['button[aria-label="Send Message"]', 'button[aria-label*="Send"]'],
    responseSelectors: ['[data-is-streaming]', '.font-claude-message', '.font-claude-response'],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    hostnames: ['gemini.google.com'],
    composerSelectors: ['rich-textarea div[contenteditable="true"]', 'div.ql-editor[contenteditable="true"]'],
    sendButtonSelectors: ['button.send-button', 'button[aria-label*="Send"]'],
    responseSelectors: ['message-content', '.model-response-text'],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    hostnames: ['www.perplexity.ai', 'perplexity.ai'],
    composerSelectors: ['textarea[placeholder*="Ask"]', 'div[contenteditable="true"]'],
    sendButtonSelectors: ['button[aria-label="Submit"]', 'button[type="submit"]'],
    responseSelectors: ['.prose', '[data-testid="answer-card"]'],
  },
  {
    id: 'mistral',
    name: 'Le Chat (Mistral)',
    hostnames: ['chat.mistral.ai'],
    composerSelectors: ['textarea', 'div[contenteditable="true"]'],
    sendButtonSelectors: ['button[type="submit"]'],
    responseSelectors: ['.prose', '[data-message-role="assistant"]'],
  },
  {
    id: 'copilot',
    name: 'Microsoft Copilot',
    hostnames: ['copilot.microsoft.com'],
    composerSelectors: ['textarea#userInput', 'textarea'],
    sendButtonSelectors: ['button[aria-label*="Submit"]', 'button[type="submit"]'],
    responseSelectors: ['[data-content="ai-message"]', '.ac-textBlock'],
  },
]

export function detectChatHost(hostname: string): ChatHostProfile | null {
  const normalized = hostname.trim().toLowerCase()
  for (const profile of CHAT_HOSTS) {
    if (profile.hostnames.some((h) => normalized === h || normalized.endsWith(`.${h}`))) {
      return profile
    }
  }
  return null
}

export interface MaskDraftResult {
  masked: string
  changed: boolean
  findings: Finding[]
  vaultSize: number
}

export interface ExtensionConfig {
  enabled: boolean
  autoUnmaskResponses: boolean
  categories: Category[]
  disabledRules: string[]
  disabledHosts: string[]
}

export const DEFAULT_EXTENSION_CONFIG: ExtensionConfig = {
  enabled: true,
  autoUnmaskResponses: true,
  categories: ['secret', 'personal', 'network'],
  disabledRules: [],
  disabledHosts: [],
}

/**
 * Manages secret masking and response restoration for a browser chat session.
 * All secret-to-placeholder mappings stay strictly in memory inside the tab/session.
 */
export class ChatSessionVault {
  private readonly vault = new Vault()
  private config: ExtensionConfig
  private totalMaskedCount = 0
  private lastFindings: Finding[] = []

  constructor(config: Partial<ExtensionConfig> = {}) {
    this.config = {
      ...DEFAULT_EXTENSION_CONFIG,
      ...config,
      categories: config.categories ?? [...DEFAULT_EXTENSION_CONFIG.categories],
      disabledRules: config.disabledRules ?? [...DEFAULT_EXTENSION_CONFIG.disabledRules],
      disabledHosts: config.disabledHosts ?? [...DEFAULT_EXTENSION_CONFIG.disabledHosts],
    }
  }

  getConfig(): ExtensionConfig {
    return {
      ...this.config,
      categories: [...this.config.categories],
      disabledRules: [...this.config.disabledRules],
      disabledHosts: [...this.config.disabledHosts],
    }
  }

  updateConfig(patch: Partial<ExtensionConfig>): ExtensionConfig {
    this.config = {
      ...this.config,
      ...patch,
      categories: patch.categories ? [...patch.categories] : this.config.categories,
      disabledRules: patch.disabledRules ? [...patch.disabledRules] : this.config.disabledRules,
      disabledHosts: patch.disabledHosts ? [...patch.disabledHosts] : this.config.disabledHosts,
    }
    return this.getConfig()
  }

  isHostEnabled(hostname: string): boolean {
    if (!this.config.enabled) return false
    const normalized = hostname.trim().toLowerCase()
    return !this.config.disabledHosts.some((h) => normalized === h.toLowerCase())
  }

  maskPromptDraft(text: string, hostname?: string): MaskDraftResult {
    if (!text || (hostname && !this.isHostEnabled(hostname)) || !this.config.enabled) {
      return { masked: text, changed: false, findings: [], vaultSize: this.vault.size }
    }
    const options: MaskOptions = {
      categories: this.config.categories,
      disabled: this.config.disabledRules,
    }
    const result = mask(text, this.vault, options)
    if (result.findings.length > 0) {
      this.totalMaskedCount += result.findings.length
      this.lastFindings = result.findings
    }
    return {
      masked: result.masked,
      changed: result.masked !== text,
      findings: result.findings,
      vaultSize: this.vault.size,
    }
  }

  unmaskResponseText(text: string): { restored: string; changed: boolean } {
    if (!text || !this.config.enabled || !this.config.autoUnmaskResponses || this.vault.size === 0) {
      return { restored: text, changed: false }
    }
    const restored = this.vault.unmask(text)
    return { restored, changed: restored !== text }
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      autoUnmaskResponses: this.config.autoUnmaskResponses,
      vaultSize: this.vault.size,
      totalMaskedCount: this.totalMaskedCount,
      lastFindings: [...this.lastFindings],
    }
  }

  clear() {
    this.vault.clear()
    this.totalMaskedCount = 0
    this.lastFindings = []
  }
}

export type ExtensionRequest =
  | { type: 'MASK_PROMPT'; text: string; hostname?: string }
  | { type: 'UNMASK_TEXT'; text: string }
  | { type: 'GET_VAULT_STATS' }
  | { type: 'CLEAR_VAULT' }
  | { type: 'UPDATE_CONFIG'; patch: Partial<ExtensionConfig> }

export type ExtensionResponse =
  | ({ ok: true; type: 'MASK_PROMPT' } & MaskDraftResult)
  | { ok: true; type: 'UNMASK_TEXT'; restored: string; changed: boolean }
  | ({ ok: true; type: 'GET_VAULT_STATS' } & ReturnType<ChatSessionVault['getStats']>)
  | { ok: true; type: 'CLEAR_VAULT'; vaultSize: number }
  | { ok: true; type: 'UPDATE_CONFIG'; config: ExtensionConfig }

export function createExtensionMessageHandler(session: ChatSessionVault) {
  return (request: ExtensionRequest): ExtensionResponse => {
    switch (request.type) {
      case 'MASK_PROMPT':
        return {
          ok: true,
          type: 'MASK_PROMPT',
          ...session.maskPromptDraft(request.text, request.hostname),
        }
      case 'UNMASK_TEXT':
        return {
          ok: true,
          type: 'UNMASK_TEXT',
          ...session.unmaskResponseText(request.text),
        }
      case 'GET_VAULT_STATS':
        return {
          ok: true,
          type: 'GET_VAULT_STATS',
          ...session.getStats(),
        }
      case 'CLEAR_VAULT':
        session.clear()
        return {
          ok: true,
          type: 'CLEAR_VAULT',
          vaultSize: 0,
        }
      case 'UPDATE_CONFIG':
        return {
          ok: true,
          type: 'UPDATE_CONFIG',
          config: session.updateConfig(request.patch),
        }
    }
  }
}
