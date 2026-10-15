export interface RuntimeServiceConfig {
  apiBaseUrl: string
  toolboxUrl: string
}

export interface ResolveRuntimeServiceOptions {
  localBaseUrl: string
  fallbackBaseUrl: string
  localToolboxUrl: string
  fallbackToolboxUrl: string
  probeHealth: (healthUrl: string) => Promise<boolean>
}

/** Select a reachable service, preferring the local server over the public fallback. */
export async function resolveRuntimeService(
  options: ResolveRuntimeServiceOptions,
): Promise<RuntimeServiceConfig> {
  const candidates = [
    { apiBaseUrl: trimTrailingSlash(options.localBaseUrl), toolboxUrl: trimTrailingSlash(options.localToolboxUrl) },
    { apiBaseUrl: trimTrailingSlash(options.fallbackBaseUrl), toolboxUrl: trimTrailingSlash(options.fallbackToolboxUrl) },
  ]
  const checked = new Set<string>()

  for (const candidate of candidates) {
    if (checked.has(candidate.apiBaseUrl)) continue
    checked.add(candidate.apiBaseUrl)
    try {
      if (await options.probeHealth(`${candidate.apiBaseUrl}/health`)) return candidate
    } catch {
      // Try the next configured service.
    }
  }

  throw new Error('本地与公网 DBKang 服务都无法连接')
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}
