/// <reference types="vite/client" />

declare const __DBKANG_API_BASE_URL__: string
declare const __DBKANG_TOOLBOX_URL__: string

interface GMXmlHttpRequestResponse {
  status: number
  responseText: string
}

interface GMXmlHttpRequestOptions {
  method: string
  url: string
  headers?: Record<string, string>
  data?: string
  onload: (response: GMXmlHttpRequestResponse) => void
  onerror: () => void
  ontimeout?: () => void
  timeout?: number
}

declare const GM_xmlhttpRequest: ((options: GMXmlHttpRequestOptions) => void) | undefined

interface DBKangExtensionResponse {
  ok: boolean
  text: string
  error?: string
}

declare const chrome: {
  runtime?: {
    id?: string
    sendMessage(message: unknown): Promise<DBKangExtensionResponse>
  }
}
