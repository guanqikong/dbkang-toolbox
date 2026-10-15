import { describe, expect, it, vi } from 'vitest'
import { resolveRuntimeService } from './runtime-service'

const config = {
  localBaseUrl: 'http://localhost:8000/',
  fallbackBaseUrl: 'https://toolbox.example.com/',
  localToolboxUrl: 'http://localhost:8000/toolbox/',
  fallbackToolboxUrl: 'https://toolbox.example.com/toolbox/',
}

describe('resolveRuntimeService', () => {
  it('prefers the local server when its health check succeeds', async () => {
    const probeHealth = vi.fn(async (url: string) => url.startsWith('http://localhost'))

    await expect(resolveRuntimeService({ ...config, probeHealth })).resolves.toEqual({
      apiBaseUrl: 'http://localhost:8000',
      toolboxUrl: 'http://localhost:8000/toolbox',
    })
    expect(probeHealth).toHaveBeenCalledTimes(1)
    expect(probeHealth).toHaveBeenCalledWith('http://localhost:8000/health')
  })

  it('uses the public server when the local health check fails', async () => {
    const probeHealth = vi.fn(async (url: string) => url.startsWith('https://'))

    await expect(resolveRuntimeService({ ...config, probeHealth })).resolves.toEqual({
      apiBaseUrl: 'https://toolbox.example.com',
      toolboxUrl: 'https://toolbox.example.com/toolbox',
    })
    expect(probeHealth).toHaveBeenCalledTimes(2)
  })

  it('checks a shared local and public URL only once', async () => {
    const probeHealth = vi.fn(async () => false)

    await expect(resolveRuntimeService({
      ...config,
      fallbackBaseUrl: 'http://localhost:8000',
      probeHealth,
    })).rejects.toThrow('本地与公网 DBKang 服务都无法连接')
    expect(probeHealth).toHaveBeenCalledTimes(1)
  })

  it('continues to the public server when a health check throws', async () => {
    const probeHealth = vi.fn(async (url: string) => {
      if (url.startsWith('http://localhost')) throw new Error('offline')
      return true
    })

    await expect(resolveRuntimeService({ ...config, probeHealth })).resolves.toEqual({
      apiBaseUrl: 'https://toolbox.example.com',
      toolboxUrl: 'https://toolbox.example.com/toolbox',
    })
  })
})
