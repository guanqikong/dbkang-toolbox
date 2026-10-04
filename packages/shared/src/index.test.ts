import { describe, expect, it } from 'vitest'
import { formatDuration, isBridgeContextMessage } from './index'

describe('shared helpers', () => {
  it('formats focus duration without exposing seconds', () => {
    expect(formatDuration(1052)).toBe('17 分钟')
    expect(formatDuration(7320)).toBe('2 小时 2 分钟')
  })

  it('recognises the Userscript bridge envelope', () => {
    expect(isBridgeContextMessage({ source: 'dbkang-userscript', type: 'DBKANG_CONTEXT' })).toBe(true)
    expect(isBridgeContextMessage({ source: 'unknown', type: 'DBKANG_CONTEXT' })).toBe(false)
  })
})

