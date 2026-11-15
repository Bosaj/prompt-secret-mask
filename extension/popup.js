const vaultSizeEl = document.getElementById('vault-size')
const maskedTotalEl = document.getElementById('masked-total')
const enabledEl = document.getElementById('toggle-enabled')
const unmaskEl = document.getElementById('toggle-unmask')
const maskNowBtn = document.getElementById('btn-mask-now')
const clearBtn = document.getElementById('btn-clear')

function withActiveTab(fn) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0]
    if (tab?.id) fn(tab.id)
  })
}

chrome.runtime.sendMessage({ type: 'PSM_GET_STATE' }, (res) => {
  if (!res?.ok) return
  enabledEl.checked = Boolean(res.enabled)
  unmaskEl.checked = Boolean(res.autoUnmaskResponses)
  maskedTotalEl.textContent = String(res.maskedTotal ?? 0)
})

withActiveTab((tabId) => {
  chrome.tabs.sendMessage(tabId, { type: 'PSM_TAB_STATUS' }, (res) => {
    if (res?.ok) vaultSizeEl.textContent = String(res.vaultSize ?? 0)
  })
})

enabledEl.addEventListener('change', () => {
  chrome.runtime.sendMessage({ type: 'PSM_SET_STATE', enabled: enabledEl.checked })
})

unmaskEl.addEventListener('change', () => {
  chrome.runtime.sendMessage({ type: 'PSM_SET_STATE', autoUnmaskResponses: unmaskEl.checked })
})

maskNowBtn.addEventListener('click', () => {
  withActiveTab((tabId) => {
    chrome.tabs.sendMessage(tabId, { type: 'PSM_MASK_NOW' }, (res) => {
      if (res?.ok) vaultSizeEl.textContent = String(res.vaultSize ?? 0)
    })
  })
})

clearBtn.addEventListener('click', () => {
  withActiveTab((tabId) => {
    chrome.tabs.sendMessage(tabId, { type: 'PSM_CLEAR_TAB_VAULT' }, (res) => {
      if (res?.ok) vaultSizeEl.textContent = '0'
    })
  })
})
