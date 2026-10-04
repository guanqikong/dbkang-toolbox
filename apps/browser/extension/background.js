const ALLOWED_HOSTS = [
  /(^|\.)chaoxing\.com$/i,
  /(^|\.)chaoxing\.cn$/i,
  /^localhost$/i,
  /^127\.0\.0\.1$/,
]
const API_HOST = '__DBKANG_API_HOST__'

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'DBKANG_HTTP') return false
  let target
  try {
    target = new URL(message.url)
  } catch {
    sendResponse({ ok: false, text: '', error: '请求地址无效' })
    return false
  }
  const allowedHost = target.hostname === API_HOST || ALLOWED_HOSTS.some((rule) => rule.test(target.hostname))
  if (!['http:', 'https:'].includes(target.protocol) || !allowedHost) {
    sendResponse({ ok: false, text: '', error: '请求地址不在允许范围内' })
    return false
  }
  fetch(target.href, {
    method: message.method || 'GET',
    headers: message.headers,
    body: message.body,
    credentials: 'include',
    redirect: 'follow',
    cache: 'no-store',
  })
    .then(async (response) => {
      const text = await response.text()
      sendResponse({
        ok: response.ok,
        text,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      })
    })
    .catch((error) => sendResponse({ ok: false, text: '', error: String(error) }))
  return true
})
