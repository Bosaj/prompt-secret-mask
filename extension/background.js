// Background service worker for Prompt Secret Mask MV3 Extension
const state = {
  enabled: true,
  autoUnmaskResponses: true,
  maskedTotal: 0,
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set(state)
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PSM_RECORD_MASK') {
    state.maskedTotal += Number(msg.count || 0)
    chrome.storage.local.set({ maskedTotal: state.maskedTotal })
    sendResponse({ ok: true, maskedTotal: state.maskedTotal })
    return true
  }
  if (msg?.type === 'PSM_GET_STATE') {
    chrome.storage.local.get(['enabled', 'autoUnmaskResponses', 'maskedTotal'], (stored) => {
      sendResponse({
        ok: true,
        enabled: stored.enabled ?? state.enabled,
        autoUnmaskResponses: stored.autoUnmaskResponses ?? state.autoUnmaskResponses,
        maskedTotal: stored.maskedTotal ?? state.maskedTotal,
      })
    })
    return true
  }
  if (msg?.type === 'PSM_SET_STATE') {
    if (typeof msg.enabled === 'boolean') state.enabled = msg.enabled
    if (typeof msg.autoUnmaskResponses === 'boolean') state.autoUnmaskResponses = msg.autoUnmaskResponses
    chrome.storage.local.set({
      enabled: state.enabled,
      autoUnmaskResponses: state.autoUnmaskResponses,
    })
    sendResponse({ ok: true, ...state })
    return true
  }
  return false
})
