import { describe, expect, it } from 'vitest'
import { DEFAULT_NATIVE_LOOK, formatDuration, isBridgeContextMessage, isBridgeLookMessage } from './index'

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

describe('isBridgeLookMessage', () => {
  const payload = DEFAULT_NATIVE_LOOK

  it('accepts a complete native look payload', () => {
    expect(
      isBridgeLookMessage({ source: 'dbkang-userscript', type: 'DBKANG_NATIVE_LOOK', payload }),
    ).toBe(true)
  })

  it('rejects the wrong envelope', () => {
    expect(isBridgeLookMessage({ source: 'dbkang-toolbox', type: 'DBKANG_NATIVE_LOOK', payload }))
      .toBe(false)
    expect(isBridgeLookMessage({ source: 'dbkang-userscript', type: 'DBKANG_CONTEXT', payload }))
      .toBe(false)
  })

  it('rejects a partial payload so CSS variables are never left half written', () => {
    const { color, ...partial } = payload
    expect(color).toBeTruthy()
    expect(isBridgeLookMessage({ source: 'dbkang-userscript', type: 'DBKANG_NATIVE_LOOK', payload: partial }))
      .toBe(false)
  })

  it('rejects non-string or empty measurements', () => {
    expect(
      isBridgeLookMessage({
        source: 'dbkang-userscript',
        type: 'DBKANG_NATIVE_LOOK',
        payload: { ...payload, fontSize: '' },
      }),
    ).toBe(false)
    expect(
      isBridgeLookMessage({
        source: 'dbkang-userscript',
        type: 'DBKANG_NATIVE_LOOK',
        payload: { ...payload, fontSize: 14 },
      }),
    ).toBe(false)
  })
})