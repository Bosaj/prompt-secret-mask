// Content script for AI Chat UIs (ChatGPT, Claude, Gemini, Perplexity, Mistral, Copilot)
;(() => {
  const vaultToPlaceholder = new Map()
  const vaultToValue = new Map()
  const counters = new Map()
  let enabled = true
  let autoUnmask = true

  const INLINE_RULES = [
    { label: 'GITHUB_TOKEN', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{82})\b/g },
    { label: 'OPENAI_KEY', pattern: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}\b|\bsk-proj-[A-Za-z0-9_-]{48,180}\b/g },
    { label: 'ANTHROPIC_KEY', pattern: /\bsk-ant-(?:api03|admin01)-[A-Za-z0-9_-]{80,120}\b/g },
    { label: 'GOOGLE_API_KEY', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
    { label: 'AWS_KEY', pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g },
    { label: 'SLACK_TOKEN', pattern: /\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[A-Za-z0-9]{24,36}\b/g },
    { label: 'STRIPE_KEY', pattern: /\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{24,99}\b/g },
    { label: 'JWT', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{16,}\b/g },
    { label: 'PRIVATE_KEY', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
    { label: 'EMAIL', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,18}\b/g },
  ]

  const PLACEHOLDER_RE = /\[\[[A-Z0-9_]+_\d+\]\]/g

  function addSecret(label, value) {
    if (vaultToPlaceholder.has(value)) return vaultToPlaceholder.get(value)
    const next = (counters.get(label) || 0) + 1
    counters.set(label, next)
    const token = `[[${label}_${next}]]`
    vaultToPlaceholder.set(value, token)
    vaultToValue.set(token, value)
    return token
  }

  function maskText(input) {
    if (!enabled || !input) return { masked: input, count: 0 }
    let out = input
    let count = 0
    for (const rule of INLINE_RULES) {
      out = out.replace(rule.pattern, (match) => {
        count += 1
        return addSecret(rule.label, match)
      })
    }
    return { masked: out, count }
  }

  function unmaskText(input) {
    if (!enabled || !autoUnmask || vaultToValue.size === 0 || !input) return input
    return input.replace(PLACEHOLDER_RE, (token) => vaultToValue.get(token) || token)
  }

  function getActiveComposer() {
    const el = document.activeElement
    if (el && (el.tagName === 'TEXTAREA' || el.getAttribute('contenteditable') === 'true')) {
      return el
    }
    return (
      document.querySelector('#prompt-textarea') ||
      document.querySelector('div.ProseMirror[contenteditable="true"]') ||
      document.querySelector('rich-textarea div[contenteditable="true"]') ||
      document.querySelector('textarea')
    )
  }

  function maskComposerElement(composer) {
    if (!composer || !enabled) return 0
    if (composer.tagName === 'TEXTAREA') {
      const { masked, count } = maskText(composer.value)
      if (count > 0 && masked !== composer.value) {
        composer.value = masked
        composer.dispatchEvent(new Event('input', { bubbles: true }))
      }
      return count
    }
    if (composer.getAttribute('contenteditable') === 'true') {
      const original = composer.innerText || composer.textContent || ''
      const { masked, count } = maskText(original)
      if (count > 0 && masked !== original) {
        composer.textContent = masked
        composer.dispatchEvent(new InputEvent('input', { bubbles: true, data: masked }))
      }
      return count
    }
    return 0
  }

  // Mask before Enter (without Shift) or Send button click
  document.addEventListener(
    'keydown',
    (e) => {
      if (!enabled) return
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        const count = maskComposerElement(getActiveComposer())
        if (count > 0 && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: 'PSM_RECORD_MASK', count })
        }
      }
    },
    true,
  )

  document.addEventListener(
    'click',
    (e) => {
      if (!enabled) return
      const btn = e.target?.closest?.('button')
      if (!btn) return
      const label = (btn.getAttribute('aria-label') || btn.getAttribute('data-testid') || '').toLowerCase()
      if (label.includes('send') || label.includes('submit') || btn.type === 'submit') {
        const count = maskComposerElement(getActiveComposer())
        if (count > 0 && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: 'PSM_RECORD_MASK', count })
        }
      }
    },
    true,
  )

  // Restore placeholders in assistant responses via MutationObserver
  const observer = new MutationObserver((mutations) => {
    if (!enabled || !autoUnmask || vaultToValue.size === 0) return
    for (const m of mutations) {
      const root = m.target
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let node
      while ((node = walker.nextNode())) {
        const parent = node.parentElement
        if (!parent || parent.closest('textarea, [contenteditable="true"]')) continue
        const val = node.nodeValue
        if (val && val.includes('[[')) {
          const restored = unmaskText(val)
          if (restored !== val) node.nodeValue = restored
        }
      }
    }
  })

  if (document.body) {
    observer.observe(document.body, { childList: true, characterData: true, subtree: true })
  }

  chrome?.runtime?.onMessage?.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'PSM_MASK_NOW') {
      const count = maskComposerElement(getActiveComposer())
      sendResponse({ ok: true, count, vaultSize: vaultToValue.size })
      return true
    }
    if (msg?.type === 'PSM_TAB_STATUS') {
      sendResponse({ ok: true, vaultSize: vaultToValue.size, hostname: location.hostname })
      return true
    }
    if (msg?.type === 'PSM_CLEAR_TAB_VAULT') {
      vaultToPlaceholder.clear()
      vaultToValue.clear()
      counters.clear()
      sendResponse({ ok: true, vaultSize: 0 })
      return true
    }
    return false
  })
})()
